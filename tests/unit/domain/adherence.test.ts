import { describe, expect, it } from 'vitest';
import { isOnPlan, streak, weekAdherence, weekIsOnPlan, type DayFacts } from '~/domain/adherence';

const good: DayFacts = { proteinG: 185, steps: 8000, offPlanDessert: false, relaxedDay: false, proteinTarget: 180, stepGoal: 7500 };

describe('isOnPlan', () => {
  it('needs protein, steps, and no off-plan dessert', () => {
    expect(isOnPlan(good)).toBe(true);
    expect(isOnPlan({ ...good, proteinG: 150 })).toBe(false);
    expect(isOnPlan({ ...good, steps: 7000 })).toBe(false);
    expect(isOnPlan({ ...good, steps: null })).toBe(false);
    expect(isOnPlan({ ...good, offPlanDessert: true })).toBe(false);
  });

  it('always counts relaxed days', () => {
    expect(isOnPlan({ ...good, proteinG: 0, steps: 0, offPlanDessert: true, relaxedDay: true })).toBe(true);
  });
});

describe('streak', () => {
  it('counts consecutive on-plan days ending yesterday', () => {
    const history = [
      { date: '2026-10-08', onPlan: false },
      { date: '2026-10-09', onPlan: true },
      { date: '2026-10-10', onPlan: true },
      { date: '2026-10-11', onPlan: true },
    ];
    expect(streak(history, '2026-10-12', false)).toBe(3);
  });

  it('adds today once today is on plan', () => {
    expect(streak([{ date: '2026-10-11', onPlan: true }], '2026-10-12', true)).toBe(2);
  });

  it('is zero when yesterday broke it', () => {
    expect(streak([{ date: '2026-10-10', onPlan: true }, { date: '2026-10-11', onPlan: false }], '2026-10-12', false)).toBe(0);
  });

  it('stops at a gap in history', () => {
    expect(streak([{ date: '2026-10-09', onPlan: true }, { date: '2026-10-11', onPlan: true }], '2026-10-12', false)).toBe(1);
  });
});

describe('weekAdherence', () => {
  it('counts on-plan days and calls 6 of 7 on plan', () => {
    const days = [true, true, true, true, true, true, false];
    expect(weekAdherence(days)).toBe(6);
    expect(weekIsOnPlan(6)).toBe(true);
    expect(weekIsOnPlan(5)).toBe(false);
  });
});
