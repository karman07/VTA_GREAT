import axios from 'axios';

export const RAG_SERVICE_URL = process.env.RAG_SERVICE_URL ?? 'http://localhost:8000';

/** A failure the user can be told about (the question should not be counted). */
export class RagFailure extends Error {
  constructor(public readonly userMessage: string, detail?: string) {
    super(detail ?? userMessage);
  }
}

export type RagEvent =
  | { type: 'token'; text: string }
  | { type: 'final'; answer: string; sources: any[] };

const META = '\n[METADATA]';
const ERR = '\n[ERROR]';
// The model appends a machine-readable <CITATIONS> block to its answer; it is never shown to users.
const CIT = '<CITATIONS>';
const MARKERS = [META, ERR, CIT];
const HOLD = Math.max(...MARKERS.map((m) => m.length));

/** Scope a question to a single document (understood by the RAG service). */
export const scopeToFile = (question: string, fileId?: string) =>
  fileId ? `[Context: Only answer from the file with id ${fileId}] ${question}` : question;

/**
 * Calls the RAG service and yields answer tokens as they arrive, then one `final` event with the
 * clean answer and its sources. Throws RagFailure when no usable answer was produced.
 */
export async function* ragAnswer(opts: {
  teacherId: string;
  collectionName: string;
  question: string;
  history: { role: string; content: string }[];
  signal?: AbortSignal;
}): AsyncGenerator<RagEvent> {
  let upstream;
  try {
    upstream = await axios.post(
      `${RAG_SERVICE_URL}/query-stream`,
      {
        teacher_id: opts.teacherId,
        collection_name: opts.collectionName,
        question: opts.question,
        top_k: 8,
        chat_history: opts.history.slice(-8),
      },
      { responseType: 'stream', timeout: 120_000, signal: opts.signal },
    );
  } catch (e: any) {
    if (opts.signal?.aborted) throw e;
    throw new RagFailure('The assistant is unavailable right now. Your question was not counted — please try again shortly.', e.message);
  }

  let raw = '';
  let emitted = 0;
  let started = false;
  const firstMarker = () => Math.min(...MARKERS.map((m) => { const i = raw.indexOf(m); return i < 0 ? Infinity : i; }));

  for await (const chunk of upstream.data as AsyncIterable<Buffer>) {
    raw += chunk.toString('utf8');
    const marker = firstMarker();
    const safeEnd = Number.isFinite(marker) ? marker : Math.max(emitted, raw.length - HOLD);
    if (safeEnd > emitted) {
      let text = raw.slice(emitted, safeEnd);
      if (!started) {
        text = text.replace(/^\s+/, '');
        if (text) started = true;
      }
      if (text) yield { type: 'token', text };
      emitted = safeEnd;
    }
  }

  const errIdx = raw.indexOf(ERR);
  if (errIdx >= 0) {
    throw new RagFailure(
      'The assistant could not answer right now. Your question was not counted — please try again.',
      raw.slice(errIdx + ERR.length, errIdx + 300),
    );
  }
  const metaIdx = raw.indexOf(META);
  const citIdx = raw.indexOf(CIT);
  const answerEnd = Math.min(metaIdx >= 0 ? metaIdx : raw.length, citIdx >= 0 ? citIdx : raw.length);
  const answer = raw.slice(0, answerEnd).trim();
  if (!answer) {
    throw new RagFailure('The assistant returned an empty answer. Your question was not counted — please try again.');
  }
  if (answerEnd > emitted) {
    let tail = raw.slice(emitted, answerEnd);
    if (!started) tail = tail.replace(/^\s+/, '');
    if (tail) yield { type: 'token', text: tail };
  }
  let sources: any[] = [];
  if (metaIdx >= 0) {
    try { sources = JSON.parse(raw.slice(metaIdx + META.length)).sources ?? []; } catch { sources = []; }
  }
  yield { type: 'final', answer, sources };
}

/** Stored text passages of a file, in reading order (document viewer fallback for non-PDF types). */
export async function fetchFileChunks(collectionName: string, fileId: string) {
  const res = await axios.get(`${RAG_SERVICE_URL}/files/${fileId}/text`, {
    params: { collection_name: collectionName },
    timeout: 30_000,
  });
  return (res.data?.chunks ?? []) as { idx: number; page: number | null; kind: string; text: string }[];
}
