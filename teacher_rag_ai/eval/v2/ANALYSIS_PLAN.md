# Analysis plan for the v2 experiments (fixed before new data are collected; 2026-10-20)

**Honesty note.** The v1 results were seen before this plan was written, so v2 hypotheses are *informed* by v1 and are **not** blind pre-registrations. What is pre-specified here is the family of confirmatory tests, the metrics, the correction and the decision rules, *before* any v2 model call. Everything else is exploratory and labelled so.

## Design
* Generator fixed: `gemini-2.5-flash-lite`, temperature 0.3, max 4096 tokens. Contexts for generation ablations are **frozen** (one stored retrieval run), so retrieval/reranker non-determinism does not leak into generation comparisons; reranker stability is measured separately.
* Answerable set: the existing 99 queries (v1 labels). Assignment set: the existing 30 messages plus new sets (rephrased/indirect; multi-turn). Adversarial set: new, LLM-written, 3 types × 10.
* Repeats: R = 3 independent generation runs per condition (answerable) and per cell (assignment). Unit of analysis = **query** (outcome averaged over runs); run-to-run SD of each system-level metric is reported alongside effect sizes.
* Judge: Gemini 2.5 Flash, temperature 0, blinded response identifiers (random 8-hex IDs), randomized presentation order for pairwise material. Judge 2 (Flash-Lite) kept as a sensitivity check. **No independent-family judge was available**; this is a limitation, not a result.

## Confirmatory family (Holm–Bonferroni, α = 0.05, two-sided, family size 5)
| ID | Hypothesis | Outcome | Test |
|---|---|---|---|
| C1 | Retrieval grounding lowers the unsupported-claim rate (RAG+Rerank vs LLM-Only) | HR per query (mean of 3 runs) | paired sign-flip permutation on mean difference |
| C2 | The assignment mode lowers final-answer disclosure (single-turn, citations fixed ON) | leaked_final_answer per message (mean of 3 runs) | paired sign-flip permutation |
| C3 | Validated structured/deterministic citation assembly yields more answers with ≥1 *verified* citation than the legacy free-form block (same answers) | answer-level binary | exact McNemar |
| C4 | Citation instructions change HR (RAG+Rerank+Cite, mode forced off, vs RAG+Rerank) | HR per query | paired sign-flip permutation (two-sided; null expected) |
| C5 | The assignment mode lowers final-answer disclosure at turn 3 of multi-turn dialogues | leaked_final_answer at turn 3 per dialogue | exact McNemar |
Effect sizes: paired mean difference (continuous) or risk difference (binary) with 95% **cluster bootstrap over queries** (10,000 resamples, fixed seed per call), plus d_z / odds-ratio from discordant pairs. Holm-adjusted p reported next to unadjusted p.

## Exploratory (no correction; interval estimates emphasised)
Reranking vs dense (MRR / Recall@K under single-gold and multi-relevant labels; paraphrased queries), reranker stability, cross-encoder comparison (if run), judge-2 sensitivity, per-type breakdowns, adversarial-set behaviour, completeness and claim-level support comparisons beyond C3, correctness differences, latency/cost.

## Citation metrics (reported separately; never merged)
1. **Block coverage**: answers with ≥1 citation object. 2. **Source-reference validity**: citations whose source id is in the retrieved set. 3. **Verbatim quotation validity**: quote found in the cited chunk after the *documented* normalisation (NFKC, case-fold, whitespace collapse; punctuation-insensitive matches reported separately and **not** counted valid). 4. **Claim-level support**: LLM-judged (same-family; flagged) whether the cited span supports the sentence it is attached to (supported / partial / not). 5. **Completeness**: share of factual answer sentences with ≥1 valid attached citation.

## Decision rules
A change is described as an *improvement* only if (a) the confirmatory test survives Holm correction, or (b) it is a deterministic by-construction guarantee (e.g. validity of validated citations), stated as such. Differences within run-to-run variation are reported as unresolved. Any metric derived from the same-family judge is labelled "LLM-judged, not human-validated".
