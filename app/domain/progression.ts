import type { ISODate } from './types';

export interface LoggedSet {
  weight: number;
  reps: number;
}

export interface ProgressionRule {
  repMax: number;
  increment: number;
  deload: boolean;
}

export interface Suggestion {
  weight: number | null;
  goUp: boolean;
}

/** How the last session felt, from the optional tap after a workout. */
export type Feel = 'easy' | 'right' | 'hard';

export function nextSuggestion(lastSession: LoggedSet[] | null, rule: ProgressionRule, feel: Feel | null = null): Suggestion {
  if (!lastSession || lastSession.length === 0) return { weight: null, goUp: false };
  const top = Math.max(...lastSession.map((s) => s.weight));
  const atTop = lastSession.every((s) => s.reps >= rule.repMax);
  // Hard holds even at the top. Easy at the top earns a second step.
  const goUp = !rule.deload && atTop && feel !== 'hard';
  const steps = feel === 'easy' ? 2 : 1;
  return { weight: goUp ? top + rule.increment * steps : top, goUp };
}

export function restSeconds(compound: boolean): number {
  return compound ? 150 : 90;
}

/** A stuck lift dropped back at the check-in: this weight for its first session on or after `from` (a Monday). */
export interface LiftDrop {
  weight: number;
  from: ISODate;
}

/** The drop applies to a session on or after its Monday, until the lift has been logged on or after that Monday. */
export function dropApplies(drop: LiftDrop | null, lastSessionDate: ISODate | null, on: ISODate): drop is LiftDrop {
  return drop !== null && on >= drop.from && (lastSessionDate === null || lastSessionDate < drop.from);
}

/** The suggestion with a pending drop applied. After the dropped session, the usual rule runs on it. */
export function withDrop(suggestion: Suggestion, drop: LiftDrop | null, lastSessionDate: ISODate | null, on: ISODate): Suggestion {
  return dropApplies(drop, lastSessionDate, on) ? { weight: drop.weight, goUp: false } : suggestion;
}
