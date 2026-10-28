// How workouts read from the phone's copy: their keys, when one counts as finished, and an exercise's last sets.
// Pure, so Today, the workout screens and the unit tests all share one reading.
import type { Feel, LoggedSet } from "~/domain/progression";
import type { ISODate } from "~/domain/types";
import { keyOf, type Row } from "~/sync/tables";

export type Rows = (table: string) => Row[];

const s = (r: Row, c: string) => r[c] as string;
const n = (r: Row, c: string) => Number(r[c] ?? 0);

/** The key a workout's sets and checks point at: its client_id, or id:<id> for a v1 row. */
export const sessionKey = (session: Row): string => keyOf("workout_sessions", session);

/** Each workout's sets, by its key. A set logged offline has no session_id until the next pull, so the key is the link. */
export function setsBySession(rows: Rows): Map<string, Row[]> {
  const out = new Map<string, Row[]>();
  for (const r of rows("set_logs")) {
    const list = out.get(s(r, "session_key"));
    if (list) list.push(r);
    else out.set(s(r, "session_key"), [r]);
  }
  return out;
}

/**
 * When a workout finished. One started and never finished counts as finished from the next day, as of its last set
 * (or its start, with no sets). Nothing is written for this; every reader applies the rule.
 */
export function finishedAt(session: Row, sets: Row[], today: ISODate): string | null {
  if (session.ended_at) return s(session, "ended_at");
  if (!session.started_at || s(session, "date") >= today) return null;
  return sets.reduce((latest, r) => (s(r, "logged_at") > latest ? s(r, "logged_at") : latest), s(session, "started_at"));
}

/** Days with a set or a "done, no numbers" check. A planned or merely started workout doesn't count. */
export function loggedDates(rows: Rows): Set<ISODate> {
  const dateOf = new Map(rows("workout_sessions").map((r) => [sessionKey(r), s(r, "date")]));
  const out = new Set<ISODate>();
  for (const r of [...rows("set_logs"), ...rows("exercise_checks")]) {
    const d = dateOf.get(s(r, "session_key"));
    if (d) out.add(d);
  }
  return out;
}

/** Days with a workout done: logged, or finished by either rule. */
export function doneDates(rows: Rows, today: ISODate): Set<ISODate> {
  const sets = setsBySession(rows);
  const out = loggedDates(rows);
  for (const r of rows("workout_sessions")) if (finishedAt(r, sets.get(sessionKey(r)) ?? [], today)) out.add(s(r, "date"));
  return out;
}

export interface LastSession {
  date: ISODate;
  sets: LoggedSet[];
  /** How that workout felt, if it was rated. */
  feel: Feel | null;
}

/** The newest workout before `before` that logged this exercise: its sets in order, and how it felt. */
export function lastSession(rows: Rows, exerciseId: string, before: ISODate): LastSession | null {
  const sessions = new Map(rows("workout_sessions").map((r) => [sessionKey(r), r]));
  const dated = rows("set_logs")
    .filter((r) => r.exercise_id === exerciseId)
    .map((r) => ({ r, date: (sessions.get(s(r, "session_key"))?.date as ISODate | undefined) ?? null }))
    .filter((x): x is { r: Row; date: ISODate } => x.date !== null && x.date < before);
  if (dated.length === 0) return null;
  // Newest day first; two workouts on one day go by which logged later.
  const newest = dated.reduce((a, b) => (b.date > a.date || (b.date === a.date && s(b.r, "logged_at") > s(a.r, "logged_at")) ? b : a));
  const key = s(newest.r, "session_key");
  const feel = sessions.get(key)?.feel;
  return {
    date: newest.date,
    feel: feel === "easy" || feel === "right" || feel === "hard" ? feel : null,
    sets: dated
      .filter((x) => s(x.r, "session_key") === key)
      .sort((a, b) => n(a.r, "set_number") - n(b.r, "set_number"))
      .map((x) => ({ weight: n(x.r, "weight_lb"), reps: n(x.r, "reps") })),
  };
}
