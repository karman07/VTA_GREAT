"""Frozen retrieval contexts. For each question: dense top-20 (deterministic) and R independent LLM-reranker runs.
Generation ablations use the SAME stored context, so retrieval/reranker non-determinism cannot leak into them;
reranker stability is analysed separately (exploratory). Resumable; keyed by question text."""
import asyncio, hashlib
from eval.v2.core import *

STORE = ResultStore("frozen_contexts.jsonl")


def qkey(question: str) -> str:
    return hashlib.md5(question.strip().encode()).hexdigest()


async def freeze(question: str, runs: int | None = None) -> dict:
    runs = runs or CFG["retrieval"]["rerank_runs"]
    eng = engine()

    async def build():
        tagged("freeze")
        emb = (await eng.gpu.embed([question]))[0]
        res = await eng.gpu.qdrant_search(COLLECTION, emb, limit=CFG["retrieval"]["dense_k"])
        cands = []
        for i, r in enumerate(res):
            p = r["payload"]
            cands.append({"idx": i, "text": p["document"], "score": r["score"], "file_id": p.get("file_id", ""),
                          "file_name": p.get("file_name", "unknown"), "chunk_idx": int(p.get("chunk_idx", -1)),
                          "page": int(p.get("page", -1)), "content_type": p.get("content_type", "unknown"),
                          "is_assignment": str(p.get("is_assignment", "false")).lower() == "true",
                          "key": text_key(p["document"])})
        rr = []
        for _ in range(runs):
            try:
                ranked = await eng.gpu.rerank(question, [c["text"] for c in cands], top_n=len(cands))
                rr.append({"order": [r["index"] for r in ranked], "scores": {str(r["index"]): r["score"] for r in ranked}, "error": None})
            except Exception as e:                                  # noqa: BLE001
                rr.append({"order": list(range(len(cands))), "scores": {}, "error": f"{type(e).__name__}: {str(e)[:120]}"})
        return {"question": question, "candidates": cands, "rerank_runs": rr}
    return await STORE.run(qkey(question), build)


def chunks_for(frozen: dict, mode: str, k: int | None = None, rerank_run: int = 0) -> list[dict]:
    """Context in the engine's chunk format. mode: 'dense' (top-k by similarity) or 'rerank' (top-k of the frozen reranker run)."""
    k = k or CFG["retrieval"]["final_k"]
    cands = frozen["candidates"]
    order = list(range(len(cands))) if mode == "dense" else frozen["rerank_runs"][rerank_run]["order"]
    out = []
    for rank, i in enumerate(order[:k], start=1):
        c = cands[i]
        out.append({"source_index": rank, "chunk": c["text"], "file_name": c["file_name"], "chunk_idx": c["chunk_idx"],
                    "file_id": c["file_id"], "page": c["page"], "is_assignment": c["is_assignment"], "key": c["key"],
                    "content_type": c["content_type"], "score": c["score"], "distance": 1 - c["score"], "image_index": -1, "y_offset": 0.0})
    return out
