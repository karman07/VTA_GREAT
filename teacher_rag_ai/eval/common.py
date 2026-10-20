"""Shared helpers for the evaluation scripts. Run everything from teacher_rag_ai/ as `python -m eval.<script>`."""
import os, json, asyncio, re, hashlib, random
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
os.environ.setdefault("QDRANT_PATH", str(DATA / "qdrant"))   # isolated from the live service store

COLLECTION = "eval_course"
SEED = 7

from rag_engine import get_engine  # noqa: E402  (after QDRANT_PATH is set)


def load(name):
    return json.loads((DATA / name).read_text())


def save(name, obj):
    (DATA / name).write_text(json.dumps(obj, indent=2, ensure_ascii=False))


def norm(text: str) -> str:
    return re.sub(r"\s+", " ", text.lower()).strip()


def text_key(text: str) -> str:
    """Identical text (e.g. the same slide deck uploaded twice) maps to one relevance class."""
    return hashlib.md5(norm(text).encode()).hexdigest()


def all_points():
    """Every indexed chunk of the eval collection (payload only)."""
    eng = get_engine()
    pts, offset = [], None
    while True:
        res, offset = eng.gpu._qdrant.scroll(COLLECTION, limit=256, offset=offset, with_payload=True)
        pts.extend(res)
        if offset is None:
            break
    return pts


async def gather_limited(coros, limit=4):
    sem = asyncio.Semaphore(limit)

    async def run(c):
        async with sem:
            return await c
    return await asyncio.gather(*(run(c) for c in coros), return_exceptions=True)


JUDGE_MODEL = os.environ.get("JUDGE_MODEL", "gemini-2.5-flash")
JUDGE2_MODEL = os.environ.get("JUDGE2_MODEL", "gemini-2.5-flash-lite")


async def llm_json(model: str, prompt: str, temperature: float = 0.0, retries: int = 3):
    eng = get_engine()
    last = None
    for _ in range(retries):
        try:
            data = await eng.gpu._post("/chat/completions", {
                "model": model, "temperature": temperature,
                "messages": [{"role": "user", "content": prompt}],
                "response_format": {"type": "json_object"},
            })
            raw = data["choices"][0]["message"]["content"]
            cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw.strip())
            try:
                return json.loads(cleaned)
            except json.JSONDecodeError:
                # LaTeX in claims produces lone backslashes (e.g. \alpha) that are invalid JSON escapes
                return json.loads(re.sub(r'\\(?!["\\/bfnrtu])', r'\\\\', cleaned))
        except Exception as e:
            last = e
    raise last
