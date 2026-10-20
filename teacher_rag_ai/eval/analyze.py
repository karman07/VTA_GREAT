"""Aggregate raw results into the tables used in the paper (writes eval/data/results.json and results.md)."""
import numpy as np
from scipy import stats
from eval.common import *

rng = np.random.default_rng(SEED)
R = {}


def ci(x, B=5000):
    x = np.asarray(x, float)
    boots = [rng.choice(x, len(x)).mean() for _ in range(B)]
    return float(x.mean()), float(np.percentile(boots, 2.5)), float(np.percentile(boots, 97.5))


def paired(a, b):
    """Paired t-test and Cohen's d_z for b - a."""
    d = np.asarray(b, float) - np.asarray(a, float)
    if d.std(ddof=1) == 0:
        return {"t": 0.0, "p": 1.0, "d": 0.0, "mean_diff": float(d.mean())}
    t, p = stats.ttest_rel(b, a)
    return {"t": float(t), "p": float(p), "d": float(d.mean() / d.std(ddof=1)), "mean_diff": float(d.mean())}


def cohen_kappa(a, b):
    a, b = np.asarray(a, int), np.asarray(b, int)
    po = (a == b).mean()
    pe = sum(((a == v).mean() * (b == v).mean()) for v in (0, 1))
    return float((po - pe) / (1 - pe)) if pe < 1 else 1.0


md = []

# ── Retrieval ───────────────────────────────────────────────────────────────
rows = load("retrieval_raw.json")
n = len(rows)


def rr(r):
    return 0.0 if r is None else 1.0 / r


def hit(r, k):
    return float(r is not None and r <= k)


ret = {"n": n, "rerank_failures": sum(1 for r in rows if r["rerank_error"])}
valid = [r for r in rows if not r["rerank_error"]]
for name, key in (("dense", "dense_rank"), ("rerank", "rerank_rank")):
    ret[name] = {f"recall@{k}": ci([hit(r[key], k) for r in valid]) for k in (1, 3, 6)}
    ret[name]["mrr"] = ci([rr(r[key]) for r in valid])
ret["recall@20_stage1"] = ci([hit(r["dense_rank"], 20) for r in valid])
ret["tests"] = {
    "mrr": paired([rr(r["dense_rank"]) for r in valid], [rr(r["rerank_rank"]) for r in valid]),
    "recall@6": paired([hit(r["dense_rank"], 6) for r in valid], [hit(r["rerank_rank"], 6) for r in valid]),
}
ret["by_type"] = {}
for t in sorted({r["type"] for r in valid}):
    sub = [r for r in valid if r["type"] == t]
    ret["by_type"][t] = {"n": len(sub), "dense_mrr": float(np.mean([rr(r["dense_rank"]) for r in sub])),
                         "rerank_mrr": float(np.mean([rr(r["rerank_rank"]) for r in sub]))}
R["retrieval"] = ret

# ── Generation: answerable ──────────────────────────────────────────────────
gen = load("gen_answerable.json")
systems = list(gen[0]["systems"])
g = {"n": len(gen)}
per = {s: {"hr": [], "correct": [], "j2_unsup": [], "j1_unsup": []} for s in systems}
for row in gen:
    for s in systems:
        e = row["systems"][s]
        j1, j2 = e["judge1"], e["judge2"]
        if j1["n_claims"] == 0 or j1["correctness"] is None:
            continue
        per[s]["hr"].append(j1["n_unsupported"] / j1["n_claims"])
        per[s]["correct"].append(float(j1["correctness"]))
        per[s]["j1_unsup"].append(int(j1["n_unsupported"] > 0))
        per[s]["j2_unsup"].append(int(j2["n_unsupported"] > 0) if j2["n_claims"] else 0)
g["systems"] = {s: {"n": len(per[s]["hr"]), "hallucination_rate": ci(per[s]["hr"]), "correctness": ci(per[s]["correct"]),
                    "answers_with_unsupported_claim": float(np.mean(per[s]["j1_unsup"])),
                    "gold_in_context": float(np.mean([r["systems"][s]["gold_in_context"] for r in gen]))} for s in systems}
g["hallucination_rate_judge2"] = {}
for s_ in systems:
    v = []
    for row in gen:
        j = row["systems"][s_]["judge2"]
        if j["n_claims"]:
            v.append(j["n_unsupported"] / j["n_claims"])
    g["hallucination_rate_judge2"][s_] = ci(v)
g["judge_agreement_kappa"] = {s: cohen_kappa(per[s]["j1_unsup"], per[s]["j2_unsup"]) for s in systems}
# paired comparisons on the queries every system answered
idx = {s: {} for s in systems}
for row in gen:
    for s in systems:
        j = row["systems"][s]["judge1"]
        if j["n_claims"] and j["correctness"] is not None:
            idx[s][row["id"]] = (j["n_unsupported"] / j["n_claims"], float(j["correctness"]))
common = set.intersection(*[set(v) for v in idx.values()])
g["n_common"] = len(common)
g["tests"] = {}
for a, b in (("llm_only", "vanilla_rag"), ("vanilla_rag", "rag_rerank"), ("rag_rerank", "teachai"), ("vanilla_rag", "teachai"), ("llm_only", "teachai")):
    ids = sorted(common)
    g["tests"][f"{a}->{b}"] = {
        "hallucination_rate": paired([idx[a][i][0] for i in ids], [idx[b][i][0] for i in ids]),
        "correctness": paired([idx[a][i][1] for i in ids], [idx[b][i][1] for i in ids])}
cites = [r["systems"]["teachai"] for r in gen]
nc = sum(c["citations"]["n_citations"] for c in cites)
g["citations"] = {
    "n_citations": nc, "citation_accuracy": (sum(c["citations"]["n_valid"] for c in cites) / nc) if nc else None,
    "answers_with_citation_block": float(np.mean([c["citations"]["n_citations"] > 0 for c in cites])),
    "answers_with_inline_citation": float(np.mean([c["has_inline"] for c in cites])),
    "cites_gold_chunk_when_gold_retrieved": float(np.mean([c["citations"]["cites_gold"] for c in cites if c["gold_in_context"]] or [0]))}
g["rerank_failures"] = sum(1 for r in gen for s in systems if r["systems"][s]["reranked"] is False and s in ("rag_rerank", "teachai"))
R["generation"] = g

# ── Out-of-scope ────────────────────────────────────────────────────────────
oos = load("gen_oos.json")
R["out_of_scope"] = {"n": len(oos), "abstention_rate": {s: ci([float(r["systems"][s]["abstained"]) for r in oos]) for s in systems}}

# ── Assignment protocol ─────────────────────────────────────────────────────
asg = load("gen_assignment.json")
a = {"n": len(asg)}
for s in asg[0]["systems"]:
    a[s] = {k: ci([float(r["systems"][s][k]) for r in asg]) for k in ("leaked_final_answer", "full_solution", "guidance")}
    a[s]["assignment_mode_triggered"] = float(np.mean([r["systems"][s]["assignment_mode"] for r in asg]))
a["tests"] = {k: paired([float(r["systems"]["no_protocol"][k]) for r in asg], [float(r["systems"]["teachai"][k]) for r in asg])
              for k in ("leaked_final_answer", "full_solution", "guidance")}
R["assignment"] = a

# ── Latency ─────────────────────────────────────────────────────────────────
try:
    lat = load("latency_raw.json")
    R["latency"] = {}
    for lvl, v in lat.items():
        t, tot = [r["ttft_s"] for r in v["raw"]], [r["total_s"] for r in v["raw"]]
        R["latency"][lvl] = {"n_ok": v["n_ok"], "n_err": v["n_err"], "throughput_qps": v["throughput_qps"],
                             "ttft_median": float(np.median(t)), "ttft_p95": float(np.percentile(t, 95)),
                             "total_median": float(np.median(tot)), "total_p95": float(np.percentile(tot, 95))}
except FileNotFoundError:
    pass

try:
    R["timing"] = load("timing_raw.json")
except FileNotFoundError:
    pass
R["_corpus"] = load("corpus_stats.json")
save("results.json", R)
print(json.dumps(R, indent=2)[:6000])
