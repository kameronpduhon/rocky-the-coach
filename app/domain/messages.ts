import { daysBetween } from './dates';
import type { ISODate } from './types';

export type Situation =
  | 'relaxed-day'
  | 'missed-twice'
  | 'missed-today'
  | 'weigh-in-missing'
  | 'training-day-morning'
  | 'protein-behind'
  | 'steps-behind'
  | 'kitchen-closed'
  | 'on-plan'
  | 'default';

export interface TodayState {
  minutes: number;
  relaxedDay: boolean;
  trainingDay: boolean;
  sessionStarted: boolean;
  loggedSetToday: boolean;
  missedTwice: boolean;
  weighedIn: boolean;
  proteinG: number;
  proteinTarget: number;
  steps: number;
  stepGoal: number;
  onPlan: boolean;
}

export function pickSituation(s: TodayState): Situation {
  if (s.relaxedDay) return 'relaxed-day';
  if (s.missedTwice) return 'missed-twice';
  if (s.trainingDay && s.minutes >= 14 * 60 + 30 && !s.loggedSetToday) return 'missed-today';
  if (!s.weighedIn) return 'weigh-in-missing';
  if (s.trainingDay && s.minutes < 12 * 60 && !s.sessionStarted) return 'training-day-morning';
  if (s.minutes >= 17 * 60 && s.proteinG < 0.6 * s.proteinTarget) return 'protein-behind';
  if (s.minutes >= 17 * 60 && s.steps < 0.6 * s.stepGoal) return 'steps-behind';
  if (s.minutes >= 20 * 60 + 30) return 'kitchen-closed';
  if (s.onPlan) return 'on-plan';
  return 'default';
}

export function renderMessage(
  copy: Partial<Record<Situation, string[]>>,
  situation: Situation,
  date: ISODate,
  vars: Record<string, string | number>,
): string {
  const variants = copy[situation];
  if (!variants || variants.length === 0) throw new Error(`No copy for ${situation}`);
  const index = ((daysBetween('2026-01-01', date) % variants.length) + variants.length) % variants.length;
  return variants[index].replace(/\{(\w+)\}/g, (_, key: string) => String(vars[key] ?? ''));
}
