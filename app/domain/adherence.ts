import { addDays } from './dates';
import type { ISODate } from './types';

export interface DayFacts {
  proteinG: number;
  steps: number | null;
  offPlanDessert: boolean;
  relaxedDay: boolean;
  proteinTarget: number;
  stepGoal: number;
}

export function isOnPlan(f: DayFacts): boolean {
  if (f.relaxedDay) return true;
  return f.proteinG >= f.proteinTarget && (f.steps ?? 0) >= f.stepGoal && !f.offPlanDessert;
}

export function streak(history: { date: ISODate; onPlan: boolean }[], today: ISODate, todayOnPlan: boolean): number {
  const byDate = new Map(history.map((h) => [h.date, h.onPlan]));
  let count = 0;
  let d = addDays(today, -1);
  while (byDate.get(d) === true) {
    count++;
    d = addDays(d, -1);
  }
  return count + (todayOnPlan ? 1 : 0);
}

export function weekAdherence(days: boolean[]): number {
  return days.filter(Boolean).length;
}

export function weekIsOnPlan(onPlanDays: number): boolean {
  return onPlanDays >= 6;
}
