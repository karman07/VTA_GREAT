"""Audit of the ORIGINAL (v1) evaluation: independent recomputation of every reported metric from the stored raw
outputs (no model calls), plus data-integrity checks. Writes eval/v2/audit_v1.json.  Run: python -m eval.v2.audit_v1"""
import json, math, re, collections, hashlib
from pathlib import Path
import numpy as np
from scipy import stats

D = Path(__file__).resolve().parents[1] / "data"
L = lambda n: json.loads((D / n).read_text())
R, S = L("results.json"), L("sensitivity.json")
Q, RET, GEN, OOS, ASG = L("queries.json"), L("retrieval_raw.json"), L("gen_answerable.json"), L("gen_oos.json"), L("gen_assignment.json")
rng = np.random.default_rng(12345)          # different seed from the original analysis on purpose
checks, notes = [], []


def chk(name, reported, recomputed, tol=1e-9, kind="exact"):
    ok = abs(float(reported) - float(recomputed)) <= tol
    checks.append({"metric": name, "reported": float(reported), "recomputed": float(recomputed), "tolerance": tol, "kind": kind, "match": bool(ok)})


def boot(x, B=20000):
    x = np.asarray(x, float)
    m = rng.choice(x, (B, len(x))).mean(1)
    return np.percentile(m, 2.5), np.percentile(m, 97.5)


def cp(k, n):
    ci = stats.binomtest(int(k), int(n)).proportion_ci(confidence_level=0.95, method="exact")
    return ci.low, ci.high


def mcnemar(a, b):
    a, b = np.asarray(a, int), np.asarray(b, int)
    n10, n01 = int(((a == 1) & (b == 0)).sum()), int(((a == 0) & (b == 1)).sum())
    n = n10 + n01
    return (n10, n01, 1.0 if n == 0 else float(stats.binomtest(min(n10, n01), n, 0.5).pvalue))


def tpair(a, b):
    d = np.asarray(b, float) - np.asarray(a, float)
    sd = d.std(ddof=1)
    if sd == 0: return 0.0, 1.0, 0.0
    t = d.mean() / (sd / math.sqrt(len(d)))
    return t, float(2 * stats.t.sf(abs(t), len(d) - 1)), d.mean() / sd


# ── retrieval ────────────────────────────────────────────────────────────────
rr = lambda r: 0.0 if r is None else 1.0 / r
hit = lambda r, k: float(r is not None and r <= k)
n = len(RET)
checks.append({"metric": "n answerable queries in retrieval_raw", "reported": 99, "recomputed": n, "tolerance": 0, "kind": "count", "match": n == 99})
for name, key in (("dense", "dense_rank"), ("rerank", "rerank_rank")):
    chk(f"MRR {name}", R["retrieval"][name]["mrr"][0], np.mean([rr(r[key]) for r in RET]))
    lo, hi = boot([rr(r[key]) for r in RET]); chk(f"MRR {name} CI low (bootstrap, tol .02)", R["retrieval"][name]["mrr"][1], lo, .02, "bootstrap"); chk(f"MRR {name} CI high (bootstrap, tol .02)", R["retrieval"][name]["mrr"][2], hi, .02, "bootstrap")
    for k in (1, 3, 6):
        kk = sum(hit(r[key], k) for r in RET)
        chk(f"Recall@{k} {name}", R["retrieval"][name][f"recall@{k}"][0], kk / n)
        lo, hi = cp(kk, n); e = S["retrieval"]["exact_ci"][name][f"recall@{k}"]
        chk(f"Recall@{k} {name} exact CI low", e[1], lo, 1e-6); chk(f"Recall@{k} {name} exact CI high", e[2], hi, 1e-6)
chk("Recall@20 stage-1", R["retrieval"]["recall@20_stage1"][0], np.mean([hit(r["dense_rank"], 20) for r in RET]))
t, p, d = tpair([rr(r["dense_rank"]) for r in RET], [rr(r["rerank_rank"]) for r in RET])
for nm, rep, rec in (("MRR paired t", R["retrieval"]["tests"]["mrr"]["t"], t), ("MRR paired p", R["retrieval"]["tests"]["mrr"]["p"], p), ("MRR d_z", R["retrieval"]["tests"]["mrr"]["d"], d)):
    chk(nm, rep, rec, 1e-9)
for k in (1, 6):
    b, c_, pm = mcnemar([hit(r["dense_rank"], k) for r in RET], [hit(r["rerank_rank"], k) for r in RET])
    chk(f"Recall@{k} McNemar p", S["retrieval"][f"recall@{k}_mcnemar"]["p"], pm, 1e-9)
    chk(f"Recall@{k} McNemar discordant (gained)", S["retrieval"][f"recall@{k}_mcnemar"]["discordant_b_only"], c_, 0, "count")
    chk(f"Recall@{k} McNemar discordant (lost)", S["retrieval"][f"recall@{k}_mcnemar"]["discordant_a_only"], b, 0, "count")

# ── generation ───────────────────────────────────────────────────────────────
SYS = ["llm_only", "vanilla_rag", "rag_rerank", "teachai"]
HR, COR, U1 = {s: {} for s in SYS}, {s: {} for s in SYS}, {s: {} for s in SYS}
j2_zero_claims = collections.Counter()
for row in GEN:
    for s in SYS:
        j1, j2 = row["systems"][s]["judge1"], row["systems"][s]["judge2"]
        if j2["n_claims"] == 0: j2_zero_claims[s] += 1
        if j1["n_claims"] and j1["correctness"] is not None:
            HR[s][row["id"]] = j1["n_unsupported"] / j1["n_claims"]; COR[s][row["id"]] = float(j1["correctness"]); U1[s][row["id"]] = int(j1["n_unsupported"] > 0)
ids = sorted(set.intersection(*[set(v) for v in HR.values()]))
checks.append({"metric": "n queries judged for all four systems", "reported": R["generation"]["n_common"], "recomputed": len(ids), "tolerance": 0, "kind": "count", "match": R["generation"]["n_common"] == len(ids)})
for s in SYS:
    chk(f"HR {s}", R["generation"]["systems"][s]["hallucination_rate"][0], np.mean(list(HR[s].values())))
    chk(f"correctness {s}", R["generation"]["systems"][s]["correctness"][0], np.mean(list(COR[s].values())))
    chk(f"answers with >=1 unsupported {s}", R["generation"]["systems"][s]["answers_with_unsupported_claim"], np.mean(list(U1[s].values())))
for a, b in (("llm_only", "vanilla_rag"), ("vanilla_rag", "rag_rerank"), ("rag_rerank", "teachai"), ("vanilla_rag", "teachai"), ("llm_only", "teachai")):
    for m, dct in (("hallucination_rate", HR), ("correctness", COR)):
        t, p, d = tpair([dct[a][i] for i in ids], [dct[b][i] for i in ids])
        T = R["generation"]["tests"][f"{a}->{b}"][m]
        chk(f"{a}->{b} {m} t", T["t"], t, 1e-9); chk(f"{a}->{b} {m} p", T["p"], p, 1e-9); chk(f"{a}->{b} {m} d_z", T["d"], d, 1e-9)
    b10, b01, pm = mcnemar([U1[a][i] for i in ids], [U1[b][i] for i in ids])
    chk(f"{a}->{b} unsupported-answer McNemar p", S["generation"]["pairs"][f"{a}->{b}"]["unsupported_answer_mcnemar"]["p"], pm, 1e-9)
# judge agreement (note how analyze.py treats judge-2 answers with 0 claims)
for s in SYS:
    a1, a2, a2x = [], [], []
    for row in GEN:
        j1, j2 = row["systems"][s]["judge1"], row["systems"][s]["judge2"]
        if not (j1["n_claims"] and j1["correctness"] is not None): continue
        a1.append(int(j1["n_unsupported"] > 0)); a2.append(int(j2["n_unsupported"] > 0) if j2["n_claims"] else 0)
        if j2["n_claims"]: a2x.append((int(j1["n_unsupported"] > 0), int(j2["n_unsupported"] > 0)))
    def kappa(x, y):
        x, y = np.asarray(x), np.asarray(y); po = (x == y).mean(); pe = sum((x == v).mean() * (y == v).mean() for v in (0, 1)); return (po - pe) / (1 - pe) if pe < 1 else 1.0
    chk(f"kappa {s} (as reported: j2 zero-claim answers counted as 'no unsupported')", R["generation"]["judge_agreement_kappa"][s], kappa(a1, a2), 1e-9)
    if a2x: notes.append({"kappa_excluding_j2_zero_claim_answers": {s: round(float(kappa([x for x, _ in a2x], [y for _, y in a2x])), 3)}, "n_excluded": len(a1) - len(a2x)})
# citations
cit = [r["systems"]["teachai"] for r in GEN]
nc, nv = sum(c["citations"]["n_citations"] for c in cit), sum(c["citations"]["n_valid"] for c in cit)
chk("n citations", R["generation"]["citations"]["n_citations"], nc, 0, "count"); chk("verbatim validity", R["generation"]["citations"]["citation_accuracy"], nv / nc)
chk("answers with citation block", R["generation"]["citations"]["answers_with_citation_block"], np.mean([c["citations"]["n_citations"] > 0 for c in cit]))
chk("answers with inline marker", R["generation"]["citations"]["answers_with_inline_citation"], np.mean([c["has_inline"] for c in cit]))
# abstention + assignment
for s in SYS:
    k = sum(int(r["systems"][s]["abstained"]) for r in OOS); chk(f"abstention {s}", R["out_of_scope"]["abstention_rate"][s][0], k / len(OOS))
    lo, hi = cp(k, len(OOS)); e = S["out_of_scope"][s]; chk(f"abstention {s} exact CI low", e[1], lo, 1e-6); chk(f"abstention {s} exact CI high", e[2], hi, 1e-6)
for s in ("no_protocol", "teachai"):
    for key in ("leaked_final_answer", "full_solution", "guidance"):
        chk(f"assignment {s} {key}", R["assignment"][s][key][0], np.mean([float(r["systems"][s][key]) for r in ASG]))
for key in ("leaked_final_answer", "full_solution", "guidance"):
    b, c_, pm = mcnemar([r["systems"]["no_protocol"][key] for r in ASG], [r["systems"]["teachai"][key] for r in ASG]); chk(f"assignment {key} McNemar p", S["assignment"]["mcnemar"][key]["p"], pm, 1e-12)
# latency
lat = L("latency_raw.json")
for lvl, v in lat.items():
    t = [r["ttft_s"] for r in v["raw"]]; tot = [r["total_s"] for r in v["raw"]]
    chk(f"TTFT median c={lvl}", R["latency"][lvl]["ttft_median"], np.median(t)); chk(f"TTFT p95 c={lvl}", R["latency"][lvl]["ttft_p95"], np.percentile(t, 95)); chk(f"total median c={lvl}", R["latency"][lvl]["total_median"], np.median(tot))

# ── data-integrity checks on the benchmark ───────────────────────────────────
A = Q["answerable"]
dup_q = len(A) - len({a["question"].strip().lower() for a in A})
gold_counts = collections.Counter(a["gold_key"] for a in A)
by_doc = collections.Counter(a["file_name"] for a in A)
by_type = collections.Counter(a["type"] for a in A)
from qdrant_client import QdrantClient
cl = QdrantClient(path=str(D / "qdrant"))
pts, off = [], None
while True:
    res, off = cl.scroll("eval_course", limit=256, offset=off, with_payload=True)
    pts += res
    if off is None: break
cl.close()
chunk_text = {str(p.id): p.payload["document"] for p in pts}
HEADER = re.compile(r"^\[(Source|Classification):[^\]]*\]\s*", re.M)
tok = lambda t: set(w for w in re.findall(r"[a-z0-9]{4,}", HEADER.sub("", t).lower()))
STOP = set("what which that this with from have does about their there these those when where would should could into than then them they your will been also more most such only other some each both between within without using used uses make makes made".split())
ov, ov_rare = [], []
for a in A:
    qt, ct = tok(a["question"]) - STOP, tok(chunk_text[str(a["gold_chunk_id"])]) - STOP
    if qt: ov.append(len(qt & ct) / len(qt))
hit1 = [(hit(r["dense_rank"], 1)) for r in RET]
ov_by = {r["id"]: 0 for r in RET}
for a, h in zip(A, hit1): pass
lex = [len((tok(a["question"]) - STOP) & (tok(chunk_text[str(a["gold_chunk_id"])]) - STOP)) / max(1, len(tok(a["question"]) - STOP)) for a in A]
rank_by_id = {r["id"]: r for r in RET}
hi_ov = [l for l, a in zip(lex, A) if rank_by_id[a["id"]]["dense_rank"] == 1]; lo_ov = [l for l, a in zip(lex, A) if rank_by_id[a["id"]]["dense_rank"] != 1]
rho = stats.spearmanr(lex, [1 / (rank_by_id[a["id"]]["dense_rank"] or 99) for a in A])
integrity = {
    "n_answerable": len(A), "n_out_of_scope": len(Q["out_of_scope"]), "n_assignment": len(Q["assignment"]),
    "duplicate_questions": dup_q, "gold_chunks_used_more_than_once": sum(1 for v in gold_counts.values() if v > 1),
    "answerable_by_document": dict(by_doc), "answerable_by_type": dict(by_type),
    "fraction_of_question_content_words_found_in_gold_chunk": {"mean": float(np.mean(lex)), "median": float(np.median(lex)), "p25": float(np.percentile(lex, 25)), "p75": float(np.percentile(lex, 75))},
    "mean_overlap_when_dense_rank1": float(np.mean(hi_ov)), "mean_overlap_when_not_rank1": float(np.mean(lo_ov)),
    "spearman_overlap_vs_reciprocal_dense_rank": {"rho": float(rho.statistic), "p": float(rho.pvalue)},
    "judge2_answers_with_zero_claims": dict(j2_zero_claims),
    "stored_fields_missing": ["retrieved context per answer (answerable/oos/assignment)", "model citation list (only counts stored)", "judge claim-level labels (only counts stored)", "candidate passages in retrieval_raw (count only)", "token usage / cost", "raw generation text before citation-block removal"],
    "benchmark_question_writer_equals_primary_judge": "gen_queries.py uses JUDGE_MODEL (gemini-2.5-flash) to write questions and eval_generation.py uses the same model as judge 1",
}
out = {"n_checks": len(checks), "n_match": sum(c["match"] for c in checks), "mismatches": [c for c in checks if not c["match"]], "checks": checks, "notes": notes, "integrity": integrity}
(Path(__file__).parent / "audit_v1.json").write_text(json.dumps(out, indent=1, default=float))
print(f"{out['n_match']}/{out['n_checks']} recomputed values match the reported ones")
for m in out["mismatches"]: print("MISMATCH", m)
print(json.dumps(integrity, indent=1, default=float)); print(json.dumps(notes, indent=1))
