"""Freeze contexts for every v1 query (answerable, out-of-scope, assignment) and report reranker stability."""
import itertools
import numpy as np
from eval.v2.core import *
from eval.v2.contexts import freeze, STORE


async def main():
    Q = load_v1("queries.json")
    qs = [(k, q) for k in ("answerable", "out_of_scope", "assignment") for q in Q[k]]
    res = await gather_limited([freeze(q["question"]) for _, q in qs])
    report(res, "freeze")
    # stability of the LLM reranker across independent runs (answerable set)
    A = Q["answerable"]
    j6, tau, mrr_runs, agree_v1 = [], [], [[], [], []], []
    from scipy.stats import kendalltau
    v1 = {r["id"]: r for r in load_v1("retrieval_raw.json")}
    for q in A:
        f = STORE.rows[__import__("hashlib").md5(q["question"].strip().encode()).hexdigest()]
        runs = f["rerank_runs"]
        keys = [c["key"] for c in f["candidates"]]
        tops = [set(r["order"][:6]) for r in runs]
        for a, b in itertools.combinations(range(len(runs)), 2):
            j6.append(len(tops[a] & tops[b]) / len(tops[a] | tops[b]))
            ra = {i: p for p, i in enumerate(runs[a]["order"])}; rb = {i: p for p, i in enumerate(runs[b]["order"])}
            tau.append(kendalltau([ra[i] for i in range(20)], [rb[i] for i in range(20)]).statistic)
        for ri, r in enumerate(runs):
            ranks = [p + 1 for p, i in enumerate(r["order"]) if keys[i] == q["gold_key"]]
            mrr_runs[ri].append(1 / ranks[0] if ranks else 0.0)
    out = {"n_queries": len(A), "rerank_runs": 3,
           "top6_jaccard_between_runs": {"mean": float(np.mean(j6)), "min": float(np.min(j6))},
           "kendall_tau_top20_between_runs": {"mean": float(np.mean(tau)), "min": float(np.min(tau))},
           "mrr_by_run": [float(np.mean(m)) for m in mrr_runs], "v1_mrr_dense": 0.826, "v1_mrr_rerank": 0.896,
           "rerank_errors": sum(1 for r in STORE.rows.values() for x in r["rerank_runs"] if x["error"])}
    save2("rerank_stability.json", out)
    print(json.dumps(out, indent=1))

asyncio.run(main())
