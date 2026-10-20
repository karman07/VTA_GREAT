// study.instruments.ts — survey instruments and pure scoring helpers.
// Item wording is identical to Appendix B of the paper; the frontends fetch it from the API so there is one source of truth.

export const SUS_ITEMS: string[] = [
  'I think that I would like to use this system frequently.',
  'I found the system unnecessarily complex.',
  'I thought the system was easy to use.',
  'I think that I would need technical support to use this system.',
  'I found the various functions in this system well integrated.',
  'I thought there was too much inconsistency in this system.',
  'I would imagine that most people would learn to use this system very quickly.',
  'I found the system very cumbersome to use.',
  'I felt very confident using the system.',
  'I needed to learn a lot of things before I could get going with this system.',
];

export const USEFULNESS_ITEMS: string[] = [
  'The responses were relevant to the course materials.',
  'The provided citations were useful.',
  'The explanations improved my understanding of the topic.',
  'The AI assistant helped me locate information efficiently.',
  'The assignment guidance supported learning without revealing direct solutions.',
  'The multimodal support improved comprehension of visual materials.',
  'The platform increased my confidence in the subject.',
  'I would recommend this platform to other students.',
];

export const RUBRIC_DIMENSIONS = [
  { key: 'relevance', label: 'Relevance', description: 'Alignment with the student query' },
  { key: 'factualAccuracy', label: 'Factual accuracy', description: 'Correctness relative to the source material' },
  { key: 'groundingQuality', label: 'Grounding quality', description: 'Degree of support from the retrieved evidence' },
  { key: 'educationalValue', label: 'Educational value', description: 'Effectiveness of the explanation' },
  { key: 'citationQuality', label: 'Citation quality', description: 'Accuracy and usefulness of source attribution (skip if the answer has no citations)' },
] as const;

export const CITATION_SUPPORT_VALUES = ['yes', 'partly', 'no', 'none'] as const;
export type CitationSupport = (typeof CITATION_SUPPORT_VALUES)[number];

export const DEFAULT_CONSENT_TEXT =
  'This class is taking part in a research study on an AI teaching assistant. If you agree, your questions, the assistant’s answers, ' +
  'your ratings of those answers and your survey responses will be used for research and may be reviewed by teachers or researchers. ' +
  'Your name and email are never included in the research data. Taking part is voluntary, does not affect your grades, and you can ' +
  'decline or stop at any time without giving a reason. Declining does not change how the assistant works for you.';

export const MIN_ANSWERS_BEFORE_SURVEY = 5;

export function isLikert(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 5;
}

export function validateLikertAnswers(answers: unknown, expectedLength: number): number[] {
  if (!Array.isArray(answers) || answers.length !== expectedLength || !answers.every(isLikert)) {
    throw new Error(`Expected ${expectedLength} integer answers between 1 and 5`);
  }
  return answers as number[];
}

/** Standard SUS scoring (Brooke, 1996): odd items contribute (x - 1), even items (5 - x); the sum is scaled by 2.5 to 0-100. */
export function susScore(answers: number[]): number {
  validateLikertAnswers(answers, 10);
  const sum = answers.reduce((acc, x, i) => acc + (i % 2 === 0 ? x - 1 : 5 - x), 0);
  return sum * 2.5;
}

/** Mean of the Likert items (1-5). */
export function meanScore(answers: number[]): number {
  return answers.reduce((a, b) => a + b, 0) / answers.length;
}

export function mean(xs: number[]): number | null {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}
