"""Corpus statistics (Table 3) and a diagnosis of strict-verbatim citation failures."""
import collections, difflib
from eval.common import *

def squash(t):                       # ignore case, whitespace and punctuation
    return re.sub(r"[^a-z0-9]+", "", t.lower())

async def main():
    pts = all_points()
    kinds = collections.Counter(p.payload.get("content_type", "?") for p in pts)
    corpus = load("corpus.json")
    q = load("queries.json")
    stats = {"n_chunks": len(pts), "by_type": dict(kinds),
             "n_image_chunks": sum(v for k, v in kinds.items() if "image" in k),
             "n_docs": len(corpus),
             "n_assign": sum(1 for c in corpus if c["is_assignment"]),
             "n_decks": sum(1 for c in corpus if not c["is_assignment"] and "QLORA" not in c["title"].upper()),
             "nq": {"answerable": len(q["answerable"]), "oos": len(q["out_of_scope"]), "assign": len(q["assignment"])}}
    save("corpus_stats.json", stats)
    print(stats)

    eng = get_engine()
    cats = collections.Counter()
    qs = q["answerable"][:40]
    async def one(item):
        r = await eng.query(teacher_id="eval", collection_name=COLLECTION, question=item["question"])
        out = []
        for c in r["meta"]["model_citations"]:
            try:
                si = int(c.get("source"))
            except Exception:
                out.append("bad_source"); continue
            if not 1 <= si <= len(r["meta"]["chunks"]):
                out.append("source_out_of_range"); continue
            chunk = r["meta"]["chunks"][si - 1]["chunk"]; quote = str(c.get("quote", ""))
            if norm(quote) in norm(chunk): out.append("verbatim")
            elif squash(quote) in squash(chunk): out.append("verbatim_ignoring_punct_ws")
            else:
                sm = difflib.SequenceMatcher(None, squash(quote), squash(chunk), autojunk=False)
                m = sm.find_longest_match(0, len(squash(quote)), 0, len(squash(chunk)))
                cov = m.size / max(1, len(squash(quote)))
                out.append("near_verbatim(>=80%)" if cov >= .8 else "paraphrase_or_wrong(<80%)")
        return out
    for res in await gather_limited([one(i) for i in qs], 4):
        if isinstance(res, list):
            cats.update(res)
    print("citation diagnosis:", dict(cats), "total", sum(cats.values()))
    stats["citation_diagnosis"] = dict(cats)
    save("corpus_stats.json", stats)

asyncio.run(main())
