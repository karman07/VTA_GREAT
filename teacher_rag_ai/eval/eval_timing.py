"""Stage timings of the retrieval path (embed / search / rerank) over 20 benchmark queries, run sequentially."""
import numpy as np
from eval.common import *

async def main():
    eng = get_engine()
    qs = [q["question"] for q in load("queries.json")["answerable"]][:20]
    rows = []
    for q in qs:
        r = await eng.retrieve(collection_name=COLLECTION, question=q)
        rows.append(r["timings"])
    out = {k: {"median": float(np.median([r[k] for r in rows])), "p95": float(np.percentile([r[k] for r in rows], 95))} for k in rows[0]}
    save("timing_raw.json", out); print(out)

asyncio.run(main())
