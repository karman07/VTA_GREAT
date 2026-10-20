"""
citations.py — validated citations for VTA.

Everything here is pure and offline-testable except `structured_citations`, which takes the model-call function as an argument.

A *citation* is a plain dict:
    {"sentence_id": int | None,   # which answer sentence it is attached to (None for the legacy free-form block)
     "source": int | None,        # 1-based source number = rank of the passage in the context shown to the model
     "quote": str | None,         # text claimed to be copied from that passage
     "status": str,               # see STATUS below
     "start": int | None, "end": int | None}   # character offsets of the quote in the ORIGINAL passage text

STATUS (validation outcome; the source id is never rewritten or invented):
    verified          source exists and the quote is found verbatim in that passage (after the documented normalisation)
    repaired          source exists; the quote was NOT verbatim but a >= REPAIR_MIN_RATIO-similar span of the *same* passage
                      was found and substituted (reported separately; never counted as verbatim-valid as emitted)
    quote_not_found   source exists, quote is not in that passage and could not be repaired
    bad_source        source id is missing, not an integer, or outside the retrieved context (possible fabrication)
    quote_too_short   quote shorter than MIN_QUOTE_CHARS after normalisation
    empty_quote / malformed
    no_aligned_span   (deterministic assembly only) the marker resolved to a real source but no passage sentence matched
                      the answer sentence well enough to quote
"""
from __future__ import annotations

import difflib
import json
import re
import unicodedata
from typing import Awaitable, Callable, Optional

# Documented normalisation used for every verbatim check: Unicode NFKC, case-folding, typographic quotes/dashes mapped
# to ASCII, zero-width characters removed, runs of whitespace collapsed to one space. Punctuation is preserved.
NORMALIZATION = "NFKC + casefold + typographic quotes/dashes -> ASCII + zero-width removed + whitespace collapsed (punctuation kept)"
MIN_QUOTE_CHARS = 10
REPAIR_MIN_RATIO = 0.90
MAX_QUOTE_CHARS = 300

_ZERO_WIDTH = {"​", "‌", "‍", "⁠", "﻿"}
_CHAR_MAP = {"‘": "'", "’": "'", "‚": "'", "‛": "'", "“": '"', "”": '"', "„": '"',
             "‐": "-", "‑": "-", "‒": "-", "–": "-", "—": "-", "−": "-", " ": " "}
_HEADER = re.compile(r"^\[(?:Source|Classification):[^\]]*\]\s*", re.M)
_STOP = frozenset("""a an the of in on at to for from by with without and or but nor as is are was were be been being it its this that these
those there their they them he she his her we our you your i not no yes can could may might will would shall should do does did done have has
had having which who whom whose what when where why how than then so such also into over under between within about above below up down out
off more most less least very can't won't don't only just each every both either neither any all some other another same own too""".split())


def normalize_with_map(text: str) -> tuple[str, list[int]]:
    """Normalise `text`; also return, for every normalised character, the index of the original character it came from."""
    out: list[str] = []
    idx: list[int] = []
    prev_space = True
    for i, ch in enumerate(text or ""):
        if ch in _ZERO_WIDTH:
            continue
        for c in unicodedata.normalize("NFKC", ch):
            c = _CHAR_MAP.get(c, c)
            for cc in c.casefold():
                if cc.isspace():
                    if not prev_space:
                        out.append(" ")
                        idx.append(i)
                        prev_space = True
                else:
                    out.append(cc)
                    idx.append(i)
                    prev_space = False
    if out and out[-1] == " ":
        out.pop()
        idx.pop()
    return "".join(out), idx


def normalize(text: str) -> str:
    return normalize_with_map(text)[0]


def _clean_quote(q: str) -> str:
    q = (q or "").strip()
    q = re.sub(r"^[\s\"'“”‘’]+|[\s\"'“”‘’]+$", "", q)
    q = re.sub(r"^(\.\.\.|…)\s*|\s*(\.\.\.|…)$", "", q)
    return q.strip()


def find_span(passage: str, quote: str) -> Optional[tuple[int, int]]:
    """Offsets (start, end) of `quote` in the ORIGINAL `passage` if it occurs verbatim after normalisation, else None."""
    nq = normalize(_clean_quote(quote))
    if not nq:
        return None
    npass, idx = normalize_with_map(passage)
    pos = npass.find(nq)
    if pos < 0:
        return None
    return idx[pos], idx[pos + len(nq) - 1] + 1


def repair_quote(passage: str, quote: str, min_ratio: float = REPAIR_MIN_RATIO) -> Optional[tuple[int, int]]:
    """Snap a near-verbatim quote to the most similar span of the SAME passage (never another source).
    Returns original-text offsets, or None if nothing is at least `min_ratio` similar."""
    nq = normalize(_clean_quote(quote))
    if len(nq) < MIN_QUOTE_CHARS:
        return None
    npass, idx = normalize_with_map(passage)
    if not npass:
        return None
    best, best_span = 0.0, None
    L = len(nq)
    # candidate windows start at word boundaries and have length within +-15% of the quote
    starts = [0] + [m.end() for m in re.finditer(r"\s", npass)]
    for s in starts:
        for wl in (L, int(L * 0.9), int(L * 1.1)):
            e = min(len(npass), s + wl)
            if e - s < MIN_QUOTE_CHARS:
                continue
            r = difflib.SequenceMatcher(None, nq, npass[s:e], autojunk=False).ratio()
            if r > best:
                best, best_span = r, (s, e)
    if best_span is None or best < min_ratio:
        return None
    s, e = best_span
    while s > 0 and npass[s - 1] != " ":            # snap to whole words so a repaired quote never cuts a word
        s -= 1
    while e < len(npass) and npass[e] != " ":
        e += 1
    if difflib.SequenceMatcher(None, nq, npass[s:e], autojunk=False).ratio() < min_ratio:
        return None
    return idx[s], idx[e - 1] + 1


# ── answer structure ────────────────────────────────────────────────────────

_MARKER = re.compile(r"[\(\[]\s*(Sources?\s*\d+(?:\s*(?:,|and|&)\s*(?:Sources?\s*)?\d+)*)\s*[\)\]]", re.I)


def extract_markers(text: str) -> list[int]:
    """Source numbers referenced inline, e.g. '(Source 1)', '[Source 6, Source 7]', '(Sources 2 and 3)'."""
    out: list[int] = []
    for m in _MARKER.finditer(text or ""):
        for n in re.findall(r"\d+", m.group(1)):
            if int(n) not in out:
                out.append(int(n))
    return out


def strip_markers(text: str) -> str:
    return re.sub(r"\s{2,}", " ", _MARKER.sub("", text or "")).strip()


def split_sentences(answer: str) -> list[dict]:
    """Deterministic sentence split of a markdown answer. Returns [{id, text, markers, factual}].
    `factual` = at least 6 words after removing markers, not a question, not a colon-ending lead-in."""
    sentences: list[dict] = []
    for block in re.split(r"\n+", answer or ""):
        block = re.sub(r"^\s*(?:#{1,6}\s+|[-*•]\s+|\d+[.)]\s+)", "", block).strip()
        block = re.sub(r"\*\*|__", "", block)
        if not block:
            continue
        parts = re.split(r"(?<=[.!?])\s+(?=[A-Z0-9(\[“\"'$])", block)
        for p in parts:
            p = p.strip()
            if not p:
                continue
            markers = extract_markers(p)
            bare = strip_markers(p)
            words = re.findall(r"[A-Za-z0-9']+", bare)
            sentences.append({"id": len(sentences), "text": p, "bare": bare, "markers": markers,
                              "factual": len(words) >= 6 and not bare.endswith("?") and not bare.endswith(":")})
    return sentences


def _content_words(text: str) -> set[str]:
    return {w for w in re.findall(r"[a-z0-9]{3,}", normalize(text)) if w not in _STOP}


def _passage_sentences(passage: str) -> list[tuple[int, int]]:
    """Sentence-like spans (start, end offsets in the ORIGINAL passage); '[Source: ..]' header lines are skipped."""
    body_off = 0
    m = _HEADER.match(passage)
    while m:
        body_off = m.end()
        m = _HEADER.match(passage, body_off)
    spans: list[tuple[int, int]] = []
    for lm in re.finditer(r"[^\n]+", passage[body_off:]):
        ls, line = body_off + lm.start(), lm.group(0)
        for sm in re.finditer(r".+?(?:[.!?](?=\s|$)|$)", line):
            seg = sm.group(0)
            lead = len(seg) - len(seg.lstrip())
            stripped = seg.strip()
            if len(stripped) >= MIN_QUOTE_CHARS:
                spans.append((ls + sm.start() + lead, ls + sm.start() + lead + len(stripped)))
    return spans


# ── validation ──────────────────────────────────────────────────────────────

def validate_citations(raw: list, chunks: list[dict], *, repair: bool = False) -> list[dict]:
    """Validate model-emitted citations against the passages the model was shown.
    `chunks[i]` is the passage with source number i+1 (needs the key "chunk"). Never alters or invents a source id."""
    out: list[dict] = []
    for c in raw if isinstance(raw, list) else []:
        if not isinstance(c, dict):
            out.append({"sentence_id": None, "source": None, "quote": None, "status": "malformed", "start": None, "end": None})
            continue
        sid = c.get("sentence_id")
        rec = {"sentence_id": sid if isinstance(sid, int) else None, "source": None, "quote": None, "status": "malformed", "start": None, "end": None}
        src = c.get("source")
        try:
            src = int(src) if not isinstance(src, bool) else None
        except (TypeError, ValueError):
            src = None
        quote = c.get("quote")
        rec["source"], rec["quote"] = src, quote if isinstance(quote, str) else None
        if src is None or not (1 <= src <= len(chunks)):
            rec["status"] = "bad_source"
        elif not isinstance(quote, str) or not _clean_quote(quote):
            rec["status"] = "empty_quote"
        elif len(normalize(_clean_quote(quote))) < MIN_QUOTE_CHARS:
            rec["status"] = "quote_too_short"
        else:
            passage = chunks[src - 1]["chunk"]
            span = find_span(passage, quote)
            if span:
                rec.update(status="verified", start=span[0], end=span[1], quote=passage[span[0]:span[1]])
            elif repair and (rspan := repair_quote(passage, quote)):
                rec.update(status="repaired", start=rspan[0], end=rspan[1], quote=passage[rspan[0]:rspan[1]])
            else:
                rec["status"] = "quote_not_found"
        out.append(rec)
    return out


def assemble_deterministic(answer: str, chunks: list[dict], *, min_shared: int = 2) -> list[dict]:
    """No model call. Resolve the inline markers the answer already carries to real passages and quote, verbatim,
    the passage sentence that best matches each answer sentence. Quotes are substrings of the passage by construction."""
    cites: list[dict] = []
    spans_cache: dict[int, list[tuple[int, int]]] = {}
    for s in split_sentences(answer):
        if not s["markers"]:
            continue
        sw = _content_words(s["bare"])
        for n in s["markers"]:
            rec = {"sentence_id": s["id"], "source": n, "quote": None, "status": "bad_source", "start": None, "end": None}
            if not (1 <= n <= len(chunks)):
                cites.append(rec)               # a marker pointing outside the context is reported, not repaired
                continue
            passage = chunks[n - 1]["chunk"]
            spans = spans_cache.setdefault(n, _passage_sentences(passage))
            best, best_span = 0.0, None
            for a, b in spans:
                pw = _content_words(passage[a:b])
                shared = len(sw & pw)
                if shared < min_shared or not pw:
                    continue
                score = shared / (len(sw | pw) or 1)
                if score > best:
                    best, best_span = score, (a, b)
            if best_span is None:
                rec["status"] = "no_aligned_span"
            else:
                a, b = best_span
                if b - a > MAX_QUOTE_CHARS:
                    cut = passage.rfind(" ", a, a + MAX_QUOTE_CHARS)
                    b = cut if cut > a + MIN_QUOTE_CHARS else a + MAX_QUOTE_CHARS
                rec.update(status="verified", quote=passage[a:b], start=a, end=b)
            cites.append(rec)
    return cites


# ── structured (schema-constrained) extraction ──────────────────────────────

def citation_schema(n_sources: int, n_sentences: int) -> dict:
    return {"type": "object", "properties": {"citations": {"type": "array", "items": {"type": "object", "properties": {
        "sentence_id": {"type": "integer", "enum": list(range(n_sentences))},
        "source": {"type": "integer", "enum": list(range(1, n_sources + 1))},
        "quote": {"type": "string"}}, "required": ["sentence_id", "source", "quote"]}}}, "required": ["citations"]}


def structured_prompt(sentences: list[dict], chunks: list[dict]) -> str:
    passages = "\n\n".join(f"[{i + 1}]\n{c['chunk']}" for i, c in enumerate(chunks))
    sents = "\n".join(f"S{s['id']}: {s['bare']}" for s in sentences if s["factual"])
    return (
        "You attach citations to an answer written for a student. For every numbered answer sentence that states a fact "
        "taken from the passages, give ONE citation: the passage number and a quote copied EXACTLY, character for character, "
        "from that passage (at most 250 characters, one contiguous span). Do not paraphrase. If no passage supports a sentence, "
        "omit that sentence. Never use a passage number that is not listed.\n\n"
        f"PASSAGES:\n{passages}\n\nANSWER SENTENCES:\n{sents}\n\n"
        'Return JSON: {"citations": [{"sentence_id": <int>, "source": <passage number>, "quote": "<exact text>"}]}')


async def structured_citations(post: Callable[..., Awaitable[dict]], model: str, answer: str, chunks: list[dict], *,
                               repair: bool = True) -> tuple[list[dict], dict]:
    """One schema-constrained model call (source ids restricted by an enum), then validation. Returns (citations, meta)."""
    sentences = split_sentences(answer)
    factual = [s for s in sentences if s["factual"]]
    if not factual or not chunks:
        return [], {"called": False}
    body = {"model": model, "temperature": 0,
            "messages": [{"role": "user", "content": structured_prompt(sentences, chunks)}],
            "response_format": {"type": "json_schema", "json_schema": {"name": "citations", "strict": True,
                                                                        "schema": citation_schema(len(chunks), len(sentences))}}}
    data = await post("/chat/completions", body)
    raw_text = data["choices"][0]["message"]["content"]
    try:
        raw = json.loads(raw_text).get("citations", [])
    except Exception:
        return [], {"called": True, "parse_error": True, "usage": data.get("usage")}
    return validate_citations(raw, chunks, repair=repair), {"called": True, "usage": data.get("usage"), "n_raw": len(raw)}


# ── summaries ───────────────────────────────────────────────────────────────

VALID_STATUSES = ("verified",)


def summarize(citations: list[dict], answer: str, n_chunks: int) -> dict:
    """Citation metrics for ONE answer (aggregation across answers is done by the evaluation scripts)."""
    sents = split_sentences(answer)
    factual = [s for s in sents if s["factual"]]
    emitted = len(citations)
    src_valid = sum(1 for c in citations if c["status"] != "bad_source" and c["status"] != "malformed")
    verified = [c for c in citations if c["status"] == "verified"]
    attached = {c["sentence_id"] for c in verified if c["sentence_id"] is not None}
    return {"n_sentences": len(sents), "n_factual": len(factual), "n_emitted": emitted, "n_source_valid": src_valid,
            "n_verified": len(verified), "n_repaired": sum(1 for c in citations if c["status"] == "repaired"),
            "has_any": emitted > 0, "has_verified": bool(verified),
            "factual_with_verified": sum(1 for s in factual if s["id"] in attached)}


def source_status(citations: list[dict], source_number: int) -> str:
    """UI status of one retrieved source: 'verified' | 'repaired' | 'unverified' | 'none'."""
    mine = [c for c in citations if c.get("source") == source_number]
    if any(c["status"] == "verified" for c in mine):
        return "verified"
    if any(c["status"] == "repaired" for c in mine):
        return "repaired"
    return "unverified" if mine else "none"
