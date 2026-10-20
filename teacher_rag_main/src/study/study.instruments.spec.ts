import { susScore, meanScore, validateLikertAnswers, SUS_ITEMS, USEFULNESS_ITEMS } from './study.instruments';

describe('study instruments', () => {
  it('has the Appendix B item counts', () => {
    expect(SUS_ITEMS).toHaveLength(10);
    expect(USEFULNESS_ITEMS).toHaveLength(8);
  });

  it('scores the best possible SUS pattern as 100', () => {
    // agree (5) with positive odd items, disagree (1) with negative even items
    expect(susScore([5, 1, 5, 1, 5, 1, 5, 1, 5, 1])).toBe(100);
  });

  it('scores the worst possible SUS pattern as 0', () => {
    expect(susScore([1, 5, 1, 5, 1, 5, 1, 5, 1, 5])).toBe(0);
  });

  it('scores an all-neutral SUS response as 50', () => {
    expect(susScore(Array(10).fill(3))).toBe(50);
  });

  it('computes the usefulness mean', () => {
    expect(meanScore([5, 4, 3, 4, 5, 4, 3, 4])).toBeCloseTo(4);
  });

  it('rejects malformed answers', () => {
    expect(() => validateLikertAnswers([1, 2, 3], 10)).toThrow();
    expect(() => validateLikertAnswers([1, 2, 3, 4, 5, 6, 1, 1, 1, 1], 10)).toThrow();
    expect(() => validateLikertAnswers([1.5, 2, 3, 4, 5, 1, 1, 1, 1, 1], 10)).toThrow();
  });
});
