# VTA evaluation — audit report (written BEFORE any change; 2026-10-20)

Scope: the existing system (`teacher_rag_ai`, git tag `pre-paper-strengthening`), the v1 evaluation (`eval/*.py`, `eval/data/*.json`) and the paper `VTA_Paper_Final.docx`.
Method: read all code; reproduce every stored result **without model calls**; recompute every metric with independent code (`python -m eval.v2.audit_v1`, output `eval/v2/audit_v1.json`).

## 1. Result: the reported numbers are arithmetically correct
* The original `analyze.py` and `sensitivity.py`, re-run on a scratch copy of the stored raw outputs, reproduce `results.json` and `sensitivity.json` **exactly (0 differences)**.
* An independent recomputation (different code paths: exact binomial/Clopper–Pearson, own paired-t, exact McNemar via `binomtest`, own bootstrap with another seed) agrees on **121 / 121** checks: retrieval (MRR, Recall@1/3/6/20, exact CIs, paired tests, McNemar), generation (HR, correctness, answers with ≥1 unsupported claim, all paired tests, κ), citations (267 / 214 / 61 / 72), abstention, assignment (all rates, McNemar), latency (medians, p95). Bootstrap CIs agree within 0.02 (Monte-Carlo noise).
* No inconsistent sample counts: 99 / 30 / 30 queries; 99 queries judged for all four systems; 0 rerank failures in the reported runs.

## 2. Models and versions actually used
| Role | Model identifier | Settings | Notes |
|---|---|---|---|
| Answer generation | `gemini-2.5-flash-lite` | temp 0.3, max 4096 tokens | OpenAI-compatible endpoint |
| Embeddings | `gemini-embedding-001` | 768 dims, cosine (Qdrant) | |
| LLM reranker | `gemini-2.5-flash-lite` | temp 0, JSON object, 700 chars/passage, top-20→6 | scores 0–10 in one call |
| Image captioning | `gemini-2.5-flash-lite` | ≤10 images/page, min area 40,000 px | not evaluated |
| Judge 1 | `gemini-2.5-flash` | temp 0 | **also the model that wrote the benchmark questions** |
| Judge 2 | `gemini-2.5-flash-lite` | temp 0 | = the generator |
| Benchmark writer | `gemini-2.5-flash` | temp 0.7–0.8 | |
All identifiers are floating aliases: the API echoes `gemini-2.5-flash-lite` with no revision, so exact model versions **cannot be pinned or recovered** (drift risk). v2 records the echoed model string, date and token usage per call.

## 3. Verified issues and inconsistencies
| # | Severity | Finding | Evidence |
|---|---|---|---|
| I1 | **High (application)** | `_build_sources` forwards the model's quote as `highlight_text` **even when it is not found in the chunk** (`else: ht = cq`), with no status flag; the UI cannot tell verified from unverified citations. | `rag_engine.py` `_build_sources` |
| I2 | **High** | 38.4% of answers have no parseable citation block, but the cause is **undiagnosable**: raw generation text is not stored, `_parse_answer` needs both `<CITATIONS>` and `</CITATIONS>` and silently returns `[]` otherwise, and the model's citation list is stored only as counts. | `eval_generation.py`, `_parse_answer` |
| I3 | Medium | The benchmark questions and gold labels were written by Gemini 2.5 Flash, which is also the primary judge (judge 1). Self-preference risk; the paper did not state this. | `gen_queries.py` uses `JUDGE_MODEL` |
| I4 | Medium | One evidence set built from VTA's own retrieval is used to judge all four systems (disclosed in the paper's Rev. 4, effect unquantified). | `process_answerable` |
| I5 | Medium | A single gold chunk (plus identical-text copies) is "relevant"; other passages that answer the question count as misses. | `eval_retrieval.py` |
| I6 | Medium | Uneven coverage: the QLoRA paper supplies 30/99 (30.3%) of questions, *Ensemble Learning (Part I)* (46 chunks) supplies 0, *Deep Learning-III* 2; only 8 of 9 non-assignment documents appear. | `queries.json` |
| I7 | Medium | Mean fraction of a question's content words found in its gold chunk is 0.51 (median 0.50); overlap is **not associated** with rank-1 retrieval (Spearman ρ = −0.02, p = 0.85). The paper's claim that lexical overlap "probably makes retrieval easier" is therefore untested, not supported, by this benchmark. | `audit_v1.json` |
| I8 | Medium | Unsupported statements in the paper: "ingestion took 99 s" has **no stored source** (no timing in `build_corpus.py` or any log); historical notes (27/99 early reranker bug; assignment flag lost in an earlier build) are not verifiable from stored artifacts. | grep of `eval/data` |
| I9 | Medium | Stored outputs omit: retrieved context per answer, model citation list, judge claim labels, candidate passage texts (`retrieval_raw` stores a count), token usage/cost, raw generation. Limits re-analysis and cost reporting. | schema of `gen_*.json` |
| I10 | Medium | The live streaming path (`stream_query`) is **not** the evaluated path (`query`); prompts/defaults match, but streaming citations/metadata were never evaluated end to end. | `rag_engine.py` |
| I11 | Medium | Each query was run once per system: generation variability is unmeasured (disclosed). No multiplicity correction (disclosed). | `analyze.py` |
| I12 | Medium | Assignment evaluation: 30 single-turn messages from 2 papers; the mode triggered on 30/30 because every message targets flagged files; no multi-turn, rephrased, unflagged-retrieval or retrieval-failure cases. | `gen_assignment.json` |
| I13 | Low | κ code treats a judge-2 answer with zero claims as "no unsupported claim"; no such answers exist (0), so no effect, but the logic is fragile. | `analyze.py` |
| I14 | Low | The bootstrap uses one module-level RNG consumed across calls, so intervals depend on call order (reproduced exactly only because the order is unchanged). | `analyze.py` |
| I15 | Low | Reranker ties/stability across repeated calls (temperature 0 but non-deterministic service) never measured. | — |

## 4. Smallest set of changes/experiments that materially strengthen the paper
Constraints discovered: only a Gemini API key is available (no second model family, so an **independent-family judge cannot be run here**); no human annotators; no GPU; no torch/sentence-transformers installed.
1. **Instrumented, resumable v2 harness** (stores raw output, context, citations, claims, token usage, timing, model echo) — fixes I2, I9, I14.
2. **Citation reliability** (the largest weakness): structured/deterministic citation strategies + validated citation objects + tests + UI status; evaluated on *identical* answers with five separate metrics (coverage, source validity, verbatim validity, claim-level support, completeness) — I1, I2.
3. **Controlled ablation** retrieval × reranking × citation instructions × assignment mode with frozen contexts and 3 repeated runs — I4, I11.
4. **Benchmark robustness** (no human claim): graded multi-passage relevance, lexically distant paraphrases, an adversarial set, coverage imbalance — I5, I6, I7.
5. **Assignment evaluation extended**: rephrased/indirect, multi-turn escalation, unflagged retrieval, retrieval failure; disclosure/solution/guidance/refusal measured separately — I12.
6. **Statistics**: Holm correction over a pre-declared confirmatory family, effect sizes with cluster-bootstrap CIs, run-to-run variance.
7. **Human-validation kit** (annotation workbook, instructions, agreement scripts) — to be completed by people, not simulated.
8. **Reproducibility package** (config, manifest with hashes/versions, table-regeneration script, README, cost log).
9. Lower priority, if time allows: cross-encoder reranker comparison (needs `torch`), a same-family stronger judge as a *sensitivity* check only.
Not done and not claimable: independent-family judge (no key), human validation, user study, generator comparison (no motivating question yet).
