import { daysBetween, weekday } from './dates';
import type { DayMode, ISODate, WeekType } from './types';

/** Workouts moved off their usual weekday: date to the template trained that day, or null for a rest day. */
export type Moves = Readonly<Record<ISODate, string | null>>;

export interface PlanCalendar {
  phaseStart: ISODate;
  /** Week number (as a string key) to its special type. Missing weeks are standard. */
  weekTypes: Record<string, WeekType>;
  relaxedDays: ISODate[];
  /** Weekday number (0 = Sunday) to template id. */
  training: Record<string, string>;
  optional: Record<string, string>;
}

export function weekNumber(plan: PlanCalendar, date: ISODate): number {
  const days = daysBetween(plan.phaseStart, date);
  if (days < 0) return 0;
  return Math.floor(days / 7) + 1;
}

export function weekType(plan: PlanCalendar, date: ISODate): WeekType {
  return plan.weekTypes[String(weekNumber(plan, date))] ?? 'standard';
}

export function setsFor(plan: PlanCalendar, date: ISODate): 1 | 2 {
  return weekType(plan, date) === 'deload' ? 1 : 2;
}

export function templateFor(plan: PlanCalendar, date: ISODate, moves: Moves = {}): string | null {
  if (date in moves) return moves[date];
  return plan.training[String(weekday(date))] ?? null;
}

/**
 * The overrides that make two days trade workouts, so moving a workout onto a rest day leaves its old day resting.
 * `usual` marks a day that ends up back on its normal workout and needs no override.
 */
export function swapWorkouts(plan: PlanCalendar, moves: Moves, a: ISODate, b: ISODate): { date: ISODate; templateId: string | null; usual: boolean }[] {
  const onA = templateFor(plan, a, moves);
  const onB = templateFor(plan, b, moves);
  return [
    { date: a, templateId: onB },
    { date: b, templateId: onA },
  ].map((d) => ({ ...d, usual: templateFor(plan, d.date) === d.templateId }));
}

export function optionalTemplateFor(plan: PlanCalendar, date: ISODate): string | null {
  return plan.optional[String(weekday(date))] ?? null;
}

export function isTrainingDay(plan: PlanCalendar, date: ISODate, moves: Moves = {}): boolean {
  return templateFor(plan, date, moves) !== null;
}

export function dayMode(date: ISODate): DayMode {
  const d = weekday(date);
  return d === 0 || d === 6 ? 'weekend' : 'weekday';
}

export function isRelaxedDay(plan: PlanCalendar, date: ISODate): boolean {
  return plan.relaxedDays.includes(date);
}
