"""RQ1: dense top-20 vs dense + LLM reranking (top-6). Relevant = any chunk whose text equals the gold chunk's."""
from eval.common import *


def rank_of(keys, gold):
    for i, k in enumerate(keys, 1):
        if k == gold:
            return i
    return None


async def one(q):
    eng = get_engine()
    emb = (await eng.gpu.embed([q["question"]]))[0]
    res = await eng.gpu.qdrant_search(COLLECTION, emb, limit=20)
    texts = [r["payload"]["document"] for r in res]
    keys = [text_key(t) for t in texts]
    dense_rank = rank_of(keys, q["gold_key"])
    rr_rank, err = None, None
    try:
        ranked = await eng.gpu.rerank(q["question"], texts, top_n=20)       # full reordering of the 20 candidates
        rr_rank = rank_of([keys[r["index"]] for r in ranked], q["gold_key"])
    except Exception as e:
        err = f"{type(e).__name__}: {e}"
    return {"id": q["id"], "type": q["type"], "dense_rank": dense_rank, "rerank_rank": rr_rank,
            "rerank_error": err, "candidates": len(res)}


async def main():
    qs = load("queries.json")["answerable"]
    out = await gather_limited([one(q) for q in qs], 4)
    rows = [r for r in out if isinstance(r, dict)]
    errs = [r for r in out if not isinstance(r, dict)]
    print(f"{len(rows)} queries ok, {len(errs)} failed, rerank failures: {sum(1 for r in rows if r['rerank_error'])}")
    save("retrieval_raw.json", rows)

asyncio.run(main())
