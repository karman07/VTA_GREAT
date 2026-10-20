"""Analysis of the human-evaluation export produced by the platform's study mode (Research Study -> Results -> Export).

    python -m eval.analyze_human path/to/teachai-study-export.json [--out eval/data/human]

Computes, from REAL participant data only:
  * SUS (recomputed from the 10 answers, 0-100) with mean, SD, 95% t-interval
  * usefulness questionnaire: per-item mean/SD/% agree (4-5), overall mean, Cronbach's alpha
  * per-answer student ratings (participant-clustered bootstrap) and citation-support distribution
  * expert rubric means (bootstrap over items) and inter-rater agreement (quadratic-weighted Cohen's kappa,
    exact and within-one agreement) for every reviewer pair, plus Cohen's kappa for 'revealed a solution'
and writes human_results.json and human_results.md (ready-to-paste text and tables for Section 7.8 of the paper).

It refuses to run on files that are not platform exports, and never invents or imputes data.
"""
import argparse
import itertools
import json
import math
import sys
from pathlib import Path

import numpy as np
from scipy import stats

SEED = 7
RUBRIC = ["relevance", "factualAccuracy", "groundingQuality", "educationalValue", "citationQuality"]
RUBRIC_LABEL = {"relevance": "Relevance", "factualAccuracy": "Factual accuracy", "groundingQuality": "Grounding quality",
                "educationalValue": "Educational value", "citationQuality": "Citation quality"}
USEFULNESS_ITEMS = [
    "The responses were relevant to the course materials.", "The provided citations were useful.",
    "The explanations improved my understanding of the topic.", "The AI assistant helped me locate information efficiently.",
    "The assignment guidance supported learning without revealing direct solutions.",
    "The multimodal support improved comprehension of visual materials.",
    "The platform increased my confidence in the subject.", "I would recommend this platform to other students.",
]
MIN_PAIR_ITEMS = 10


# ── statistics helpers ──────────────────────────────────────────────────────
def sus_score(answers):
    if len(answers) != 10 or not all(isinstance(a, int) and 1 <= a <= 5 for a in answers):
        raise ValueError("SUS needs 10 integer answers in 1..5")
    return 2.5 * sum((a - 1) if i % 2 == 0 else (5 - a) for i, a in enumerate(answers))


def mean_ci_t(xs, level=0.95):
    xs = np.asarray(xs, float)
    n = len(xs)
    if n == 0:
        return None
    m = float(xs.mean())
    if n < 2:
        return {"n": n, "mean": m, "sd": None, "lo": None, "hi": None}
    sd = float(xs.std(ddof=1))
    h = stats.t.ppf((1 + level) / 2, n - 1) * sd / math.sqrt(n)
    return {"n": n, "mean": m, "sd": sd, "lo": m - h, "hi": m + h}


def boot_ci(values, groups=None, B=5000):
    """Percentile bootstrap CI of the mean; resamples whole groups (participants/items) when `groups` is given."""
    rng = np.random.default_rng(SEED)
    values = np.asarray(values, float)
    if len(values) == 0:
        return None
    if groups is None:
        idx = [rng.integers(0, len(values), len(values)) for _ in range(B)]
        means = [values[i].mean() for i in idx]
    else:
        uniq = sorted(set(groups))
        bucket = {g: values[[i for i, x in enumerate(groups) if x == g]] for g in uniq}
        means = []
        for _ in range(B):
            pick = rng.integers(0, len(uniq), len(uniq))
            means.append(np.concatenate([bucket[uniq[j]] for j in pick]).mean())
    return {"mean": float(values.mean()), "lo": float(np.percentile(means, 2.5)), "hi": float(np.percentile(means, 97.5))}


def cronbach_alpha(matrix):
    X = np.asarray(matrix, float)
    if X.ndim != 2 or X.shape[0] < 3 or X.shape[1] < 2:
        return None
    k = X.shape[1]
    item_var = X.var(axis=0, ddof=1).sum()
    total_var = X.sum(axis=1).var(ddof=1)
    return None if total_var == 0 else float(k / (k - 1) * (1 - item_var / total_var))


def weighted_kappa(a, b, categories=(1, 2, 3, 4, 5)):
    """Quadratic-weighted Cohen's kappa for ordinal ratings."""
    a, b = np.asarray(a), np.asarray(b)
    k = len(categories)
    idx = {c: i for i, c in enumerate(categories)}
    O = np.zeros((k, k))
    for x, y in zip(a, b):
        O[idx[x], idx[y]] += 1
    n = O.sum()
    E = np.outer(O.sum(1), O.sum(0)) / n
    W = np.array([[(i - j) ** 2 / (k - 1) ** 2 for j in range(k)] for i in range(k)])
    denom = (W * E).sum()
    return None if denom == 0 else float(1 - (W * O).sum() / denom)


def cohen_kappa_binary(a, b):
    a, b = np.asarray(a, int), np.asarray(b, int)
    po = (a == b).mean()
    pe = sum((a == v).mean() * (b == v).mean() for v in (0, 1))
    return None if pe == 1 else float((po - pe) / (1 - pe))


# ── analysis ────────────────────────────────────────────────────────────────
def check_export(data):
    if not isinstance(data, dict) or "meta" not in data or "Anonymised export" not in str(data["meta"].get("note", "")):
        raise SystemExit("Not a TeachAI study export (missing meta.note). Refusing to analyse.")


def analyze(data):
    out = {"meta": data["meta"], "warnings": []}

    # SUS and usefulness
    sus = {}
    use = {}
    for s in data.get("surveys", []):
        if s["instrument"] == "sus":
            sus[s["participant"]] = sus_score(s["answers"])
        elif s["instrument"] == "usefulness":
            use[s["participant"]] = s["answers"]
    out["sus"] = mean_ci_t(list(sus.values())) if sus else None
    if sus:
        out["sus"]["median"] = float(np.median(list(sus.values())))
    if use:
        M = np.array(list(use.values()), float)
        out["usefulness"] = {
            "n": int(M.shape[0]),
            "overall": mean_ci_t(M.mean(axis=1)),
            "items": [{"item": USEFULNESS_ITEMS[i], "mean": float(M[:, i].mean()),
                       "sd": float(M[:, i].std(ddof=1)) if M.shape[0] > 1 else None,
                       "pct_agree": float((M[:, i] >= 4).mean() * 100)} for i in range(M.shape[1])],
            "cronbach_alpha": cronbach_alpha(M),
        }
    else:
        out["usefulness"] = None

    # per-answer student ratings (clustered by participant)
    rat = data.get("answerRatings", [])
    if rat:
        vals = [r["helpful"] for r in rat]
        parts = [r["participant"] for r in rat]
        sup = {k: sum(1 for r in rat if r.get("citationSupport") == k) for k in ("yes", "partly", "no", "none")}
        out["answerRatings"] = {"n_ratings": len(rat), "n_participants": len(set(parts)),
                                "helpful": boot_ci(vals, parts), "citationSupport": sup}
    else:
        out["answerRatings"] = None

    # expert reviews
    rev = data.get("expertReviews", [])
    by_msg = {}
    for r in rev:
        by_msg.setdefault(r["message"], {})[r["reviewer"]] = r
    exp = {"n_reviews": len(rev), "n_items": len(by_msg), "reviewers": sorted({r["reviewer"] for r in rev}), "dimensions": {}, "agreement": {}}
    for dim in RUBRIC:
        item_means, msgs = [], []
        for m, rr in by_msg.items():
            vs = [x[dim] for x in rr.values() if x.get(dim) is not None]
            if vs:
                item_means.append(float(np.mean(vs)))
                msgs.append(m)
        if item_means:
            exp["dimensions"][dim] = {**boot_ci(item_means), "n_items": len(item_means)}
    for r1, r2 in itertools.combinations(exp["reviewers"], 2):
        common = [m for m, rr in by_msg.items() if r1 in rr and r2 in rr]
        pair = {"items": len(common), "dimensions": {}}
        for dim in RUBRIC:
            a = [by_msg[m][r1][dim] for m in common if by_msg[m][r1].get(dim) is not None and by_msg[m][r2].get(dim) is not None]
            b = [by_msg[m][r2][dim] for m in common if by_msg[m][r1].get(dim) is not None and by_msg[m][r2].get(dim) is not None]
            if len(a) >= 2:
                diff = np.abs(np.array(a) - np.array(b))
                pair["dimensions"][dim] = {"n": len(a), "weighted_kappa": weighted_kappa(a, b),
                                           "exact_agreement": float((diff == 0).mean()), "within_one": float((diff <= 1).mean())}
        both = [m for m in common if by_msg[m][r1].get("revealedSolution") is not None and by_msg[m][r2].get("revealedSolution") is not None]
        if len(both) >= 2:
            pair["revealedSolution_kappa"] = {"n": len(both), "kappa": cohen_kappa_binary([by_msg[m][r1]["revealedSolution"] for m in both], [by_msg[m][r2]["revealedSolution"] for m in both])}
        pair["sufficient"] = len(common) >= MIN_PAIR_ITEMS
        exp["agreement"][f"{r1}-{r2}"] = pair
        if not pair["sufficient"]:
            out["warnings"].append(f"Reviewers {r1}/{r2} share only {len(common)} items (<{MIN_PAIR_ITEMS}); kappa is unreliable.")
    out["expertReviews"] = exp if rev else None

    n_part = len(set(list(sus) + list(use)) | {r["participant"] for r in rat})
    out["n_participants_with_data"] = n_part
    if n_part < 30:
        out["warnings"].append(f"Only {n_part} participants with data: report this as a pilot study; intervals are wide.")
    if len(exp["reviewers"]) < 2 and rev:
        out["warnings"].append("Only one reviewer: no inter-rater agreement can be reported.")
    return out


def fmt(x, d=2):
    return "n/a" if x is None else f"{x:.{d}f}"


def ci_str(c, d=2):
    return "n/a" if not c else f"{c['mean']:.{d}f} [{c['lo']:.{d}f}, {c['hi']:.{d}f}]" if c.get("lo") is not None else f"{c['mean']:.{d}f}"


def write_markdown(res, path):
    L = ["# Human evaluation results (generated by eval/analyze_human.py)", "",
         "All numbers below come from the platform export. Nothing here is simulated.", ""]
    if res["warnings"]:
        L += ["**Warnings**", ""] + [f"- {w}" for w in res["warnings"]] + [""]
    m = res["meta"]
    L += ["## Participants", "", f"{m['participantsAgreed']} students agreed and {m['participantsDeclined']} declined the consent (consent version {m['consentVersion']}); "
          f"{res['n_participants_with_data']} participants contributed ratings or surveys.", ""]
    if res["sus"]:
        s = res["sus"]
        L += ["## SUS (0–100)", "", f"n = {s['n']}; mean {fmt(s['mean'],1)} (SD {fmt(s['sd'],1)}), 95% CI [{fmt(s['lo'],1)}, {fmt(s['hi'],1)}], median {fmt(s['median'],1)}.", ""]
    if res["usefulness"]:
        u = res["usefulness"]
        L += ["## Educational usefulness questionnaire (1–5)", "",
              f"n = {u['n']}; overall mean {ci_str(u['overall'])}; Cronbach’s α = {fmt(u['cronbach_alpha'])}.", "",
              "| Item | Mean | SD | % agree (4–5) |", "|---|---|---|---|"]
        L += [f"| {i['item']} | {fmt(i['mean'])} | {fmt(i['sd'])} | {i['pct_agree']:.0f} |" for i in u["items"]] + [""]
    if res["answerRatings"]:
        a = res["answerRatings"]
        L += ["## Student ratings of individual answers", "",
              f"{a['n_ratings']} ratings from {a['n_participants']} participants; mean helpfulness {ci_str(a['helpful'])} (cluster bootstrap over participants). "
              f"Citation support reported by students: yes {a['citationSupport']['yes']}, partly {a['citationSupport']['partly']}, no {a['citationSupport']['no']}, no citations {a['citationSupport']['none']}.", ""]
    if res["expertReviews"]:
        e = res["expertReviews"]
        L += ["## Expert review (rubric 1–5)", "", f"{e['n_reviews']} reviews of {e['n_items']} answers by {len(e['reviewers'])} reviewer(s).", "",
              "| Dimension | Mean [95% CI] | Items |", "|---|---|---|"]
        L += [f"| {RUBRIC_LABEL[d]} | {ci_str(v)} | {v['n_items']} |" for d, v in e["dimensions"].items()] + [""]
        if e["agreement"]:
            L += ["### Inter-rater agreement", "", "| Reviewers | Dimension | Items | κ (quadratic weighted) | Exact | Within 1 |", "|---|---|---|---|---|---|"]
            for pair, pv in e["agreement"].items():
                for d, v in pv["dimensions"].items():
                    L.append(f"| {pair} | {RUBRIC_LABEL[d]} | {v['n']} | {fmt(v['weighted_kappa'])} | {v['exact_agreement']*100:.0f}% | {v['within_one']*100:.0f}% |")
                if "revealedSolution_kappa" in pv:
                    k = pv["revealedSolution_kappa"]
                    L.append(f"| {pair} | Revealed solution (binary κ) | {k['n']} | {fmt(k['kappa'])} | | |")
            L.append("")
    L += ["## Paper sections to update once real data exist", "",
          "The current paper states that no user study was conducted. If you report these results, update **all** of: the abstract, §1 contribution 4, §6.7 (describe what was actually run: recruitment, ethics approval, consent, number of participants/reviewers, duration), "
          "§7.8 (paste the tables above), §8 limitations (“no student study”, “no human validation”), §9 (ethics approval statement), §10 conclusion/future work, Appendix B (now administered) and the acknowledgements. "
          "Do not claim learning gains: SUS, Likert and ratings measure perception, not learning."]
    Path(path).write_text("\n".join(L))


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("export")
    ap.add_argument("--out", default="eval/data/human")
    args = ap.parse_args(argv)
    data = json.loads(Path(args.export).read_text())
    check_export(data)
    res = analyze(data)
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out + "_results.json").write_text(json.dumps(res, indent=2))
    write_markdown(res, args.out + "_results.md")
    print(f"wrote {args.out}_results.json and {args.out}_results.md")
    for w in res["warnings"]:
        print("WARNING:", w)


if __name__ == "__main__":
    main()
