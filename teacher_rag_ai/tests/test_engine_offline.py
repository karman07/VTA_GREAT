"""Offline unit tests (no network): chunking, assignment-level logic, citation parsing, reranker output handling."""
import asyncio, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
os.environ.setdefault("GEMINI_API_KEY", "test-key")
os.environ["QDRANT_PATH"] = ":memory:"

from rag_engine import RAGEngine  # noqa: E402


def make_engine():
    return RAGEngine()


def test_chunking_size_and_overlap():
    e = make_engine()
    text = "".join(chr(97 + i % 26) for i in range(2000))
    chunks = e._chunk_text(text)
    assert all(len(c) <= 800 for c in chunks)
    assert chunks[0][-100:] == chunks[1][:100]          # 100-character overlap


def test_assignment_levels_escalate_and_cap():
    e = make_engine()
    h = lambda n: [{"role": "user", "content": "q"}] * n
    assert "Level 1" in e._assignment_protocol([])
    assert "Level 2" in e._assignment_protocol(h(1))
    assert "Level 3" in e._assignment_protocol(h(2)) and "Level 3" in e._assignment_protocol(h(6))


def _chunk(flag):
    return {"source_index": 1, "chunk": "x", "file_name": "f", "chunk_idx": 0, "is_assignment": flag}


def test_protocol_only_when_flagged_chunk_retrieved():
    e = make_engine()
    assert "ASSIGNMENT PROTOCOL" in e._build_system_prompt([_chunk(True)], [])
    assert "ASSIGNMENT PROTOCOL" not in e._build_system_prompt([_chunk(False)], [])
    assert "ASSIGNMENT PROTOCOL" not in e._build_system_prompt([_chunk(True)], [], tutoring=False)


def test_parse_answer_extracts_citations():
    e = make_engine()
    raw = 'Answer (Source 1).\n<CITATIONS>\n{"citations": [{"source": 1, "quote": "abc"}]}\n</CITATIONS>'
    answer, cites = e._parse_answer(raw)
    assert answer == "Answer (Source 1)." and cites == [{"source": 1, "quote": "abc"}]
    assert e._parse_answer("no block")[1] == []


def test_rerank_handles_missing_scores_and_failure():
    e = make_engine()

    async def fake_post(path, body, retries=4):
        return {"choices": [{"message": {"content": json.dumps({"0": 2, "2": 9})}}]}   # passage 1 missing

    e.gpu._post = fake_post
    ranked = asyncio.run(e.gpu.rerank("q", ["a", "b", "c"], top_n=3))
    assert [r["index"] for r in ranked] == [2, 0, 1]

    async def bad_post(path, body, retries=4):
        return {"choices": [{"message": {"content": json.dumps({"0": 5})}}]}           # 2 of 3 missing
    e.gpu._post = bad_post
    try:
        asyncio.run(e.gpu.rerank("q", ["a", "b", "c"]))
        assert False, "expected failure"
    except ValueError:
        pass
