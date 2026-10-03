import { describe, expect, it } from 'vitest';
import { encodeSwap, parseSwaps, previewWeek, swapFits } from '~/domain/next-week';
import type { RotationMeal } from '~/domain/rotation';

const meals: RotationMeal[] = [
  ...['b1', 'b2', 'b3'].map((slug) => ({ slug, pool: 'breakfast' as const, mode: 'any' as const, tags: [] })),
  ...['m1', 'm2', 'm3', 'm4', 'm5'].map((slug) => ({ slug, pool: 'main' as const, mode: 'any' as const, tags: [] })),
  { slug: 'w1', pool: 'main', mode: 'weekend', tags: [] },
  ...['s1', 's2', 's3'].map((slug) => ({ slug, pool: 'snack' as const, mode: 'any' as const, tags: [] })),
  ...['d1', 'd2', 'd3'].map((slug) => ({ slug, pool: 'dessert' as const, mode: 'any' as const, tags: [] })),
];

describe('swapFits', () => {
  it('needs the same pool, a mode that fits the day, and a meal that is not resting', () => {
    expect(swapFits({ date: '2026-10-20', slot: 'lunch', slug: 'm2' }, meals, [])).toBe(true);
    expect(swapFits({ date: '2026-10-20', slot: 'lunch', slug: 'b1' }, meals, [])).toBe(false);
    expect(swapFits({ date: '2026-10-20', slot: 'dinner', slug: 'w1' }, meals, [])).toBe(false);
    expect(swapFits({ date: '2026-10-24', slot: 'dinner', slug: 'w1' }, meals, [])).toBe(true);
    expect(swapFits({ date: '2026-10-20', slot: 'lunch', slug: 'm2' }, meals, ['m2'])).toBe(false);
  });
});

describe('previewWeek', () => {
  const base = { weekStart: '2026-10-19', meals, lastEaten: {}, rested: [] as string[], swaps: [] };

  it('leaves out rested meals and lays swaps on top', () => {
    const plain = previewWeek(base);
    expect(plain).toHaveLength(35);
    const rested = previewWeek({ ...base, rested: ['m1'] });
    expect(rested.map((p) => p.slug)).not.toContain('m1');
    const swapped = previewWeek({ ...base, swaps: [{ date: '2026-10-21', slot: 'snack', slug: 's3' }] });
    expect(swapped.find((p) => p.date === '2026-10-21' && p.slot === 'snack')!.slug).toBe('s3');
  });
});

describe('parseSwaps', () => {
  it('reads date|slot|slug and drops anything malformed', () => {
    expect(parseSwaps(['2026-10-20|lunch|m2', 'nope', '2026-10-20|brunch|m2', '2026-10-20|lunch|'])).toEqual([{ date: '2026-10-20', slot: 'lunch', slug: 'm2' }]);
    expect(parseSwaps([encodeSwap({ date: '2026-10-21', slot: 'snack', slug: 's3' })])).toEqual([{ date: '2026-10-21', slot: 'snack', slug: 's3' }]);
  });
});
