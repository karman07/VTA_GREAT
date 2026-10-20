"""Shared infrastructure for the v2 experiments (run from teacher_rag_ai/ as `python -m eval.v2.<script>`).
 - config.json is the single source of settings
 - ResultStore: append-only JSONL, resumable (a key that already exists is never re-run)
 - every model call is logged (tag, model, tokens, latency, echoed model string) to data/usage.jsonl
 - blinded identifiers for judge/human material
The application code is NOT modified by this module; logging is attached by wrapping GeminiClient._post in-process."""
from __future__ import annotations
import asyncio, contextvars, hashlib, json, os, random, re, sys, time
from pathlib import Path

V2 = Path(__file__).resolve().parent
DATA2 = V2 / "data"
DATA2.mkdir(exist_ok=True)
V1 = V2.parent / "data"
CFG = json.loads((V2 / "config.json").read_text())
os.environ["QDRANT_PATH"] = str(DATA2 / "qdrant")                # frozen copy of the v1 evaluation store

sys.path.insert(0, str(V2.parents[1]))
from dotenv import load_dotenv                                    # noqa: E402
load_dotenv(V2.parents[1] / ".env")
from rag_engine import get_engine                                 # noqa: E402
from gemini_client import GeminiClient                            # noqa: E402

COLLECTION = "eval_course"
TAG: contextvars.ContextVar[str] = contextvars.ContextVar("tag", default="untagged")
_USAGE_FILE = DATA2 / "usage.jsonl"
_orig_post = GeminiClient._post
_usage_lock = None


async def _logged_post(self, path, body, retries=4):
    t0 = time.perf_counter()
    data = await _orig_post(self, path, body, retries)
    rec = {"ts": time.time(), "tag": TAG.get(), "path": path, "model": body.get("model"), "echo": data.get("model"),
           "usage": data.get("usage"), "latency_s": round(time.perf_counter() - t0, 3)}
    with open(_USAGE_FILE, "a") as f:
        f.write(json.dumps(rec) + "\n")
    return data


GeminiClient._post = _logged_post


def engine():
    return get_engine()


def tagged(tag: str):
    TAG.set(tag)


def stable_rng(*parts) -> random.Random:
    """Deterministic RNG derived from the config seed and arbitrary parts (independent of call order)."""
    h = hashlib.sha256("|".join([str(CFG["seed"])] + [str(p) for p in parts]).encode()).hexdigest()
    return random.Random(int(h[:16], 16))


def blind_id(*parts) -> str:
    return hashlib.sha256(("blind|" + str(CFG["seed"]) + "|" + "|".join(map(str, parts))).encode()).hexdigest()[:8]


class ResultStore:
    """Append-only JSONL keyed store. `await store.run(key, coro_fn)` skips keys that already exist."""

    def __init__(self, name: str):
        self.path = DATA2 / name
        self.rows: dict[str, dict] = {}
        if self.path.exists():
            for line in self.path.read_text().splitlines():
                if line.strip():
                    r = json.loads(line)
                    self.rows[r["key"]] = r
        self._lock = asyncio.Lock()

    def has(self, key) -> bool:
        return key in self.rows

    async def run(self, key: str, fn):
        if key in self.rows:
            return self.rows[key]
        res = await fn()
        row = {"key": key, **res}
        async with self._lock:
            self.rows[key] = row
            with open(self.path, "a") as f:
                f.write(json.dumps(row, ensure_ascii=False) + "\n")
        return row


async def gather_limited(coros, limit=None):
    limit = limit or CFG["concurrency"]
    sem = asyncio.Semaphore(limit)

    async def run(c):
        async with sem:
            try:
                return await c
            except Exception as e:                                # noqa: BLE001  (reported by the caller, never swallowed silently)
                return e
    return await asyncio.gather(*(run(c) for c in coros))


def report(results, what: str):
    errs = [r for r in results if isinstance(r, Exception)]
    print(f"{what}: {len(results) - len(errs)} ok, {len(errs)} failed")
    for e in errs[:5]:
        print("   ERROR", type(e).__name__, str(e)[:160])
    return errs


def parse_json(raw: str):
    cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw.strip())
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        return json.loads(re.sub(r'\\(?!["\\/bfnrtu])', r'\\\\', cleaned))      # lone LaTeX backslashes


async def llm_json(model: str, prompt: str, *, schema: dict | None = None, temperature: float = 0.0, retries: int = 3):
    eng = engine()
    last = None
    for _ in range(retries):
        try:
            body = {"model": model, "temperature": temperature, "messages": [{"role": "user", "content": prompt}]}
            body["response_format"] = ({"type": "json_schema", "json_schema": {"name": "out", "strict": True, "schema": schema}}
                                       if schema else {"type": "json_object"})
            data = await eng.gpu._post("/chat/completions", body)
            return parse_json(data["choices"][0]["message"]["content"]), data.get("usage")
        except Exception as e:                                    # noqa: BLE001
            last = e
    raise last


async def generate(system: str, user: str, *, history: list[dict] | None = None, model: str | None = None, temperature=None):
    """One non-streaming generation; returns (text, usage, seconds)."""
    eng = engine()
    msgs = [{"role": "system", "content": system}] + (history or []) + [{"role": "user", "content": user}]
    t0 = time.perf_counter()
    data = await eng.gpu._post("/chat/completions", {
        "model": model or CFG["models"]["generator"], "messages": msgs,
        "temperature": CFG["generation"]["temperature"] if temperature is None else temperature,
        "max_tokens": CFG["generation"]["max_tokens"]})
    return data["choices"][0]["message"]["content"], data.get("usage"), time.perf_counter() - t0


def load_v1(name):
    return json.loads((V1 / name).read_text())


def load2(name):
    return json.loads((DATA2 / name).read_text())


def save2(name, obj):
    (DATA2 / name).write_text(json.dumps(obj, indent=1, ensure_ascii=False))


def text_key(text: str) -> str:
    return hashlib.md5(re.sub(r"\s+", " ", text.lower()).strip().encode()).hexdigest()
