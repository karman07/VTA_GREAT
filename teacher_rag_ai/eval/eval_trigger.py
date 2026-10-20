"""How often does an assignment-flagged chunk reach the context of the ANSWERABLE queries (where the protocol should stay off)?
Uses the dense top-6 and the LLM-reranked top-6 for every answerable query."""
from eval.common import *

async def main():
    eng = get_engine()
    qs = load("queries.json")["answerable"]
    async def one(q):
        r = await eng.retrieve(collection_name=COLLECTION, question=q["question"], rerank=True)
        return any(c["is_assignment"] for c in r["chunks"])
    res = await gather_limited([one(q) for q in qs], 4)
    ok = [x for x in res if isinstance(x, bool)]
    out = {"n": len(ok), "protocol_triggered_on_answerable": int(sum(ok))}
    save("trigger_answerable.json", out); print(out)

asyncio.run(main())
