"""E-gen: generation for the controlled ablation. The generator model, temperature and frozen context are held fixed;
only the factor under test changes.
  L    LLM-only (no retrieval)
  V    dense top-6, plain grounded prompt
  R    frozen reranked top-6, plain grounded prompt            (V->R isolates reranking)
  RC   R + citation-block instructions                          (R->RC isolates citation instructions)
  FULL RC + assignment protocol (active only if a flagged chunk is in the top-6)   (RC->FULL isolates assignment mode)
Each (query, condition, run) is stored with raw output, parsed answer, legacy citations, usage and latency."""
import sys
from eval.v2.core import *
from eval.v2.contexts import STORE as FROZEN, qkey, chunks_for

LLM_ONLY_SYSTEM = "You are a helpful teaching assistant. Answer the student's question."
COND = {"L": None, "V": ("dense", False, False), "R": ("rerank", False, False),
        "RC": ("rerank", False, True), "FULL": ("rerank", True, True)}
OUT = ResultStore("generations.jsonl")


async def one(qset, q, cond, run):
    key = f"{qset}|{q['id']}|{cond}|{run}"

    async def go():
        tagged(f"gen:{cond}")
        if cond == "L":
            raw, usage, secs = await generate(LLM_ONLY_SYSTEM, q["question"])
            return {"qset": qset, "qid": q["id"], "cond": cond, "run": run, "raw": raw, "answer": raw, "citations": [],
                    "chunks": [], "assignment_mode": False, "usage": usage, "latency_s": secs}
        mode, tut, cit = COND[cond]
        f = FROZEN.rows[qkey(q["question"])]
        chunks = chunks_for(f, mode)
        eng = engine()
        flagged = any(c["is_assignment"] for c in chunks)
        system = eng._build_system_prompt(chunks, [], tutoring=tut, citations=cit)
        raw, usage, secs = await generate(system, q["question"])
        answer, cites = eng._parse_answer(raw)
        return {"qset": qset, "qid": q["id"], "cond": cond, "run": run, "raw": raw, "answer": answer, "citations": cites,
                "chunks": [{k: c[k] for k in ("source_index", "chunk", "file_name", "chunk_idx", "page", "is_assignment", "key")} for c in chunks],
                "assignment_mode": bool(tut and flagged), "usage": usage, "latency_s": secs}
    return await OUT.run(key, go)


async def main(runs):
    Q = load_v1("queries.json")
    jobs = []
    for run in range(runs):
        for q in Q["answerable"]:
            for c in ("L", "V", "R", "RC", "FULL"):
                if c == "FULL":
                    f = FROZEN.rows[qkey(q["question"])]
                    if not any(x["is_assignment"] for x in chunks_for(f, "rerank")):
                        continue                                  # FULL == RC when the protocol is inactive
                jobs.append(one("ans", q, c, run))
        for q in Q["out_of_scope"]:
            for c in ("L", "V", "R", "RC"):
                jobs.append(one("oos", q, c, run))
        for q in Q["assignment"]:
            for c in ("RC", "FULL"):
                jobs.append(one("asg", q, c, run))
    print("jobs:", len(jobs))
    res = await gather_limited(jobs)
    report(res, "generation")

if __name__ == "__main__":
    asyncio.run(main(int(sys.argv[1]) if len(sys.argv) > 1 else CFG["runs"]))
