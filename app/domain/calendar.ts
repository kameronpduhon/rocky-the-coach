import { daysBetween, weekday } from './dates';
import type { DayMode, ISODate, WeekType } from './types';

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

export function templateFor(plan: PlanCalendar, date: ISODate): string | null {
  return plan.training[String(weekday(date))] ?? null;
}

export function optionalTemplateFor(plan: PlanCalendar, date: ISODate): string | null {
  return plan.optional[String(weekday(date))] ?? null;
}

export function isTrainingDay(plan: PlanCalendar, date: ISODate): boolean {
  return templateFor(plan, date) !== null;
}

export function dayMode(date: ISODate): DayMode {
  const d = weekday(date);
  return d === 0 || d === 6 ? 'weekend' : 'weekday';
}

export function isRelaxedDay(plan: PlanCalendar, date: ISODate): boolean {
  return plan.relaxedDays.includes(date);
}
