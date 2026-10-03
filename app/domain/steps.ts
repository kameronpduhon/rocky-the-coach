export const STEP_CAP = 10_000;

export function rampStepGoal(goal: number, weekAverage: number): number {
  return weekAverage >= goal ? Math.min(goal + 500, STEP_CAP) : goal;
}
