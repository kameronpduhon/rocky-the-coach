import { describe, expect, it } from 'vitest';
import { decideAdjustment } from '~/domain/adjustments';
import { rampStepGoal } from '~/domain/steps';

const current = { kcal: 2400, stepGoal: 8000 };

describe('decideAdjustment', () => {
  it('waits for two weeks of data', () => {
    expect(decideAdjustment([{ change: -1, onPlan: true }], current)).toEqual({ kind: 'too-early' });
    expect(decideAdjustment([{ change: null, onPlan: true }, { change: -1, onPlan: true }], current)).toEqual({ kind: 'too-early' });
  });

  it('holds numbers when the last week was off plan', () => {
    expect(decideAdjustment([{ change: -0.2, onPlan: true }, { change: 0.1, onPlan: false }], current)).toEqual({ kind: 'tighten-up' });
  });

  it('offers a cut or more steps after two slow weeks on plan', () => {
    expect(decideAdjustment([{ change: -0.3, onPlan: true }, { change: 0, onPlan: true }], current)).toEqual({
      kind: 'slow',
      newKcal: 2250,
      newStepGoal: 9000,
    });
  });

  it('never cuts below 2,000 and stops offering steps at the 10,000 cap', () => {
    expect(decideAdjustment([{ change: 0, onPlan: true }, { change: 0, onPlan: true }], { kcal: 2100, stepGoal: 10000 })).toEqual({
      kind: 'slow',
      newKcal: 2000,
      newStepGoal: null,
    });
  });

  it('adds food after two fast weeks', () => {
    expect(decideAdjustment([{ change: -2.4, onPlan: true }, { change: -2.1, onPlan: true }], current)).toEqual({ kind: 'fast', newKcal: 2550 });
  });

  it('is on pace otherwise', () => {
    expect(decideAdjustment([{ change: -1.0, onPlan: true }, { change: -0.9, onPlan: true }], current)).toEqual({ kind: 'on-pace' });
  });
});

describe('rampStepGoal', () => {
  it('adds 500 when the week averaged at or above the goal', () => {
    expect(rampStepGoal(7500, 7640)).toBe(8000);
  });

  it('holds when the goal was missed', () => {
    expect(rampStepGoal(7500, 7100)).toBe(7500);
  });

  it('caps at 10,000', () => {
    expect(rampStepGoal(9800, 10200)).toBe(10000);
  });
});
