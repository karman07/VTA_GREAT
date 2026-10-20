# TeachAI evaluation harness

Reproduces the results in the paper. Needs `GEMINI_API_KEY` in `.env`. Run from `teacher_rag_ai/`
(each script uses its own embedded Qdrant store under `eval/data/qdrant`; only one process may open it at a time).

```
python -m eval.build_corpus      # ingest the de-duplicated PDFs (reads ../teacher_rag_main/uploads)
python -m eval.gen_queries       # LLM-written benchmark: answerable / out-of-scope / assignment
python -m eval.eval_retrieval    # dense vs LLM-reranked retrieval (Recall@K, MRR)
python -m eval.eval_generation   # four baselines + judges; add `--retry` to fill missing queries
python -m eval.eval_latency      # streaming TTFT / total latency at 1, 5, 10 concurrent requests
python -m eval.eval_timing       # embed / search / rerank stage timings
python -m eval.extras            # corpus statistics + citation diagnosis
python -m eval.analyze           # tables -> eval/data/results.json
```

Raw per-query outputs are in `eval/data/*.json`. The benchmark is synthetic and judged by LLMs; see Section 8 of the paper.
Unit tests (offline): `pytest tests`.
