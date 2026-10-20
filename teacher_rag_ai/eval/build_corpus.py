"""Ingest the evaluation corpus (de-duplicated by extracted text) into an isolated Qdrant store."""
import asyncio, glob, hashlib, sys
import fitz
from eval.common import *

UP = Path(__file__).resolve().parents[2] / "teacher_rag_main" / "uploads"
EXCLUDE_TITLES = ("Software Development & Service Level Agreement",)   # private business contract
ASSIGNMENT_MARKERS = ("Unit Test",)                                    # CBSE unit-test papers = assessments


async def main():
    eng = get_engine()
    files, seen = [], set()
    for f in sorted(glob.glob(str(UP / "*" / "*.pdf"))):
        doc = fitz.open(f)
        text = "".join(p.get_text() for p in doc)
        key = hashlib.md5(norm(text).encode()).hexdigest()
        title = doc[0].get_text().strip().replace("\n", " ")[:80]
        if key in seen or any(t in text[:500] for t in EXCLUDE_TITLES):
            continue
        seen.add(key)
        is_assignment = any(m in text[:600] for m in ASSIGNMENT_MARKERS)
        files.append({"path": f, "file_id": hashlib.md5(f.encode()).hexdigest(), "title": title,
                      "pages": len(doc), "chars": len(text), "is_assignment": is_assignment})
    print(f"{len(files)} unique documents")
    for fi in files:
        res = await eng.ingest_file(teacher_id="eval", collection_name=COLLECTION, file_id=fi["file_id"],
                                    file_path=fi["path"], file_name=fi["title"], is_assignment=fi["is_assignment"])
        fi["chunks"] = res["chunks_added"]
        print(f"  {fi['title'][:50]:50s} pages={fi['pages']:3d} chunks={fi['chunks']:4d} assignment={fi['is_assignment']}")
    save("corpus.json", files)
    print("total chunks:", sum(f["chunks"] for f in files))

asyncio.run(main())
