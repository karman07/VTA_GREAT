"""Sensitivity analyses on the EXISTING per-query outputs (no new model calls):
exact McNemar for paired binary outcomes, Wilcoxon signed-rank for bounded/skewed scores,
Clopper-Pearson exact intervals for proportions."""
import numpy as np
from scipy import stats
from eval.common import load, save


def cp(k, n, a=0.05):
    lo = 0.0 if k == 0 else stats.beta.ppf(a / 2, k, n - k + 1)
    hi = 1.0 if k == n else stats.beta.ppf(1 - a / 2, k + 1, n - k)
    return [k / n, float(lo), float(hi), int(k), int(n)]


def mcnemar_exact(a, b):
    a, b = np.asarray(a, int), np.asarray(b, int)
    n10, n01 = int(((a == 1) & (b == 0)).sum()), int(((a == 0) & (b == 1)).sum())
    n = n10 + n01
    p = 1.0 if n == 0 else min(1.0, 2 * stats.binom.cdf(min(n10, n01), n, 0.5))
    return {"discordant_a_only": n10, "discordant_b_only": n01, "p": float(p)}


def wilcoxon(a, b):
    d = np.asarray(b, float) - np.asarray(a, float)
    if np.allclose(d, 0):
        return {"p": 1.0, "n_nonzero": 0}
    r = stats.wilcoxon(d[d != 0])
    return {"p": float(r.pvalue), "n_nonzero": int((d != 0).sum())}


out = {}
# ── retrieval
rows = load("retrieval_raw.json")
rr = lambda r: 0.0 if r is None else 1.0 / r
hit = lambda r, k: int(r is not None and r <= k)
out["retrieval"] = {
    "mrr_wilcoxon": wilcoxon([rr(r["dense_rank"]) for r in rows], [rr(r["rerank_rank"]) for r in rows]),
    "recall@6_mcnemar": mcnemar_exact([hit(r["dense_rank"], 6) for r in rows], [hit(r["rerank_rank"], 6) for r in rows]),
    "recall@1_mcnemar": mcnemar_exact([hit(r["dense_rank"], 1) for r in rows], [hit(r["rerank_rank"], 1) for r in rows]),
    "exact_ci": {name: {f"recall@{k}": cp(sum(hit(r[key], k) for r in rows), len(rows)) for k in (1, 3, 6)}
                 for name, key in (("dense", "dense_rank"), ("rerank", "rerank_rank"))},
    "recall@20": cp(sum(hit(r["dense_rank"], 20) for r in rows), len(rows)),
}
# ── generation
gen = load("gen_answerable.json")
sysn = list(gen[0]["systems"])
per = {s: {} for s in sysn}
for row in gen:
    for s in sysn:
        j = row["systems"][s]["judge1"]
        if j["n_claims"] and j["correctness"] is not None:
            per[s][row["id"]] = (j["n_unsupported"] / j["n_claims"], float(j["correctness"]), int(j["n_unsupported"] > 0))
ids = sorted(set.intersection(*[set(v) for v in per.values()]))
out["generation"] = {"pairs": {}, "exact_ci_answers_with_unsupported": {s: cp(sum(per[s][i][2] for i in ids), len(ids)) for s in sysn}}
for a, b in (("llm_only", "vanilla_rag"), ("vanilla_rag", "rag_rerank"), ("rag_rerank", "teachai"), ("vanilla_rag", "teachai"), ("llm_only", "teachai")):
    out["generation"]["pairs"][f"{a}->{b}"] = {
        "hr_wilcoxon": wilcoxon([per[a][i][0] for i in ids], [per[b][i][0] for i in ids]),
        "correctness_wilcoxon": wilcoxon([per[a][i][1] for i in ids], [per[b][i][1] for i in ids]),
        "unsupported_answer_mcnemar": mcnemar_exact([per[a][i][2] for i in ids], [per[b][i][2] for i in ids])}
# ── abstention
oos = load("gen_oos.json")
out["out_of_scope"] = {s: cp(sum(int(r["systems"][s]["abstained"]) for r in oos), len(oos)) for s in sysn}
# ── assignment
asg = load("gen_assignment.json")
a = {}
for s in ("no_protocol", "teachai"):
    a[s] = {k: cp(sum(int(r["systems"][s][k]) for r in asg), len(asg)) for k in ("leaked_final_answer", "full_solution", "guidance")}
a["mcnemar"] = {k: mcnemar_exact([r["systems"]["no_protocol"][k] for r in asg], [r["systems"]["teachai"][k] for r in asg]) for k in ("leaked_final_answer", "full_solution", "guidance")}
out["assignment"] = a
save("sensitivity.json", out)
import json; print(json.dumps(out, indent=1, default=lambda x: round(float(x), 5))[:5000])
