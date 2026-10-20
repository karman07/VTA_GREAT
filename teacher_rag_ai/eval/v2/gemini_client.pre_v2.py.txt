"""
gemini_client.py — Gemini (OpenAI-compatible API) client for chat, vision, embeddings
and LLM-based reranking, plus an embedded Qdrant vector store (local mode, no server).
"""
import asyncio
import base64
import json
import logging
import re
from typing import Optional

import httpx
from qdrant_client import QdrantClient, models

logger = logging.getLogger(__name__)

RERANK_PASSAGE_CHARS = 700

RERANK_PROMPT = """You are a relevance judge for a retrieval system.
Score how useful each passage is for answering the question, from 0 (irrelevant) to 10 (directly answers it).
Judge only the content of the passage.
Return ONLY a JSON object that maps every passage number to its score, e.g. {{"0": 7, "1": 2, "2": 9}}.
There are {n} passages, numbered 0 to {last}; include all of them.

Question: {question}

{passages}"""


class GeminiClient:
    def __init__(
        self,
        api_key: str,
        base_url: str,
        llm_model: str,
        vision_model: str,
        embed_model: str,
        embed_dim: int,
        rerank_model: str,
        qdrant_path: str,
    ):
        if not api_key:
            raise RuntimeError("GEMINI_API_KEY is not set")
        self._llm_model = llm_model
        self._vision_model = vision_model
        self._embed_model = embed_model
        self._embed_dim = embed_dim
        self._rerank_model = rerank_model or llm_model
        self._http = httpx.AsyncClient(
            base_url=base_url.rstrip("/"),
            timeout=httpx.Timeout(300.0, connect=15.0),
            headers={"Authorization": f"Bearer {api_key}"},
        )
        self._qdrant = QdrantClient(path=qdrant_path)
        logger.info(f"GeminiClient ready — llm={llm_model} embed={embed_model}/{embed_dim} qdrant={qdrant_path}")

    # ── HTTP with retry (Gemini rate limits / transient 5xx) ──────────────

    async def _post(self, path: str, body: dict, retries: int = 4) -> dict:
        delay = 1.0
        for attempt in range(retries + 1):
            resp = await self._http.post(path, json=body)
            if resp.status_code in (429, 500, 502, 503, 504) and attempt < retries:
                await asyncio.sleep(delay)
                delay *= 2
                continue
            if resp.status_code != 200:
                logger.error(f"[gemini] {path} {resp.status_code}: {resp.text[:300]}")
            resp.raise_for_status()
            return resp.json()
        raise RuntimeError("unreachable")

    # ── Embeddings ────────────────────────────────────────────────────────

    async def embed(self, texts: list[str]) -> list[list[float]]:
        out: list[list[float]] = []
        for i in range(0, len(texts), 64):
            data = await self._post("/embeddings", {
                "model": self._embed_model,
                "input": texts[i:i + 64],
                "dimensions": self._embed_dim,
            })
            batch = [d["embedding"] for d in data["data"]]
            if len(batch) != len(texts[i:i + 64]):
                raise ValueError(f"embedding count mismatch: {len(batch)} for {len(texts[i:i + 64])} inputs")
            out.extend(batch)
        return out

    # ── LLM reranker ──────────────────────────────────────────────────────

    async def rerank(self, query: str, texts: list[str], top_n: int = 6) -> list[dict]:
        """Score every candidate in a single LLM call; return [{index, score}] best first.
        Raises on failure so callers can record that reranking did not happen."""
        passages = "\n\n".join(
            f"[Passage {i}]\n{t[:RERANK_PASSAGE_CHARS]}" for i, t in enumerate(texts)
        )
        data = await self._post("/chat/completions", {
            "model": self._rerank_model,
            "messages": [{"role": "user", "content": RERANK_PROMPT.format(
                n=len(texts), last=len(texts) - 1, question=query, passages=passages)}],
            "temperature": 0,
            "response_format": {"type": "json_object"},
        })
        raw = data["choices"][0]["message"]["content"]
        parsed = json.loads(re.sub(r"^```(?:json)?\s*|\s*```$", "", raw.strip()))
        scores = parsed.get("scores", parsed) if isinstance(parsed, dict) else parsed
        by_index = scores if isinstance(scores, dict) else {str(i): v for i, v in enumerate(scores)}
        missing = [i for i in range(len(texts)) if str(i) not in by_index]
        if len(missing) > len(texts) // 2:
            raise ValueError(f"reranker scored only {len(texts) - len(missing)} of {len(texts)} passages")
        ranked = sorted(
            ({"index": i, "score": float(by_index.get(str(i), 0)) / 10.0} for i in range(len(texts))),
            key=lambda x: x["score"], reverse=True,
        )
        return ranked[:top_n]

    # ── Generation ────────────────────────────────────────────────────────

    async def generate(self, messages: list[dict], temperature: float = 0.3, max_tokens: int = 4096) -> str:
        data = await self._post("/chat/completions", {
            "model": self._llm_model, "messages": messages,
            "temperature": temperature, "max_tokens": max_tokens,
        })
        return data["choices"][0]["message"]["content"]

    async def stream_generate(self, messages: list[dict], temperature: float = 0.3, max_tokens: int = 4096):
        body = {"model": self._llm_model, "messages": messages,
                "temperature": temperature, "max_tokens": max_tokens, "stream": True}
        async with self._http.stream("POST", "/chat/completions", json=body) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if not line.startswith("data: "):
                    continue
                payload = line[6:].strip()
                if payload == "[DONE]":
                    break
                try:
                    content = json.loads(payload)["choices"][0].get("delta", {}).get("content")
                except Exception:
                    continue
                if content:
                    yield content

    async def describe_image(self, image_bytes: bytes, mime_type: str, prompt: str) -> str:
        b64 = base64.b64encode(image_bytes).decode()
        data = await self._post("/chat/completions", {
            "model": self._vision_model,
            "messages": [{"role": "user", "content": [
                {"type": "text", "text": prompt},
                {"type": "image_url", "image_url": {"url": f"data:{mime_type};base64,{b64}"}},
            ]}],
            "max_tokens": 512, "temperature": 0.2,
        })
        return data["choices"][0]["message"]["content"]

    # ── Embedded Qdrant (local mode) ──────────────────────────────────────

    @staticmethod
    def _to_filter(filter_: Optional[dict]) -> Optional[models.Filter]:
        if not filter_:
            return None
        return models.Filter(must=[
            models.FieldCondition(key=c["key"], match=models.MatchValue(value=c["match"]["value"]))
            for c in filter_["must"]
        ])

    async def qdrant_ensure_collection(self, name: str, vector_size: Optional[int] = None):
        def _run():
            if self._qdrant.collection_exists(name):
                return
            self._qdrant.create_collection(name, vectors_config=models.VectorParams(
                size=vector_size or self._embed_dim, distance=models.Distance.COSINE))
        await asyncio.to_thread(_run)

    async def qdrant_upsert(self, collection: str, points: list[dict]):
        structs = [models.PointStruct(id=p["id"], vector=p["vector"], payload=p["payload"]) for p in points]
        await asyncio.to_thread(self._qdrant.upsert, collection, structs)

    async def qdrant_search(self, collection: str, vector: list[float], limit: int = 20,
                            filter_: Optional[dict] = None) -> list[dict]:
        def _run():
            if not self._qdrant.collection_exists(collection):
                return []
            res = self._qdrant.query_points(
                collection, query=vector, limit=limit,
                query_filter=self._to_filter(filter_), with_payload=True)
            return [{"id": str(p.id), "score": p.score, "payload": p.payload} for p in res.points]
        return await asyncio.to_thread(_run)

    async def qdrant_scroll(self, collection: str, filter_: dict, limit: int = 1000) -> list[dict]:
        """All points matching a filter (payload only), unordered."""
        def _run():
            if not self._qdrant.collection_exists(collection):
                return []
            out, offset = [], None
            while True:
                points, offset = self._qdrant.scroll(
                    collection, scroll_filter=self._to_filter(filter_), limit=256,
                    offset=offset, with_payload=True, with_vectors=False)
                out.extend({"id": str(p.id), "payload": p.payload} for p in points)
                if offset is None or len(out) >= limit:
                    return out
        return await asyncio.to_thread(_run)

    async def qdrant_delete(self, collection: str, filter_: dict):
        def _run():
            if self._qdrant.collection_exists(collection):
                self._qdrant.delete(collection, points_selector=models.FilterSelector(
                    filter=self._to_filter(filter_)))
        await asyncio.to_thread(_run)

    async def qdrant_list_collections(self) -> list[dict]:
        cols = await asyncio.to_thread(self._qdrant.get_collections)
        return [{"name": c.name} for c in cols.collections]

    async def close(self):
        await self._http.aclose()
        self._qdrant.close()
