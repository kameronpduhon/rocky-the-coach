import { describe, expect, it } from 'vitest';
import { generateWeek, type RotationMeal } from '~/domain/rotation';

const meals: RotationMeal[] = [
  { slug: 'steak-and-eggs', pool: 'breakfast', mode: 'any', tags: [] },
  { slug: 'yogurt-bowl', pool: 'breakfast', mode: 'any', tags: [] },
  { slug: 'egg-hash', pool: 'breakfast', mode: 'any', tags: [] },
  { slug: 'pancakes', pool: 'breakfast', mode: 'any', tags: [] },
  { slug: 'chicken-rice', pool: 'main', mode: 'any', tags: [] },
  { slug: 'steak-potato', pool: 'main', mode: 'any', tags: [] },
  { slug: 'shrimp-rice', pool: 'main', mode: 'any', tags: [] },
  { slug: 'cod-potatoes', pool: 'main', mode: 'any', tags: [] },
  { slug: 'honey-thighs', pool: 'main', mode: 'any', tags: [] },
  { slug: 'steak-egg-bowl', pool: 'main', mode: 'any', tags: [] },
  { slug: 'salmon-rice', pool: 'main', mode: 'any', tags: [] },
  { slug: 'burger-bowl', pool: 'main', mode: 'any', tags: ['ground-beef'] },
  { slug: 'fajita-bowl', pool: 'main', mode: 'weekend', tags: [] },
  { slug: 'steak-salad', pool: 'main', mode: 'weekend', tags: [] },
  { slug: 'yogurt-berries', pool: 'snack', mode: 'any', tags: [] },
  { slug: 'cottage-pineapple', pool: 'snack', mode: 'any', tags: [] },
  { slug: 'shake', pool: 'snack', mode: 'any', tags: [] },
  { slug: 'shrimp-cocktail', pool: 'snack', mode: 'any', tags: [] },
  { slug: 'eggs-fruit', pool: 'snack', mode: 'any', tags: [] },
  { slug: 'protein-ice-cream', pool: 'dessert', mode: 'any', tags: [] },
  { slug: 'yogurt-honey', pool: 'dessert', mode: 'any', tags: [] },
  { slug: 'nice-cream', pool: 'dessert', mode: 'any', tags: [] },
  { slug: 'berries-cream', pool: 'dessert', mode: 'any', tags: [] },
  { slug: 'baked-apple', pool: 'dessert', mode: 'any', tags: [] },
];

const base = { weekStart: '2026-10-12', meals, lastEaten: {}, rested: [] as string[] };

describe('generateWeek', () => {
  it('plans 5 slots for 7 days', () => {
    const plan = generateWeek(base);
    expect(plan).toHaveLength(35);
    expect(plan[0]).toMatchObject({ date: '2026-10-12', slot: 'breakfast' });
    expect(plan[34]).toMatchObject({ date: '2026-10-18', slot: 'dessert' });
  });

  it('is deterministic for the same input', () => {
    expect(generateWeek(base)).toEqual(generateWeek(base));
  });

  it('never plans weekend-only meals on weekdays', () => {
    const plan = generateWeek(base);
    const weekdayPicks = plan.filter((p) => p.date < '2026-10-17').map((p) => p.slug);
    expect(weekdayPicks).not.toContain('fajita-bowl');
    expect(weekdayPicks).not.toContain('steak-salad');
  });

  it('allows weekday-mode meals on weekends', () => {
    const weekdayOnly = meals.map((m) => (m.pool === 'breakfast' ? { ...m, mode: 'weekday' as const } : m));
    const plan = generateWeek({ ...base, meals: weekdayOnly });
    const weekendBreakfasts = plan.filter((p) => p.date >= '2026-10-17' && p.slot === 'breakfast');
    expect(weekendBreakfasts).toHaveLength(2);
  });

  it('never plans rested meals', () => {
    const plan = generateWeek({ ...base, rested: ['chicken-rice'] });
    expect(plan.map((p) => p.slug)).not.toContain('chicken-rice');
  });

  it('plans ground beef at most once a week', () => {
    const plan = generateWeek(base);
    expect(plan.filter((p) => p.slug === 'burger-bowl').length).toBeLessThanOrEqual(1);
  });

  it('caps every meal at twice a week when the pool allows it', () => {
    const plan = generateWeek(base);
    const counts = new Map<string, number>();
    for (const p of plan) counts.set(p.slug, (counts.get(p.slug) ?? 0) + 1);
    for (const [, n] of counts) expect(n).toBeLessThanOrEqual(2);
  });

  it('never repeats a meal on consecutive days in the same pool when the pool allows it', () => {
    const plan = generateWeek(base);
    const byDate = new Map<string, string[]>();
    for (const p of plan) byDate.set(p.date, [...(byDate.get(p.date) ?? []), p.slug]);
    const dates = [...byDate.keys()];
    for (let i = 1; i < dates.length; i++) {
      const today = new Set(byDate.get(dates[i]));
      for (const slug of byDate.get(dates[i - 1])!) expect(today.has(slug)).toBe(false);
    }
  });

  it('serves different lunch and dinner on the same day', () => {
    const plan = generateWeek(base);
    for (let d = 0; d < 7; d++) {
      const day = plan.slice(d * 5, d * 5 + 5);
      const lunch = day.find((p) => p.slot === 'lunch')!.slug;
      const dinner = day.find((p) => p.slot === 'dinner')!.slug;
      expect(lunch).not.toBe(dinner);
    }
  });

  it('prefers meals not eaten recently', () => {
    const lastEaten = {
      'steak-and-eggs': '2026-10-11',
      'yogurt-bowl': '2026-10-10',
      'egg-hash': '2026-10-09',
    };
    const plan = generateWeek({ ...base, lastEaten });
    expect(plan[0].slug).toBe('pancakes');
  });

  it('relaxes the weekly cap before giving up when the pool is tiny', () => {
    const tiny = meals.filter((m) => m.pool !== 'breakfast').concat([
      { slug: 'only-a', pool: 'breakfast', mode: 'any', tags: [] },
      { slug: 'only-b', pool: 'breakfast', mode: 'any', tags: [] },
    ]);
    const plan = generateWeek({ ...base, meals: tiny });
    const breakfasts = plan.filter((p) => p.slot === 'breakfast').map((p) => p.slug);
    expect(breakfasts).toHaveLength(7);
    for (let i = 1; i < 7; i++) expect(breakfasts[i]).not.toBe(breakfasts[i - 1]);
  });
});
