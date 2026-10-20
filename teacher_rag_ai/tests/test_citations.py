"""Offline tests for citations.py: fabricated source ids, altered quotations, missing blocks, valid citations,
offset mapping, deterministic assembly, schema-constrained extraction (with a fake model) and UI status."""
import asyncio, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
import citations as C

P1 = "[Source: deck.pdf]\n[Classification: Text Page 3]\nNewton’s second law states that force equals mass times acceleration.  The unit of force is the newton."
P2 = "K-means clusters data by minimising within-cluster variance.\nThe ﬁrst step is to choose k initial centroids at random."
CHUNKS = [{"chunk": P1}, {"chunk": P2}]


def test_normalization_is_documented_and_punctuation_preserving():
    assert C.normalize("Newton’s  “Law” – ﬁrst\n") == "newton's \"law\" - first"
    assert C.normalize("a,b") != C.normalize("a b")                                  # punctuation is kept


def test_find_span_maps_back_to_original_text():
    q = "force equals mass times acceleration"
    s, e = C.find_span(P1, q)
    assert C.normalize(P1[s:e]) == q
    s, e = C.find_span(P2, "the first step is to choose k initial centroids")      # ligature + case differ from the source
    assert "ﬁrst" in P2[s:e]
    s, e = C.find_span(P1, "newton's second law")                                    # curly apostrophe in the source
    assert P1[s:e].startswith("Newton’s")


def test_valid_citation_is_verified_with_offsets():
    out = C.validate_citations([{"source": 1, "quote": "force equals mass times acceleration"}], CHUNKS)
    assert out[0]["status"] == "verified" and P1[out[0]["start"]:out[0]["end"]] == out[0]["quote"]


def test_fabricated_source_ids_are_rejected_not_repaired():
    raw = [{"source": 7, "quote": "force equals mass times acceleration"}, {"source": 0, "quote": "x" * 20},
           {"source": "abc", "quote": "y" * 20}, {"source": True, "quote": "z" * 20}, {"quote": "no source at all here"}]
    out = C.validate_citations(raw, CHUNKS, repair=True)
    assert [c["status"] for c in out] == ["bad_source"] * 5
    assert all(c["start"] is None for c in out)


def test_altered_quotation_is_not_silently_accepted_or_reattributed():
    # the sentence exists in passage 1, but the model attributes it to passage 2
    out = C.validate_citations([{"source": 2, "quote": "force equals mass times acceleration"}], CHUNKS, repair=True)
    assert out[0]["status"] == "quote_not_found" and out[0]["source"] == 2
    out = C.validate_citations([{"source": 1, "quote": "force is mass multiplied by acceleration of the body"}], CHUNKS)
    assert out[0]["status"] == "quote_not_found"


def test_repair_snaps_near_verbatim_quote_within_same_passage_only():
    near = "force equals mass times acceleraton"                                       # one-character typo
    assert C.validate_citations([{"source": 1, "quote": near}], CHUNKS)[0]["status"] == "quote_not_found"
    fixed = C.validate_citations([{"source": 1, "quote": near}], CHUNKS, repair=True)[0]
    assert fixed["status"] == "repaired" and fixed["source"] == 1 and "acceleration" in fixed["quote"]
    assert C.validate_citations([{"source": 2, "quote": near}], CHUNKS, repair=True)[0]["status"] == "quote_not_found"


def test_short_empty_and_malformed_quotes():
    out = C.validate_citations([{"source": 1, "quote": "law"}, {"source": 1, "quote": "  "}, "not a dict", None], CHUNKS)
    assert [c["status"] for c in out] == ["quote_too_short", "empty_quote", "malformed", "malformed"]


def test_missing_or_non_list_block_yields_no_citations():
    assert C.validate_citations([], CHUNKS) == [] and C.validate_citations(None, CHUNKS) == []
    assert C.validate_citations({"citations": []}, CHUNKS) == []


def test_marker_extraction_covers_observed_formats():
    assert C.extract_markers("x (Source 1) y [Source 6, Source 7]. z (Sources 2 and 3)") == [1, 6, 7, 2, 3]
    assert C.extract_markers("no markers here") == []
    assert C.strip_markers("Force is mass times acceleration (Source 1).").strip() == "Force is mass times acceleration ."


def test_sentence_split_flags_factual_sentences():
    ans = "## Overview\nNewton's second law links force, mass and acceleration (Source 1). What do you think?\n- The unit of force is the newton (Source 1)."
    s = C.split_sentences(ans)
    assert [x["factual"] for x in s] == [False, True, False, True] and s[1]["markers"] == [1]


def test_deterministic_assembly_quotes_are_verbatim_substrings():
    ans = "Force equals mass times acceleration according to Newton's second law (Source 1). K-means minimises within-cluster variance (Source 2)."
    cites = C.assemble_deterministic(ans, CHUNKS)
    assert [c["status"] for c in cites] == ["verified", "verified"] and [c["source"] for c in cites] == [1, 2]
    for c in cites:
        assert CHUNKS[c["source"] - 1]["chunk"][c["start"]:c["end"]] == c["quote"]
        assert C.find_span(CHUNKS[c["source"] - 1]["chunk"], c["quote"]) is not None


def test_deterministic_assembly_reports_out_of_range_markers_and_unaligned_sentences():
    ans = "The learning rate controls the step size in gradient descent (Source 9). Photosynthesis happens in chloroplasts (Source 1)."
    st = {c["source"]: c["status"] for c in C.assemble_deterministic(ans, CHUNKS)}
    assert st == {9: "bad_source", 1: "no_aligned_span"}
    assert C.assemble_deterministic("An answer with no markers at all about nothing in particular.", CHUNKS) == []


def test_structured_extraction_validates_model_output():
    answer = "Force equals mass times acceleration according to Newton's second law (Source 1). K-means minimises within-cluster variance (Source 2)."

    async def fake_post(path, body):
        assert body["response_format"]["json_schema"]["schema"]["properties"]["citations"]["items"]["properties"]["source"]["enum"] == [1, 2]
        out = {"citations": [{"sentence_id": 0, "source": 1, "quote": "force equals mass times acceleration"},
                              {"sentence_id": 1, "source": 2, "quote": "k-means invents a quote that is not in the passage"}]}
        return {"choices": [{"message": {"content": json.dumps(out)}}], "usage": {"prompt_tokens": 1, "completion_tokens": 1}}

    cites, meta = asyncio.run(C.structured_citations(fake_post, "m", answer, CHUNKS))
    assert [c["status"] for c in cites] == ["verified", "quote_not_found"] and meta["called"]

    async def broken_post(path, body):
        return {"choices": [{"message": {"content": "not json"}}]}
    cites, meta = asyncio.run(C.structured_citations(broken_post, "m", answer, CHUNKS))
    assert cites == [] and meta["parse_error"]


def test_summary_and_ui_status():
    answer = "Force equals mass times acceleration according to Newton's second law (Source 1). K-means minimises within-cluster variance (Source 2)."
    cites = [{"sentence_id": 0, "source": 1, "quote": "q", "status": "verified"}, {"sentence_id": 1, "source": 2, "quote": "q", "status": "quote_not_found"}]
    s = C.summarize(cites, answer, 2)
    assert s["n_emitted"] == 2 and s["n_verified"] == 1 and s["n_source_valid"] == 2 and s["factual_with_verified"] == 1 and s["n_factual"] == 2
    assert C.source_status(cites, 1) == "verified" and C.source_status(cites, 2) == "unverified" and C.source_status(cites, 3) == "none"
