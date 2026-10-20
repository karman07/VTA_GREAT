"""
rag_engine.py — Per-teacher RAG using Gemini + embedded Qdrant
"""
import os, re, io, json, time, asyncio, base64, hashlib, logging, tempfile
from typing import Optional
from config import get_settings
from document_parser import parse_document
from gemini_client import GeminiClient

logger = logging.getLogger(__name__)
CHUNK_SIZE = 800
CHUNK_OVERLAP = 100
VISION_PROMPT = (
    "You are extracting visual knowledge for RAG. "
    "Return a concise summary in under 120 words. "
    "Include: visible text/labels, chart/table type, main trend or relationship, and key values if clearly readable. "
    "Avoid repetition and avoid speculation."
)


class RAGEngine:
    def __init__(self):
        cfg = get_settings()
        self.gpu = GeminiClient(
            cfg.gemini_api_key, cfg.gemini_base_url, cfg.llm_model_name, cfg.vision_model_name,
            cfg.embed_model_name, cfg.embed_dim, cfg.rerank_model_name, cfg.qdrant_path,
        )
        self._retrieve_k = cfg.retrieve_k
        self._final_k = cfg.final_k
        self._uploads_root = cfg.uploads_root
        self._pdf_max_pages = cfg.pdf_max_pages
        self._pdf_max_images_per_page = cfg.pdf_max_images_per_page
        self._pdf_min_image_area = cfg.pdf_min_image_area
        self._pdf_vision_concurrency = cfg.pdf_vision_concurrency
        logger.info("RAGEngine initialised — Gemini mode")

    # ── Chunking ──────────────────────────────────────────────────────────

    def _chunk_text(self, text: str, min_len: int = 50) -> list[str]:
        text = re.sub(r'\n{3,}', '\n\n', text)
        chunks, start = [], 0
        while start < len(text):
            end = min(start + CHUNK_SIZE, len(text))
            chunk = text[start:end].strip()
            if chunk and len(chunk) >= min_len:
                chunks.append(chunk)
            start += CHUNK_SIZE - CHUNK_OVERLAP
        if not chunks and text.strip():
            chunks.append(text.strip())
        return chunks

    def _find_y_offset(self, chunk: str, unit: dict) -> float:
        blocks = unit.get("text_blocks_pos", [])
        if not blocks:
            return 0.0
        chunk_head = re.sub(r"^\[(Source|Classification):[^\]]+\]\s*", "", chunk[:200], flags=re.IGNORECASE)
        chunk_words = set(re.findall(r"[a-z0-9']{3,}", chunk_head.lower()))
        if not chunk_words:
            return 0.0
        best_y, best_score = 0.0, 0
        for y_norm, blk_text in blocks:
            blk_words = set(re.findall(r"[a-z0-9']{3,}", blk_text.lower()))
            score = len(chunk_words & blk_words)
            if score > best_score:
                best_score = score
                best_y = y_norm
        return round(best_y, 4) if best_score >= 2 else 0.0

    # ── Vision helpers ────────────────────────────────────────────────────

    async def _describe_image_file(self, file_path: str, mime_type: str) -> str:
        logger.info(f"[vision] describing {mime_type} at {file_path}")
        try:
            with open(file_path, "rb") as f:
                data = f.read()
            return await self.gpu.describe_image(data, mime_type, VISION_PROMPT)
        except Exception as e:
            logger.error(f"[vision] failed: {e}")
            return ""

    async def _transcribe_audio(self, file_path: str) -> str:
        logger.info(f"[whisper] transcribing {file_path}")
        try:
            from faster_whisper import WhisperModel
            def _run():
                model = WhisperModel("base", compute_type="int8", device="cpu")
                segments, _ = model.transcribe(file_path, beam_size=5)
                lines = []
                for seg in segments:
                    m, s = divmod(int(seg.start), 60)
                    h, m = divmod(m, 60)
                    lines.append(f"[{h:02d}:{m:02d}:{s:02d}] {seg.text.strip()}")
                return "\n".join(lines)
            return await asyncio.to_thread(_run)
        except Exception as e:
            logger.error(f"[whisper] failed: {e}")
            return ""

    def _is_meaningful_image(self, image_bytes: bytes) -> bool:
        try:
            from PIL import Image, ImageStat
            img = Image.open(io.BytesIO(image_bytes)).convert("L")
            if img.size[0] * img.size[1] < self._pdf_min_image_area:
                return False
            extrema = img.getextrema()
            if float(extrema[1] - extrema[0]) < 16 or float(ImageStat.Stat(img).stddev[0]) < 8:
                return False
            return True
        except Exception:
            return True

    # ── PDF extraction ────────────────────────────────────────────────────

    async def _extract_pdf_image_unit(self, *, file_name, page_num, image_index, image_bytes, image_ext, vision_cache, semaphore):
        image_hash = hashlib.sha1(image_bytes).hexdigest()
        if image_hash in vision_cache:
            description = vision_cache[image_hash]
        else:
            suffix = f".{image_ext}" if image_ext else ".png"
            with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
                tmp.write(image_bytes)
                img_path = tmp.name
            try:
                mime = f"image/{image_ext}" if image_ext else "image/png"
                if image_ext == "jpg":
                    mime = "image/jpeg"
                async with semaphore:
                    description = await self._describe_image_file(img_path, mime)
                if description:
                    vision_cache[image_hash] = description
            finally:
                try:
                    os.remove(img_path)
                except Exception:
                    pass
        if not description:
            return None
        return {
            "kind": "pdf_image", "page": page_num, "image_index": image_index,
            "content": f"[Source: {file_name} (PDF)]\n[Classification: Image | Page {page_num} | Image {image_index}]\n{description}",
        }

    async def _extract_pdf_units(self, file_path: str, file_name: str) -> list[dict]:
        import fitz
        units, doc = [], fitz.open(file_path)
        total_pages = min(len(doc), self._pdf_max_pages)
        vision_cache, seen_hashes, image_tasks = {}, set(), []
        semaphore = asyncio.Semaphore(max(1, self._pdf_vision_concurrency))
        try:
            for page_idx in range(total_pages):
                page = doc[page_idx]
                page_num = page_idx + 1
                page_text = (page.get_text("text") or "").strip()
                page_height = max(1.0, float(page.rect.height))
                text_blocks_pos = []
                for blk in (page.get_text("blocks") or []):
                    if len(blk) >= 7 and int(blk[6]) == 0:
                        blk_text = (blk[4] or "").strip()
                        if blk_text:
                            text_blocks_pos.append((round(float(blk[1]) / page_height, 4), blk_text[:200]))
                if page_text:
                    units.append({"kind": "pdf_text", "page": page_num, "text_blocks_pos": text_blocks_pos,
                                  "content": f"[Source: {file_name} (PDF)]\n[Classification: Text | Page {page_num}]\n{page_text}"})
                page_dict = page.get_text("dict")
                candidates = []
                for img_idx, block in enumerate(page_dict.get("blocks", []), start=1):
                    if block.get("type") != 1:
                        continue
                    image_bytes = block.get("image")
                    if not image_bytes:
                        continue
                    bbox = block.get("bbox") or [0,0,0,0]
                    area = max((bbox[2]-bbox[0])*(bbox[3]-bbox[1]), int(block.get("width",0))*int(block.get("height",0)))
                    if area < self._pdf_min_image_area or not self._is_meaningful_image(image_bytes):
                        continue
                    ih = hashlib.sha1(image_bytes).hexdigest()
                    if ih in seen_hashes:
                        continue
                    seen_hashes.add(ih)
                    candidates.append((img_idx, image_bytes, (block.get("ext") or "png").lower(), area))
                candidates.sort(key=lambda x: x[3], reverse=True)
                for img_idx, ib, ie, _ in candidates[:self._pdf_max_images_per_page]:
                    image_tasks.append(self._extract_pdf_image_unit(
                        file_name=file_name, page_num=page_num, image_index=img_idx,
                        image_bytes=ib, image_ext=ie, vision_cache=vision_cache, semaphore=semaphore))
            if image_tasks:
                for item in await asyncio.gather(*image_tasks, return_exceptions=True):
                    if isinstance(item, Exception):
                        logger.warning(f"[ingest] PDF image task failed: {item}")
                    elif item:
                        units.append(item)
        finally:
            doc.close()
        return units

    # ── Ingest ────────────────────────────────────────────────────────────

    async def ingest_file(self, *, teacher_id, collection_name, file_id, file_path, file_name, is_assignment=False) -> dict:
        logger.info(f"[ingest] teacher={teacher_id} file={file_name}")
        ext = os.path.splitext(file_path)[1].lower()
        units: list[dict] = []

        if ext in ('.png','.jpg','.jpeg','.webp','.gif','.bmp','.tif','.tiff'):
            mime = f"image/{ext[1:]}" if ext != '.jpg' else "image/jpeg"
            desc = await self._describe_image_file(file_path, mime)
            units.append({"kind":"image","page":None,"content":f"[Source: {file_name} (Image)]\n[Classification: Image]\n{desc}"})
        elif ext in ('.mp4','.mov','.avi','.mkv','.webm'):
            desc = await self._transcribe_audio(file_path)
            units.append({"kind":"video","page":None,"content":f"[Source: {file_name} (Video)]\n[Classification: Video]\n{desc}"})
        elif ext in ('.mp3','.wav','.aac','.m4a'):
            desc = await self._transcribe_audio(file_path)
            units.append({"kind":"audio","page":None,"content":f"[Source: {file_name} (Audio)]\n[Classification: Audio]\n{desc}"})
        elif ext == '.pdf':
            units = await self._extract_pdf_units(file_path, file_name)
        elif ext == '.youtube':
            with open(file_path, "r") as f:
                url = f.read().strip()
            try:
                yt_desc = await asyncio.to_thread(self._get_yt_transcript, url, file_name)
            except Exception as e:
                logger.warning(f"[youtube] API failed: {e}. Falling back to audio download...")
                yt_desc = await self._youtube_audio_fallback(url, file_name)
            units.append({"kind":"youtube","page":None,"content":yt_desc})
        else:
            text = parse_document(file_path)
            units.append({"kind":"document_text","page":None,"content":f"[Source: {file_name}]\n[Classification: Text]\n{text}"})

        units = [u for u in units if (u.get("content") or "").strip()]
        if not units:
            raise ValueError(f"No extractable content in {file_name}")

        chunk_records = []
        for unit in units:
            if unit.get("kind") in ("image", "pdf_image"):
                chunk_records.append((unit["content"], unit))
            else:
                for chunk in self._chunk_text(unit["content"], min_len=50):
                    chunk_records.append((chunk, unit))
        if not chunk_records:
            raise ValueError(f"No chunkable content for {file_name}")

        logger.info(f"[ingest] {len(chunk_records)} chunks from '{file_name}'")
        await self.gpu.qdrant_ensure_collection(collection_name)

        # Embed and upsert in batches
        batch_size = 32
        for start in range(0, len(chunk_records), batch_size):
            batch = chunk_records[start:start+batch_size]
            texts = [c[0] for c in batch]
            embeddings = await self.gpu.embed(texts)
            points = []
            for j, ((chunk, unit), vector) in enumerate(zip(batch, embeddings)):
                idx = start + j
                points.append({
                    "id": hashlib.md5(f"{file_id}_chunk_{idx}".encode()).hexdigest()[:32],
                    "vector": vector,
                    "payload": {
                        "file_id": file_id, "file_name": file_name, "teacher_id": teacher_id,
                        "is_assignment": bool(is_assignment),
                        "content_type": unit.get("kind", "text"), "chunk_idx": idx,
                        "page": int(unit.get("page") or -1),
                        "image_index": int(unit.get("image_index") or -1),
                        "y_offset": self._find_y_offset(chunk, unit),
                        "document": chunk, "snippet": chunk[:200],
                    },
                })
            await self.gpu.qdrant_upsert(collection_name, points)

        logger.info(f"[ingest] {len(chunk_records)} chunks upserted for file {file_id}")
        return {"chunks_added": len(chunk_records), "file_id": file_id}

    def _get_yt_transcript(self, url, file_name):
        from youtube_transcript_api._api import YouTubeTranscriptApi
        from urllib.parse import urlparse, parse_qs
        parsed = urlparse(url)
        video_id = None
        if parsed.hostname == 'youtu.be':
            video_id = parsed.path[1:]
        elif parsed.hostname in ('www.youtube.com','youtube.com'):
            if parsed.path == '/watch':
                video_id = parse_qs(parsed.query).get('v',[None])[0]
            elif parsed.path.startswith(('/embed/','/v/')):
                video_id = parsed.path.split('/')[2]
        if not video_id:
            raise ValueError(f"Could not extract video ID from {url}")
        tl = YouTubeTranscriptApi.list_transcripts(video_id)
        try:
            t = tl.find_transcript(['en'])
        except Exception:
            t = list(tl)[0]
            if t.is_translatable:
                try: t = t.translate('en')
                except Exception: pass
        transcript = t.fetch()
        content = f"[Source: {file_name} (YouTube Video)]\n[Classification: YouTube Transcript]\n"
        for chunk in transcript:
            m, s = divmod(chunk['start'], 60)
            h, m = divmod(m, 60)
            content += f"[{int(h):02d}:{int(m):02d}:{int(s):02d}] {chunk['text']}\n"
        return content

    async def _youtube_audio_fallback(self, url, file_name):
        """No captions available: download audio with yt-dlp and transcribe locally."""
        def _download(tmpdir):
            import yt_dlp
            opts = {"format": "bestaudio/best", "outtmpl": os.path.join(tmpdir, "audio.%(ext)s"),
                    "quiet": True, "noplaylist": True}
            with yt_dlp.YoutubeDL(opts) as ydl:
                info = ydl.extract_info(url, download=True)
                return ydl.prepare_filename(info)
        try:
            with tempfile.TemporaryDirectory() as tmpdir:
                audio_path = await asyncio.to_thread(_download, tmpdir)
                transcript = await self._transcribe_audio(audio_path)
            if not transcript:
                return ""
            return f"[Source: {file_name} (YouTube Video)]\n[Classification: YouTube Transcript (Whisper)]\n{transcript}\n"
        except Exception as e:
            logger.error(f"[youtube] audio fallback failed: {e}")
            return ""

    # ── Delete ────────────────────────────────────────────────────────────

    async def delete_file_chunks(self, *, collection_name, file_id) -> dict:
        try:
            await self.gpu.qdrant_delete(collection_name, {
                "must": [{"key": "file_id", "match": {"value": file_id}}]
            })
            logger.info(f"[delete] chunks removed for file {file_id}")
            return {"deleted": True}
        except Exception as e:
            logger.warning(f"[delete] failed: {e}")
            return {"deleted": False}

    # ── Read back stored text (document viewer) ───────────────────────────

    async def get_file_chunks(self, *, collection_name, file_id) -> list[dict]:
        points = await self.gpu.qdrant_scroll(collection_name, {
            "must": [{"key": "file_id", "match": {"value": file_id}}]
        })
        rows = []
        for p in points:
            pl = p["payload"]
            page = int(pl.get("page", -1))
            rows.append({
                "idx": int(pl.get("chunk_idx", 0)),
                "page": page if page >= 0 else None,
                "kind": pl.get("content_type", "text"),
                "text": pl.get("document", ""),
            })
        rows.sort(key=lambda r: r["idx"])
        return rows

    # ── Query ─────────────────────────────────────────────────────────────

    _SCOPE_PATTERN = r"^\[Context:\s*Only answer from the file with id\s+([a-f0-9-]+)\]\s*"

    def _split_scope(self, question: str):
        m = re.match(self._SCOPE_PATTERN, question, flags=re.IGNORECASE)
        scoped = m.group(1) if m else None
        effective = re.sub(self._SCOPE_PATTERN, "", question, count=1, flags=re.IGNORECASE).strip() or question
        return scoped, effective

    async def retrieve(self, *, collection_name, question, scoped_file_id=None, top_k=None, rerank=True) -> dict:
        """Dense top-N search followed by optional reranking down to top_k.
        `reranked` is False when reranking was disabled or failed (the failure is reported, not hidden)."""
        top_k = top_k or self._final_k
        t0 = time.perf_counter()
        q_embedding = (await self.gpu.embed([question]))[0]
        t_embed = time.perf_counter()

        qfilter = {"must": [{"key": "file_id", "match": {"value": scoped_file_id}}]} if scoped_file_id else None
        results = await self.gpu.qdrant_search(collection_name, q_embedding, limit=self._retrieve_k, filter_=qfilter)
        t_search = time.perf_counter()

        reranked, rerank_error, order = False, None, None
        if results and rerank:
            try:
                ranked = await self.gpu.rerank(question, [r["payload"]["document"] for r in results], top_n=top_k)
                order = [(r["index"], r["score"]) for r in ranked]
                reranked = True
            except Exception as e:
                rerank_error = f"{type(e).__name__}: {e}"
                logger.warning(f"[rerank] failed, falling back to dense order: {rerank_error}")
        if order is None:
            order = [(i, results[i]["score"]) for i in range(min(top_k, len(results)))]
        t_rerank = time.perf_counter()

        chunks = []
        for rank, (idx, score) in enumerate(order, start=1):
            p = results[idx]["payload"]
            chunks.append({
                "source_index": rank, "chunk": p["document"], "score": score,
                "distance": 1 - results[idx]["score"],
                "file_id": p.get("file_id", ""), "file_name": p.get("file_name", "unknown"),
                "chunk_idx": int(p.get("chunk_idx", -1)), "page": int(p.get("page", -1)),
                "image_index": int(p.get("image_index", -1)), "content_type": p.get("content_type", "unknown"),
                "y_offset": float(p.get("y_offset", 0.0)),
                "is_assignment": str(p.get("is_assignment", "false")).lower() == "true",
            })
        return {
            "chunks": chunks, "candidates": len(results), "reranked": reranked, "rerank_error": rerank_error,
            "timings": {"embed_s": t_embed - t0, "search_s": t_search - t_embed, "rerank_s": t_rerank - t_search},
        }

    @staticmethod
    def _assignment_protocol(history) -> str:
        """Graduated hints: the level rises with the number of student turns already in the session."""
        prior_turns = sum(1 for m in (history or [])[-6:] if m.get("role") == "user")
        level = min(3, 1 + prior_turns)
        steps = {
            1: "Level 1 (first request): explain only the underlying concept and restate what the problem is asking. Give no steps toward the answer.",
            2: "Level 2 (student is still working): break the problem into sub-steps and name the technique to use. Do not carry out the steps.",
            3: "Level 3 (repeated requests): show how to carry out the first step as a worked pattern on a different example, then ask the student to continue.",
        }
        return (
            "\n## ASSIGNMENT PROTOCOL\n"
            "The retrieved material comes from files the teacher marked as ASSIGNMENTS.\n"
            "Never give the final answer or a submission-ready solution. Tutor with hints and probing questions.\n"
            f"{steps[level]}\n"
        )

    def _build_system_prompt(self, chunks, history, *, tutoring=True, citations=True) -> str:
        context = "\n\n---\n\n".join(
            f"[Source {c['source_index']}: {c['file_name']} | chunk {c['chunk_idx']}]\n{c['chunk']}" for c in chunks)
        assignment_protocol = self._assignment_protocol(history) if (tutoring and any(c["is_assignment"] for c in chunks)) else ""
        history_text = ""
        for msg in (history or [])[-6:]:
            role = "Student" if msg.get("role") == "user" else "Assistant"
            history_text += f"{role}: {msg.get('content', '')}\n"
        citations_block = """
## CITATIONS BLOCK
At the very end of your response, you MUST include a "CITATIONS" block in this EXACT JSON format:
<CITATIONS>
{"citations": [{"source": 1, "quote": "verbatim text"}]}
</CITATIONS>
Rules:
- 'source' is the numeric CHUNK index.
- 'quote' must be the EXACT verbatim text from that chunk.
- Include 1-6 high-quality citations.
""" if citations else ""
        cite_line = "- Citing: When mentioning a fact, cite it inline like (Source 1).\n" if citations else ""
        return f"""You are an elite Professor's AI Teaching Assistant. Your goal is to provide deep, insightful, and comprehensive explanations based STRICTLY on the provided Knowledge Base.
If the Knowledge Base does not contain the answer, say that the information is not available in the course materials.

## RESPONSE GUIDELINES
- Be Professorial: Use academic but accessible language. Provide context and "why" behind facts.
- Structure: Use Markdown (headers, bold, lists) to make the answer highly readable.
- Detail: If the context allows, provide a thorough explanation. Do not be terse.
{cite_line}- **Video timestamps**: If a chunk contains timestamps like [HH:MM:SS], include the most relevant timestamp in your answer as [MM:SS] or [HH:MM:SS] to help the student locate the exact moment.
- **Formulas: Use standard LaTeX delimiters. Use $...$ for inline math and $$...$$ for block math.**
{assignment_protocol}{citations_block}
Conversation History:
{history_text}

Knowledge Base Context:
{context}
"""

    def _parse_answer(self, raw: str):
        if "<CITATIONS>" not in raw or "</CITATIONS>" not in raw:
            return raw.split("<CITATIONS>")[0].strip(), []
        answer = raw.split("<CITATIONS>")[0].strip()
        payload = self._extract_json(raw.split("<CITATIONS>")[1].split("</CITATIONS>")[0].strip())
        cites = payload["citations"] if payload and isinstance(payload.get("citations"), list) else []
        return answer, cites

    def _build_sources(self, chunks, model_citations, effective_question) -> list[dict]:
        citation_lookup = {}
        for c in model_citations:
            if not isinstance(c, dict): continue
            quote = str(c.get("quote", "")).strip()
            if not quote: continue
            sn = c.get("source")
            si = int(sn) if isinstance(sn, int) else (int(sn) if isinstance(sn, str) and sn.strip().isdigit() else None)
            if si is None or si < 1 or si > len(chunks): continue
            src = chunks[si - 1]
            rk = (src["file_id"], src["chunk_idx"])
            if rk not in citation_lookup or len(quote) > len(citation_lookup[rk]):
                citation_lookup[rk] = quote

        question_terms = set(re.findall(r"[a-z0-9]{4,}", effective_question.lower()))
        seen, sources = set(), []
        for item in chunks:
            rk = (item["file_id"], item["chunk_idx"])
            if rk in seen: continue
            seen.add(rk)
            chunk = item["chunk"]
            page_val = item["page"]
            if page_val < 0 and chunk:
                pm = re.search(r'\[Classification:[^\]]*\bPage\s+(\d+)\b', chunk, re.IGNORECASE)
                if pm: page_val = int(pm.group(1))
            snippet = self._build_snippet(chunk, question_terms)
            ht, hs, he = None, None, None
            cq = citation_lookup.get(rk)
            if cq:
                s, e, et = self._find_quote_span(chunk, cq)
                if et: ht, hs, he, snippet = et, s, e, et
                else: ht = cq
            timestamp = None
            if item["content_type"] == "youtube":
                ts_match = re.search(r'\[(\d{2}:\d{2}:\d{2})\]', chunk)
                if ts_match:
                    timestamp = ts_match.group(1)
                    if timestamp.startswith('00:'):
                        timestamp = timestamp[3:]
            sources.append({
                "file_id": item["file_id"], "file_name": item["file_name"],
                "relevance": round(1 - item["distance"], 3),
                "chunk_idx": item["chunk_idx"] if item["chunk_idx"] >= 0 else None,
                "page": page_val if page_val >= 0 else None,
                "image_index": item["image_index"] if item["image_index"] >= 0 else None,
                "content_type": item["content_type"], "snippet": snippet,
                "highlight_text": ht, "highlight_start": hs, "highlight_end": he,
                "y_offset": item["y_offset"], "timestamp": timestamp,
            })
        return sources

    async def query(self, *, teacher_id, collection_name, question, image_base64=None, top_k=None,
                    chat_history=None, use_rerank=True, use_tutoring=True, use_citations=True) -> dict:
        scoped_file_id, effective_question = self._split_scope(question)
        logger.info(f"[query] teacher={teacher_id} scoped={scoped_file_id} q='{effective_question[:60]}...'")

        r = await self.retrieve(collection_name=collection_name, question=effective_question,
                                scoped_file_id=scoped_file_id, top_k=top_k, rerank=use_rerank)
        chunks = r["chunks"]
        if not chunks:
            msg = f"No context from file {scoped_file_id}." if scoped_file_id else "No relevant information found."
            return {"answer": msg, "sources": [], "meta": {**r, "chunks": []}}

        system_prompt = self._build_system_prompt(chunks, chat_history, tutoring=use_tutoring, citations=use_citations)
        t0 = time.perf_counter()
        if image_base64:
            if "base64," in image_base64:
                image_base64 = image_base64.split("base64,")[1]
            raw = await self.gpu.describe_image(
                base64.b64decode(image_base64), "image/png",
                f"{system_prompt}\n\nStudent Question: {effective_question}")
        else:
            raw = await self.gpu.generate([
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Student Question: {effective_question}"},
            ], temperature=0.3)
        answer, model_citations = self._parse_answer(raw)
        return {
            "answer": answer,
            "sources": self._build_sources(chunks, model_citations, effective_question),
            "meta": {**r, "generate_s": time.perf_counter() - t0, "model_citations": model_citations,
                     "assignment_mode": use_tutoring and any(c["is_assignment"] for c in chunks)},
        }

    async def stream_query(self, *, teacher_id, collection_name, question, image_base64=None, top_k=None, chat_history=None):
        logger.info(f"[stream] START teacher={teacher_id} q={question[:40]}...")
        yield " " * 4096  # padding to flush proxy/browser buffers before the first token

        scoped_file_id, effective_question = self._split_scope(question)
        r = await self.retrieve(collection_name=collection_name, question=effective_question,
                                scoped_file_id=scoped_file_id, top_k=top_k)
        chunks = r["chunks"]
        if not chunks:
            yield "I couldn't find any relevant information in the knowledge base to answer your question."
            return

        messages = [
            {"role": "system", "content": self._build_system_prompt(chunks, chat_history)},
            {"role": "user", "content": f"Student Question: {effective_question}"},
        ]
        full_text = ""
        async for tok in self.gpu.stream_generate(messages, temperature=0.3):
            full_text += tok
            yield tok

        _, model_citations = self._parse_answer(full_text)
        sources = self._build_sources(chunks, model_citations, effective_question)
        yield f"\n[METADATA]{json.dumps({'sources': sources})}"


    # ── Response parsing helpers ──────────────────────────────────────────

    def _extract_json(self, text):
        if not text: return None
        cleaned = text.strip()
        if cleaned.startswith("```"):
            cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.IGNORECASE)
            cleaned = re.sub(r"\s*```$", "", cleaned)
        try:
            p = json.loads(cleaned)
            return p if isinstance(p, dict) else None
        except Exception: pass
        s, e = cleaned.find("{"), cleaned.rfind("}")
        if s < 0 or e <= s: return None
        try:
            p = json.loads(cleaned[s:e+1])
            return p if isinstance(p, dict) else None
        except Exception: return None

    def _build_snippet(self, chunk, question_terms):
        lines = [ln.strip() for ln in chunk.splitlines() if ln.strip()]
        lines = [ln for ln in lines if not re.match(r"^\[(Source|Classification):", ln, re.IGNORECASE)]
        clean = re.sub(r"\s+", " ", " ".join(lines)).strip()
        if not clean: return ""
        sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+|\n+", clean) if s.strip()]
        if not sentences: return clean[:280]
        best_idx, best_score = 0, -1
        for i, s in enumerate(sentences):
            st = set(re.findall(r"[a-z0-9]{4,}", s.lower()))
            score = len(st & question_terms) * 3 + min(len(s), 200) / 200
            if score > best_score: best_score, best_idx = score, i
        if best_score <= 0: return clean[:280]
        snip = sentences[best_idx]
        if len(snip) < 140 and best_idx + 1 < len(sentences):
            snip = f"{snip} {sentences[best_idx+1]}"
        return snip[:280]

    def _find_quote_span(self, chunk, quote):
        if not quote: return None, None, None
        c = quote.strip().strip('"').strip("'")
        if not c: return None, None, None
        pos = chunk.find(c)
        if pos >= 0: return pos, pos+len(c), chunk[pos:pos+len(c)]
        pos = chunk.lower().find(c.lower())
        if pos >= 0: return pos, pos+len(c), chunk[pos:pos+len(c)]
        return None, None, None


_engine: Optional[RAGEngine] = None

def get_engine() -> RAGEngine:
    global _engine
    if _engine is None:
        _engine = RAGEngine()
    return _engine
