"""RQ5: end-to-end streaming latency of the deployed pipeline (Gemini API + embedded Qdrant) at several concurrency levels."""
import time, statistics
from eval.common import *

N = 20
LEVELS = [1, 5, 10]


async def one(q):
    eng = get_engine()
    t0 = time.perf_counter()
    ttft, text_started = None, False
    async for chunk in eng.stream_query(teacher_id="eval", collection_name=COLLECTION, question=q):
        if not text_started and chunk.strip():
            ttft, text_started = time.perf_counter() - t0, True
        if chunk.startswith("\n[METADATA]"):
            break
    return {"ttft_s": ttft, "total_s": time.perf_counter() - t0}


async def main():
    qs = [q["question"] for q in load("queries.json")["answerable"]][:N]
    out = {}
    for lvl in LEVELS:
        t0 = time.perf_counter()
        res = await gather_limited([one(q) for q in qs], lvl)
        ok = [r for r in res if isinstance(r, dict) and r["ttft_s"] is not None]
        wall = time.perf_counter() - t0
        out[lvl] = {"n_ok": len(ok), "n_err": len(res) - len(ok), "throughput_qps": len(ok) / wall, "raw": ok}
        print(lvl, len(ok), "ok", f"wall={wall:.1f}s")
    save("latency_raw.json", out)

asyncio.run(main())
