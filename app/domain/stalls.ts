// Stuck lifts (spec call 5) and the weight to drop back to (call 6). Pure: the check-in page and finishCheckIn share it.
import type { LoggedSet } from "./progression";
import type { ISODate } from "./types";

export interface LiftSession {
  date: ISODate;
  sets: LoggedSet[];
  deload: boolean;
}

export interface LiftHistory {
  exercise: string;
  increment: number;
  bodyWeight: boolean;
  /** The top of the rep range, from the newest session's lift list. */
  repMax: number;
  /** Sessions with logged sets, oldest first. */
  sessions: LiftSession[];
}

export interface StuckLift {
  exercise: string;
  top: number;
  /** The third session's sets: "45 × 8, 7". */
  lastSets: LoggedSet[];
  /** Next week's reps to chase, one per set: the best set's reps. */
  chase: number[];
  drop: number;
}

/** How many sessions in a row make a stall. */
export const STALL_SESSIONS = 3;

const topOf = (sets: LoggedSet[]) => Math.max(...sets.map((s) => s.weight));
const repsOf = (sets: LoggedSet[]) => sets.reduce((n, s) => n + s.reps, 0);

/** About 10% lighter, to the lift's increment: at least one increment below the top, and never below one increment. */
export function dropWeight(top: number, increment: number): number {
  return Math.max(increment, Math.min(top - increment, Math.round((top * 0.9) / increment) * increment));
}

/** The heaviest set, then the most reps at that weight. */
export function bestSet(sets: LoggedSet[]): LoggedSet {
  const top = topOf(sets);
  return sets.filter((s) => s.weight === top).reduce((a, b) => (b.reps > a.reps ? b : a));
}

export function stuckLifts(lifts: LiftHistory[], weekStart: ISODate, weekEnd: ISODate, setsNext: number): StuckLift[] {
  const out: StuckLift[] = [];
  for (const lift of lifts) {
    if (lift.bodyWeight) continue;
    // Deload sessions neither count nor break the run.
    const run = lift.sessions.filter((s) => !s.deload && s.sets.length > 0).slice(-STALL_SESSIONS);
    if (run.length < STALL_SESSIONS) continue;
    const [first, second, third] = run;
    if (third.date < weekStart || third.date > weekEnd) continue;
    // Every set at the top of the range moves the lift up: progress, not a stall.
    if (third.sets.every((s) => s.reps >= lift.repMax)) continue;
    const top = topOf(first.sets);
    if (topOf(second.sets) !== top || topOf(third.sets) !== top) continue;
    if (repsOf(second.sets) > repsOf(first.sets) || repsOf(third.sets) > repsOf(first.sets)) continue;
    const best = bestSet(third.sets);
    out.push({ exercise: lift.exercise, top, lastSets: third.sets, chase: Array.from({ length: setsNext }, () => best.reps), drop: dropWeight(top, lift.increment) });
  }
  return out;
}
