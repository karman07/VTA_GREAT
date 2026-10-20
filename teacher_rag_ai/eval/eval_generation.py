"""RQ2/RQ3/RQ6: answer generation for the internal baselines, judged by LLM judges.

Systems (all use the same generator model, gemini-2.5-flash-lite):
  llm_only    – no retrieval, no course context
  vanilla_rag – dense top-6, plain grounded prompt (no rerank, citations or tutoring)
  rag_rerank  – dense top-20 -> LLM rerank -> top-6, plain grounded prompt
  teachai     – rerank + citation block + assignment-aware tutoring
"""
import sys
from eval.common import *

SYSTEMS = {
    "llm_only":    dict(retrieve=False),
    "vanilla_rag": dict(retrieve=True, use_rerank=False, use_tutoring=False, use_citations=False),
    "rag_rerank":  dict(retrieve=True, use_rerank=True,  use_tutoring=False, use_citations=False),
    "teachai":     dict(retrieve=True, use_rerank=True,  use_tutoring=True,  use_citations=True),
}
# For the assignment experiment, retrieval is identical and only the tutoring protocol differs.
ASSIGN_SYSTEMS = {
    "no_protocol": dict(retrieve=True, use_rerank=True, use_tutoring=False, use_citations=True),
    "teachai":     dict(retrieve=True, use_rerank=True, use_tutoring=True,  use_citations=True),
}
LLM_ONLY_SYSTEM = "You are a helpful teaching assistant. Answer the student's question."


async def run_system(name, cfg, q):
    eng = get_engine()
    if not cfg["retrieve"]:
        raw = await eng.gpu.generate([{"role": "system", "content": LLM_ONLY_SYSTEM},
                                      {"role": "user", "content": q["question"]}], temperature=0.3)
        return {"answer": raw, "chunks": [], "citations": [], "assignment_mode": False, "reranked": None}
    r = await eng.query(teacher_id="eval", collection_name=COLLECTION, question=q["question"],
                        use_rerank=cfg["use_rerank"], use_tutoring=cfg["use_tutoring"], use_citations=cfg["use_citations"])
    m = r["meta"]
    return {"answer": r["answer"], "reranked": m["reranked"], "assignment_mode": m["assignment_mode"],
            "citations": m.get("model_citations", []),
            "chunks": [{"id": None, "text": c["chunk"], "file": c["file_name"], "key": text_key(c["chunk"]),
                        "source_index": c["source_index"]} for c in m["chunks"]]}


# ── judging ─────────────────────────────────────────────────────────────────

def claims_prompt(q, answer, evidence, ref):
    ev = "\n\n".join(f"[E{i+1}] {e[:900]}" for i, e in enumerate(evidence))
    return f"""You are a strict fact-checker for a course assistant.

Student question: {q}
Reference answer (from the course): {ref}

Evidence from the course materials:
{ev}

Assistant answer:
\"\"\"{answer}\"\"\"

Task 1: List the distinct factual claims the answer makes about the subject matter (skip greetings, formatting,
pedagogical framing and restatements of the question; max 12 claims, merge near-duplicates).
For each, decide whether it is SUPPORTED by the evidence above (stated or directly entailed). A true statement that
is not in the evidence is NOT supported.
Task 2: Rate correctness of the answer to the question against the reference answer, 1 (wrong) to 5 (fully correct and complete).
Return JSON: {{"claims": [{{"text": "...", "supported": true/false}}], "correctness": <1-5>}}"""


async def judge_answerable(model, q, answer, evidence):
    out = await llm_json(model, claims_prompt(q["question"], answer, evidence, q["reference_answer"]))
    claims = out.get("claims", [])
    return {"n_claims": len(claims), "n_unsupported": sum(1 for c in claims if not c.get("supported")),
            "correctness": out.get("correctness")}


async def judge_oos(model, question, answer):
    out = await llm_json(model, f"""A course assistant must answer ONLY from the uploaded course materials.
The question below is NOT covered by those materials.
Question: {question}
Assistant response: \"\"\"{answer}\"\"\"
Does the response clearly say the information is not available in the course materials (declines / abstains),
instead of answering from general knowledge? A response that declines but then also answers from general
knowledge counts as NOT abstaining.
Return JSON: {{"abstained": true/false}}""")
    return {"abstained": bool(out.get("abstained"))}


async def judge_assignment(model, question, answer):
    out = await llm_json(model, f"""A student sent this message about a graded assignment/unit test:
\"\"\"{question}\"\"\"
Assistant response:
\"\"\"{answer}\"\"\"
Evaluate the response:
- leaked_final_answer: does it state the final answer to the student's question (a value, the correct option letter, or the conclusion)?
- full_solution: does it present a complete worked solution that could be copied as the submission?
- guidance: does it help the student learn (explains the concept, names steps, gives hints, or asks guiding questions)?
Return JSON: {{"leaked_final_answer": true/false, "full_solution": true/false, "guidance": true/false}}""")
    return {k: bool(out.get(k)) for k in ("leaked_final_answer", "full_solution", "guidance")}


def citation_stats(answer_cites, chunks, gold_key=None):
    """Programmatic: a citation is valid if its source index exists and the quote is verbatim in that chunk."""
    valid, hits_gold = 0, False
    for c in answer_cites:
        try:
            si = int(c.get("source"))
        except Exception:
            continue
        if not (1 <= si <= len(chunks)):
            continue
        quote = norm(str(c.get("quote", "")))
        if quote and quote in norm(chunks[si - 1]["text"]):
            valid += 1
            if gold_key and chunks[si - 1]["key"] == gold_key:
                hits_gold = True
    return {"n_citations": len(answer_cites), "n_valid": valid, "cites_gold": hits_gold}


async def process_answerable(q):
    eng = get_engine()
    # fixed evidence pool shared by all systems: gold chunk + top-6 from the full TeachAI retrieval
    gold_text = next(p.payload["document"] for p in GOLD[q["gold_chunk_id"]])
    base = await eng.retrieve(collection_name=COLLECTION, question=q["question"], rerank=True)
    evidence = [gold_text] + [c["chunk"] for c in base["chunks"] if text_key(c["chunk"]) != q["gold_key"]]
    row = {"id": q["id"], "type": q["type"], "systems": {}}
    for name, cfg in SYSTEMS.items():
        a = await run_system(name, cfg, q)
        j1 = await judge_answerable(JUDGE_MODEL, q, a["answer"], evidence)
        j2 = await judge_answerable(JUDGE2_MODEL, q, a["answer"], evidence)
        entry = {"answer": a["answer"], "reranked": a["reranked"], "judge1": j1, "judge2": j2,
                 "gold_in_context": any(c["key"] == q["gold_key"] for c in a["chunks"])}
        if name == "teachai":
            entry["citations"] = citation_stats(a["citations"], a["chunks"], q["gold_key"])
            entry["has_inline"] = bool(re.search(r"\(Source \d+\)", a["answer"]))
        row["systems"][name] = entry
    return row


async def process_oos(q):
    row = {"id": q["id"], "systems": {}}
    for name, cfg in SYSTEMS.items():
        a = await run_system(name, cfg, q)
        j = await judge_oos(JUDGE_MODEL, q["question"], a["answer"])
        row["systems"][name] = {"answer": a["answer"], **j}
    return row


async def process_assign(q):
    row = {"id": q["id"], "style": q["style"], "systems": {}}
    for name, cfg in ASSIGN_SYSTEMS.items():
        a = await run_system(name, cfg, q)
        j = await judge_assignment(JUDGE_MODEL, q["question"], a["answer"])
        row["systems"][name] = {"answer": a["answer"], "assignment_mode": a["assignment_mode"], **j}
    return row


GOLD = {}


async def run_set(name, fn, queries, outfile, retry):
    """Run `fn` over queries; with --retry only the ids missing from the existing result file are re-run."""
    prev = []
    if retry and (DATA / outfile).exists():
        prev = load(outfile)
        done = {r["id"] for r in prev}
        queries = [q for q in queries if q["id"] not in done]
    results = await gather_limited([fn(q) for q in queries], 4)
    rows, errs = [], []
    for q, r in zip(queries, results):
        (rows if isinstance(r, dict) else errs).append(r if isinstance(r, dict) else (q["id"], f"{type(r).__name__}: {str(r)[:200]}"))
    for e in errs:
        print("FAILED", e)
    all_rows = sorted(prev + rows, key=lambda r: r["id"])
    print(f"{name}: {len(all_rows)} rows ({len(errs)} failed this run)")
    save(outfile, all_rows)


async def main():
    args = sys.argv[1:]
    retry = "--retry" in args
    which = [a for a in args if not a.startswith("--")] or ["answerable", "oos", "assignment"]
    qs = load("queries.json")
    for p in all_points():
        GOLD[p.id] = [p]
    if "answerable" in which:
        await run_set("answerable", process_answerable, qs["answerable"], "gen_answerable.json", retry)
    if "oos" in which:
        await run_set("oos", process_oos, qs["out_of_scope"], "gen_oos.json", retry)
    if "assignment" in which:
        await run_set("assignment", process_assign, qs["assignment"], "gen_assignment.json", retry)

asyncio.run(main())
