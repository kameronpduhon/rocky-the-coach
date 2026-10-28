// The week's lifts as the check-in reads them: workouts planned and done, extras, misses, what moved up and what is
// stuck (spec section 1, "Stuck lifts", and the digest's `lifts`). Pure.
import { exercises, plan } from "~/content";
import { isTrainingDay, setsFor, weekType, type Moves } from "~/domain/calendar";
import { addDays } from "~/domain/dates";
import { nextSuggestion, type Feel, type LoggedSet } from "~/domain/progression";
import { stuckLifts, type LiftHistory } from "~/domain/stalls";
import type { ISODate } from "~/domain/types";
import type { Row } from "~/sync/tables";
import { resolveLifts } from "~/workout/lifts";
import { doneDates, sessionKey, setsBySession, type Rows } from "~/workout/sessions";

export interface MovedUp {
  exercise: string;
  name: string;
  from: number;
  to: number;
}

export interface Stuck {
  exercise: string;
  name: string;
  top: number;
  lastSets: LoggedSet[];
  chase: number[];
  drop: number;
}

export interface LiftWeek {
  planned: number;
  plannedDone: number;
  /** Rest days with a workout done. */
  extras: ISODate[];
  /** Planned days before `today` with nothing done. */
  missed: ISODate[];
  movedUp: MovedUp[];
  stuck: Stuck[];
  nextWeekDeload: boolean;
}

/** One lift in one workout, with its logged sets. */
export interface Performed {
  exercise: string;
  date: ISODate;
  position: number;
  repMax: number;
  sets: LoggedSet[];
  feel: Feel | null;
  /** The last set's time, to order two workouts on one day. */
  at: string;
}

// An added lift with no list to read takes the added range's top.
const DEFAULT_REP_MAX = 12;
const asFeel = (v: unknown): Feel | null => (v === "easy" || v === "right" || v === "hard" ? v : null);

/** Every lift done with logged sets up to a date, oldest first. */
export function performedLifts(rows: Rows, through: ISODate): Performed[] {
  const bySession = setsBySession(rows);
  const out: Performed[] = [];
  for (const session of rows("workout_sessions")) {
    const date = session.date as ISODate;
    if (date > through) continue;
    const sets = bySession.get(sessionKey(session)) ?? [];
    if (sets.length === 0) continue;
    const list = resolveLifts(rows, session, session.template_id as string, date);
    const byPosition = new Map<number, Row[]>();
    for (const r of sets) byPosition.set(Number(r.position), [...(byPosition.get(Number(r.position)) ?? []), r]);
    for (const [position, logged] of byPosition) {
      const exercise = logged[0].exercise_id as string;
      if (!exercises.has(exercise)) continue;
      const lift = list.find((l) => l.position === position) ?? list.find((l) => l.exercise === exercise);
      const ordered = [...logged].sort((a, b) => Number(a.set_number) - Number(b.set_number));
      out.push({
        exercise,
        date,
        position,
        repMax: lift?.repMax ?? DEFAULT_REP_MAX,
        sets: ordered.map((r) => ({ weight: Number(r.weight_lb), reps: Number(r.reps) })),
        feel: asFeel(session.feel),
        at: ordered.reduce((latest, r) => ((r.logged_at as string) > latest ? (r.logged_at as string) : latest), ""),
      });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.at.localeCompare(b.at) || a.position - b.position);
}

/** The week's lifts. `today` decides which planned days count as missed: none on or after it. */
export function liftWeek(rows: Rows, monday: ISODate, today: ISODate): LiftWeek {
  const sunday = addDays(monday, 6);
  const nextMonday = addDays(monday, 7);
  const moves: Moves = Object.fromEntries(rows("schedule_moves").map((r) => [r.date as string, (r.template_id as string | null) ?? null]));
  const done = doneDates(rows, today);
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const planned = days.filter((d) => isTrainingDay(plan, d, moves));
  const nextWeekDeload = weekType(plan, nextMonday) === "deload";
  const performed = performedLifts(rows, sunday);

  // The workout model's moved-up rule, on each lift's newest session this week.
  const latest = new Map<string, Performed>();
  for (const p of performed) if (p.date >= monday) latest.set(p.exercise, p);
  const movedUp = [...latest.values()]
    .sort((a, b) => a.date.localeCompare(b.date) || a.position - b.position)
    .flatMap((p) => {
      const ex = exercises.get(p.exercise)!;
      const next = nextSuggestion(p.sets, { repMax: p.repMax, increment: ex.increment, deload: nextWeekDeload }, p.feel);
      return next.goUp && next.weight !== null ? [{ exercise: p.exercise, name: ex.name, from: Math.max(...p.sets.map((s) => s.weight)), to: next.weight }] : [];
    });

  const histories = new Map<string, LiftHistory>();
  for (const p of performed) {
    const ex = exercises.get(p.exercise)!;
    const h = histories.get(p.exercise) ?? { exercise: p.exercise, increment: ex.increment, bodyWeight: ex.equipment === "body-weight", repMax: p.repMax, sessions: [] };
    h.repMax = p.repMax;
    h.sessions.push({ date: p.date, sets: p.sets, deload: weekType(plan, p.date) === "deload" });
    histories.set(p.exercise, h);
  }
  // A deload next week replaces the stuck cards: nothing moves, so there is nothing to plan.
  const stuck = nextWeekDeload
    ? []
    : stuckLifts([...histories.values()], monday, sunday, setsFor(plan, nextMonday)).map((s) => ({ ...s, name: exercises.get(s.exercise)!.name }));

  return {
    planned: planned.length,
    plannedDone: planned.filter((d) => done.has(d)).length,
    extras: days.filter((d) => !isTrainingDay(plan, d, moves) && done.has(d)),
    missed: planned.filter((d) => !done.has(d) && d < today),
    movedUp,
    stuck,
    nextWeekDeload,
  };
}
