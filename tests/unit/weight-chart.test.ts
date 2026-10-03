import { describe, expect, it } from 'vitest';
import { yScale } from '~/components/WeightChart';

describe('yScale', () => {
  it('puts labelled gridlines at or beyond every plotted value', () => {
    expect(yScale(204.7, 207.2)).toEqual({ lo: 204, hi: 208, ticks: [208, 207, 206, 205, 204] });
    expect(yScale(205, 207)).toEqual({ lo: 204, hi: 208, ticks: [208, 207, 206, 205, 204] });
  });

  it('widens the step for a big range', () => {
    const s = yScale(196.4, 207.6);
    expect(s.lo).toBeLessThanOrEqual(196.4);
    expect(s.hi).toBeGreaterThanOrEqual(207.6);
    expect(s.ticks.length).toBeLessThanOrEqual(5);
    expect(s.ticks.at(0)).toBe(s.hi);
    expect(s.ticks.at(-1)).toBe(s.lo);
  });
});
