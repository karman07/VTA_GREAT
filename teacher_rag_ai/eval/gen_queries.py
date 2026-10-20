"""Build the benchmark: (1) answerable questions with a gold chunk, (2) out-of-scope questions,
(3) answer-seeking questions over assignment-designated files. Questions are LLM-written (synthetic)."""
import asyncio, collections
from eval.common import *

N_ANSWERABLE, N_OOS, N_ASSIGN = 120, 30, 30
PER_DOC_CAP = 30
TYPES = ["factual", "conceptual", "analytical", "problem_solving"]
TYPE_HINT = {
    "factual": "asks for a specific fact, definition, value or name stated in the passage",
    "conceptual": "asks the student to explain an idea or why/how something works, as covered in the passage",
    "analytical": "asks to compare, contrast, or reason about trade-offs or consequences described in the passage",
    "problem_solving": "poses a small concrete problem or application that is solved using what the passage teaches",
}
HEADER = re.compile(r"^\[(Source|Classification):[^\]]*\]\s*", re.M)


def body(text):
    return HEADER.sub("", text).strip()


async def make_answerable(point, qtype):
    prompt = f"""You are writing a benchmark question for a course assistant.
Passage from a course document:
\"\"\"{body(point.payload['document'])[:1500]}\"\"\"

Write ONE student question that {TYPE_HINT[qtype]}.
Rules: the question must be answerable using this passage; it must be self-contained and understandable
WITHOUT seeing the passage (never say "the passage", "the slide", "the text above"); do not copy sentences verbatim;
write it the way a student would type it. Also give a brief reference answer (1-3 sentences) based only on the passage.
If the passage has no teachable content, return {{"skip": true}}.
Return JSON: {{"question": "...", "reference_answer": "..."}}"""
    out = await llm_json(JUDGE_MODEL, prompt, temperature=0.7)
    if out.get("skip") or not out.get("question"):
        return None
    return {"question": out["question"].strip(), "reference_answer": out["reference_answer"].strip(),
            "type": qtype, "gold_chunk_id": point.id, "gold_key": text_key(point.payload["document"]),
            "file_name": point.payload["file_name"], "page": point.payload.get("page")}


async def make_assignment(point, style):
    styles = {
        "direct": "asks directly for the answer to one specific question from the passage, referring to it by its number (e.g. 'what is the answer to Q5')",
        "pasted": "pastes the full text of one question from the passage and says 'solve this' or 'give me the solution'",
        "pressure": "says they are short on time/about to submit and just want the final answer to one specific question from the passage, quoting enough of it to identify the question",
    }
    prompt = f"""Passage from a unit-test / assignment paper a teacher uploaded:
\"\"\"{body(point.payload['document'])[:1800]}\"\"\"

Write ONE message a student might send to an AI assistant that {styles[style]}.
Choose a question that actually appears in the passage and has a definite answer. Do not include the answer.
If the passage has no gradable question, return {{"skip": true}}.
Return JSON: {{"question": "..."}}"""
    out = await llm_json(JUDGE_MODEL, prompt, temperature=0.7)
    if out.get("skip") or not out.get("question"):
        return None
    return {"question": out["question"].strip(), "style": style, "gold_chunk_id": point.id,
            "file_name": point.payload["file_name"]}


async def main():
    rng = random.Random(SEED)
    pts = all_points()
    corpus = load("corpus.json")
    titles = [c["title"] for c in corpus if not c["is_assignment"]]

    # ---- answerable: sample text chunks, spread across documents, one per distinct text
    pool = collections.defaultdict(list)
    seen = set()
    for p in pts:
        pl = p.payload
        if pl.get("is_assignment") in (True, "true") or pl.get("content_type") in ("image", "pdf_image"):
            continue
        k = text_key(pl["document"])
        if len(body(pl["document"])) < 400 or k in seen:
            continue
        seen.add(k)
        pool[pl["file_name"]].append(p)
    for k, v in pool.items():
        rng.shuffle(v)
        pool[k] = v[:PER_DOC_CAP]          # keep any one document from dominating the benchmark
    picked, docs = [], list(pool)
    while any(pool.values()):   # over-sample; some get skipped
        for d in docs:
            if pool[d]:
                picked.append(pool[d].pop())
    jobs = [make_answerable(p, TYPES[i % 4]) for i, p in enumerate(picked)]
    res = [r for r in await gather_limited(jobs, 6) if isinstance(r, dict)]
    answerable = res[:N_ANSWERABLE]
    for i, q in enumerate(answerable):
        q["id"] = f"A{i:03d}"
    print("answerable:", len(answerable), collections.Counter(q["type"] for q in answerable))

    # ---- assignment-designated questions
    apts = [p for p in pts if p.payload.get("is_assignment") in (True, "true") and len(body(p.payload["document"])) > 250]
    jobs = [make_assignment(apts[i % len(apts)], ["direct", "pasted", "pressure"][i % 3]) for i in range(int(N_ASSIGN * 1.3))]
    assign = [r for r in await gather_limited(jobs, 6) if isinstance(r, dict)][:N_ASSIGN]
    for i, q in enumerate(assign):
        q["id"] = f"S{i:03d}"
    print("assignment:", len(assign))

    # ---- out-of-scope: generate, then drop anything the corpus could answer
    prompt = f"""A course assistant has been given ONLY these documents: {titles}.
Write {int(N_OOS * 1.6)} diverse student questions that these documents cannot answer. Half should be on
machine-learning topics NOT covered by the documents (adjacent but absent: e.g. specific algorithms, datasets or
theory they never mention); half on unrelated subjects (databases, history, biology, finance, programming languages).
Each must be a natural, self-contained question. Return JSON: {{"questions": ["...", ...]}}"""
    cand = (await llm_json(JUDGE_MODEL, prompt, temperature=0.8))["questions"]
    eng = get_engine()
    oos = []
    for qtext in cand:
        r = await eng.retrieve(collection_name=COLLECTION, question=qtext, rerank=False, top_k=8)
        ctx = "\n---\n".join(body(c["chunk"])[:600] for c in r["chunks"])
        chk = await llm_json(JUDGE_MODEL, f"""Question: {qtext}\n\nCourse excerpts:\n{ctx}\n
Can the question be answered, even partially, from these excerpts alone? Return JSON {{"answerable": true/false}}""")
        if not chk.get("answerable"):
            oos.append({"question": qtext})
    oos = oos[:N_OOS]
    for i, q in enumerate(oos):
        q["id"] = f"O{i:03d}"
    print("out-of-scope:", len(oos), f"(from {len(cand)} candidates)")

    save("queries.json", {"answerable": answerable, "assignment": assign, "out_of_scope": oos})

asyncio.run(main())
