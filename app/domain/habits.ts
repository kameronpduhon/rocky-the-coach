import { addDays, weekStart } from "./dates";
import type { ISODate } from "./types";

export const DESSERT_ALLOWANCE = 2;
export const COUNTING_STEPS = 3000;

/** What happened on one day, for the habit rules. */
export interface DayActivity {
  weighIn: boolean;
  mealLogged: boolean;
  /** A set logged or an exercise checked off. */
  workout: boolean;
  steps: number;
  relaxed: boolean;
}

/** A day counts if any one thing happened. Relaxed days in the plan always count. */
export function countedDay(a: DayActivity): boolean {
  return a.relaxed || a.weighIn || a.mealLogged || a.workout || a.steps >= COUNTING_STEPS;
}

/**
 * Counted days walking back from today. A single uncounted day is stepped over, not broken; two in a row end it.
 * Today only ever adds: until it is over it cannot break anything.
 */
export function habitStreak(counted: (d: ISODate) => boolean, today: ISODate, firstDay: ISODate): number {
  let count = counted(today) ? 1 : 0;
  let gap = 0;
  for (let d = addDays(today, -1); d >= firstDay; d = addDays(d, -1)) {
    if (counted(d)) {
      count++;
      gap = 0;
    } else if (++gap === 2) {
      break;
    }
  }
  return count;
}

/** The dessert row's words. Over the allowance it is just the count, in the same ink: no warning. */
export function dessertAllowance(usedThisWeek: number): string {
  return usedThisWeek <= DESSERT_ALLOWANCE ? `${DESSERT_ALLOWANCE - usedThisWeek} of ${DESSERT_ALLOWANCE} left this week` : `${usedThisWeek} this week`;
}

/** Days with an off-plan dessert past the second of its Monday-to-Sunday week. */
export function overAllowanceDates(desserts: { date: ISODate; at: string }[]): Set<ISODate> {
  const perWeek = new Map<ISODate, number>();
  const over = new Set<ISODate>();
  for (const d of [...desserts].sort((a, b) => a.date.localeCompare(b.date) || a.at.localeCompare(b.at))) {
    const week = weekStart(d.date);
    const n = (perWeek.get(week) ?? 0) + 1;
    perWeek.set(week, n);
    if (n > DESSERT_ALLOWANCE) over.add(d.date);
  }
  return over;
}

export interface FullDayFacts {
  proteinG: number;
  proteinTarget: number;
  steps: number;
  stepGoal: number;
  relaxedDay: boolean;
  overAllowance: boolean;
}

/** The check-in's "full day": protein and steps met, and no dessert past the week's allowance. */
export function fullDay(f: FullDayFacts): boolean {
  if (f.relaxedDay) return true;
  return f.proteinG >= f.proteinTarget && f.steps >= f.stepGoal && !f.overAllowance;
}
