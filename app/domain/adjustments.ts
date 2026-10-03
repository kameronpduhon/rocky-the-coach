import { STEP_CAP } from './steps';

export interface WeekResult {
  /** Weekly change in the 7-day average, negative is a loss. */
  change: number | null;
  onPlan: boolean;
}

export type Adjustment =
  | { kind: 'too-early' }
  | { kind: 'tighten-up' }
  | { kind: 'slow'; newKcal: number; newStepGoal: number | null }
  | { kind: 'fast'; newKcal: number }
  | { kind: 'on-pace' };

const KCAL_FLOOR = 2000;

/** weeks: oldest first; only the last two are used. */
export function decideAdjustment(weeks: WeekResult[], current: { kcal: number; stepGoal: number }): Adjustment {
  const lastTwo = weeks.slice(-2);
  if (lastTwo.length < 2 || lastTwo.some((w) => w.change === null)) return { kind: 'too-early' };
  const [prev, last] = lastTwo as [WeekResult & { change: number }, WeekResult & { change: number }];

  if (!last.onPlan) return { kind: 'tighten-up' };

  if (prev.onPlan && prev.change > -0.5 && last.change > -0.5) {
    return {
      kind: 'slow',
      newKcal: Math.max(KCAL_FLOOR, current.kcal - 150),
      newStepGoal: current.stepGoal < STEP_CAP ? Math.min(current.stepGoal + 1000, STEP_CAP) : null,
    };
  }

  if (prev.change < -2 && last.change < -2) return { kind: 'fast', newKcal: current.kcal + 150 };

  return { kind: 'on-pace' };
}
