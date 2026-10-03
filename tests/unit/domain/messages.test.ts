import { describe, expect, it } from 'vitest';
import { pickSituation, renderMessage, type TodayState } from '~/domain/messages';

const base: TodayState = {
  minutes: 9 * 60,
  relaxedDay: false,
  trainingDay: true,
  sessionStarted: false,
  loggedSetToday: false,
  missedTwice: false,
  weighedIn: true,
  proteinG: 61,
  proteinTarget: 180,
  steps: 3120,
  stepGoal: 7500,
  onPlan: false,
};

describe('pickSituation', () => {
  it('lets a relaxed day win over everything', () => {
    expect(pickSituation({ ...base, relaxedDay: true, missedTwice: true })).toBe('relaxed-day');
  });

  it('calls out two missed training days first', () => {
    expect(pickSituation({ ...base, missedTwice: true, weighedIn: false })).toBe('missed-twice');
  });

  it('pushes Plan B after 2:30pm on a training day with no sets', () => {
    expect(pickSituation({ ...base, minutes: 15 * 60 })).toBe('missed-today');
    expect(pickSituation({ ...base, minutes: 15 * 60, loggedSetToday: true })).not.toBe('missed-today');
  });

  it('asks for the weigh-in before anything else routine', () => {
    expect(pickSituation({ ...base, weighedIn: false })).toBe('weigh-in-missing');
  });

  it('sets up the lift on a training morning', () => {
    expect(pickSituation(base)).toBe('training-day-morning');
  });

  it('flags protein and steps behind after 5pm', () => {
    const evening = { ...base, trainingDay: false, minutes: 17 * 60 + 30 };
    expect(pickSituation(evening)).toBe('protein-behind');
    expect(pickSituation({ ...evening, proteinG: 150 })).toBe('steps-behind');
  });

  it('closes the kitchen after 8:30pm', () => {
    expect(pickSituation({ ...base, trainingDay: false, minutes: 20 * 60 + 45, proteinG: 185, steps: 9000 })).toBe('kitchen-closed');
  });

  it('celebrates on-plan days, else defaults', () => {
    const afternoon = { ...base, trainingDay: false, minutes: 13 * 60 };
    expect(pickSituation({ ...afternoon, onPlan: true })).toBe('on-plan');
    expect(pickSituation(afternoon)).toBe('default');
  });
});

describe('renderMessage', () => {
  const copy = { 'on-plan': ['On plan. {streak} days straight.', 'Day {streak}. Keep stacking.'] };

  it('fills variables', () => {
    expect(renderMessage(copy, 'on-plan', '2026-10-12', { streak: 7 })).toMatch(/7/);
  });

  it('uses a different variant on consecutive days', () => {
    expect(renderMessage(copy, 'on-plan', '2026-10-12', { streak: 7 })).not.toBe(
      renderMessage(copy, 'on-plan', '2026-10-13', { streak: 7 }),
    );
  });

  it('throws when a situation has no copy', () => {
    expect(() => renderMessage(copy, 'default', '2026-10-12', {})).toThrow(/No copy for default/);
  });
});
