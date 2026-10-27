// Everything the four workout screens show, worked out from the phone's copy. Pure: the browser and the unit tests run it.
import { exercises, meals, plan } from "~/content";
import { weekSchedule, type ScheduleDay } from "~/content/schedule";
import { optionalTemplateFor, setsFor, templateFor, weekType, type Moves } from "~/domain/calendar";
import { addDays, daysBetween, formatClock, isISODate, localMinutes, mealDate, parseTime, weekStart, weekday } from "~/domain/dates";
import { nextSuggestion, restSeconds, type Feel, type LoggedSet, type Suggestion } from "~/domain/progression";
import { CUSTOM_WORKOUT, SLOTS, type ISODate } from "~/domain/types";
import { keyOf, type Row } from "~/sync/tables";
import { choiceLabel, resolveLifts, titleLines, workoutMinutes, workoutTitle, type Lift } from "./lifts";
import { doneDates, finishedAt, lastSession, sessionKey, setsBySession, type LastSession, type Rows } from "./sessions";

const s = (r: Row, c: string) => r[c] as string;
const n = (r: Row, c: string) => Number(r[c] ?? 0);
const asFeel = (v: unknown): Feel | null => (v === "easy" || v === "right" || v === "hard" ? v : null);
const known = (id: string | null | undefined): id is string => !!id && (id === CUSTOM_WORKOUT || id in plan.templates);

const DAY_NAME = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const COUNT = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"];

export interface SetView {
  key: string;
  setNumber: number;
  weight: number;
  reps: number;
  loggedAt: string;
}

export interface LiftView extends Lift {
  name: string;
  bodyWeight: boolean;
  increment: number;
  /** Seconds of rest after each set. */
  rest: number;
  sets: SetView[];
  /** "Done, no numbers". */
  checked: boolean;
  done: boolean;
  last: LastSession | null;
  suggestion: Suggestion;
  note: string | null;
}

export type WorkoutScreen = "plan" | "set" | "done";

export interface WorkoutModel {
  date: ISODate;
  /** Today, so the clock, rest and ping run. A past day is logged after the fact. */
  live: boolean;
  screen: WorkoutScreen;
  /** The workout's key, or null before its first change creates it. */
  key: string | null;
  templateId: string | null;
  headline: string[];
  startedAt: string | null;
  endedAt: string | null;
  /** The end, or for a workout never finished, its last set from the next day on. */
  finishedAt: string | null;
  feel: Feel | null;
  setsPerLift: number;
  lifts: LiftView[];
  /** The first unfinished lift in list order, or null when every lift is done. */
  current: LiftView | null;
  choices: { templateId: string; label: string }[];
  /** Plan: what the list holds. Done: lifts with sets or a check, and the minutes it took. */
  totals: { lifts: number; sets: number; minutes: number };
  movedUp: { name: string; from: number; to: number }[];
  rockyLine: string;
  canMove: boolean;
  schedule: ScheduleDay[];
}

export interface WorkoutAsk {
  date?: string | null;
  template?: string | null;
}

/** Today's scheduled workout first, then the other gym workouts, then Short, home, then Your own. */
function choices(scheduled: string | null, picked: string | null): WorkoutModel["choices"] {
  const gym = Object.entries(plan.templates).filter(([, t]) => t.kind === "gym").map(([id]) => id);
  const ids = [...new Set([scheduled, picked, ...gym, plan.planB, CUSTOM_WORKOUT].filter((id): id is string => id !== null))];
  return ids.map((templateId) => ({ templateId, label: choiceLabel(templateId) }));
}

function rockyLine(movedUp: number, rows: Rows, date: ISODate, now: Date, live: boolean): string {
  const lead = movedUp === 0 ? "Same weights next week. Beat the reps." : `${COUNT[movedUp] ?? movedUp} lift${movedUp === 1 ? "" : "s"} moved up.`;
  if (!live) return lead;
  const eaten = new Set(rows("meal_logs").filter((r) => r.date === date && r.category === "planned").map((r) => s(r, "slot")));
  const planned = new Map(rows("planned_meals").filter((r) => r.date === date).map((r) => [s(r, "slot"), s(r, "meal_slug")]));
  const minutes = localMinutes(now);
  const next = SLOTS.map((slot) => ({ slot, at: parseTime(plan.slotTimes[slot]), meal: meals.get(planned.get(slot) ?? "") })).find(
    (x) => x.meal && !eaten.has(x.slot) && x.at >= minutes - 30,
  );
  if (!next?.meal) return lead;
  return `${lead} ${next.meal.name} ${next.at - minutes <= 60 ? "within the hour" : `at ${formatClock(next.at)}`}.`;
}

export function buildWorkout(rows: Rows, now: Date, ask: WorkoutAsk = {}): WorkoutModel {
  const today = mealDate(now);
  const date = isISODate(ask.date) && ask.date < today ? ask.date : today;
  const live = date === today;
  const asked = known(ask.template) ? ask.template : null;
  const bySession = setsBySession(rows);
  const setsOf = (r: Row) => bySession.get(sessionKey(r)) ?? [];
  const sessions = rows("workout_sessions").filter((r) => r.date === date);
  // At most one open workout a day (spec section 1). A past day's unfinished one reads as finished instead.
  const open = live ? sessions.find((r) => !r.ended_at) : undefined;
  const finished = sessions
    .map((r) => ({ r, at: finishedAt(r, setsOf(r), today) }))
    .filter((x): x is { r: Row; at: string } => x.at !== null)
    .sort((a, b) => b.at.localeCompare(a.at))[0]?.r;
  const moves: Moves = Object.fromEntries(rows("schedule_moves").map((r) => [s(r, "date"), (r.template_id as string | null) ?? null]));
  const scheduled = templateFor(plan, date, moves);

  let row: Row | null = null;
  let screen: WorkoutScreen = "plan";
  if (open) {
    row = open;
    screen = open.started_at ? "set" : "plan";
  } else if (finished && (!asked || asked === finished.template_id)) {
    // Asking for another workout once one is finished starts a second one.
    row = finished;
    screen = "done";
  }
  const templateId = row ? s(row, "template_id") : (asked ?? scheduled ?? (live ? optionalTemplateFor(plan, date) : null));

  const setsPerLift = setsFor(plan, date);
  const deload = weekType(plan, date) === "deload";
  const key = row ? sessionKey(row) : null;
  const todaysSets = row ? setsOf(row) : [];
  const checks = new Set(key ? rows("exercise_checks").filter((r) => r.session_key === key).map((r) => s(r, "exercise_id")) : []);
  const notes = new Map(rows("exercise_notes").map((r) => [s(r, "exercise_id"), s(r, "note")]));

  const lifts: LiftView[] = (templateId ? resolveLifts(rows, row, templateId, date) : []).map((l) => {
    const ex = exercises.get(l.exercise)!;
    const sets = todaysSets
      .filter((r) => n(r, "position") === l.position)
      .sort((a, b) => n(a, "set_number") - n(b, "set_number"))
      .map((r) => ({ key: keyOf("set_logs", r), setNumber: n(r, "set_number"), weight: n(r, "weight_lb"), reps: n(r, "reps"), loggedAt: s(r, "logged_at") }));
    const checked = checks.has(l.exercise);
    const last = lastSession(rows, l.exercise, date);
    return {
      ...l,
      name: ex.name,
      bodyWeight: ex.equipment === "body-weight",
      increment: ex.increment,
      rest: restSeconds(ex.compound),
      sets,
      checked,
      done: checked || sets.length >= setsPerLift,
      last,
      suggestion: nextSuggestion(last?.sets ?? null, { repMax: l.repMax, increment: ex.increment, deload }, last?.feel ?? null),
      note: notes.get(l.exercise) ?? null,
    };
  });

  const startedAt = (row?.started_at as string | null | undefined) ?? null;
  const endedAt = (row?.ended_at as string | null | undefined) ?? null;
  const end = row ? finishedAt(row, todaysSets, today) : null;
  const feel = asFeel(row?.feel);
  // "Moves up next week" holds if next week is the deload.
  const nextDeload = weekType(plan, addDays(date, 7)) === "deload";
  const movedUp = lifts.flatMap((l) => {
    if (l.sets.length === 0) return [];
    const next = nextSuggestion(l.sets, { repMax: l.repMax, increment: l.increment, deload: nextDeload }, feel);
    return next.goUp && next.weight !== null ? [{ name: l.name, from: Math.max(...l.sets.map((x) => x.weight)), to: next.weight }] : [];
  });
  // A workout logged on a later day has no real length, so its minutes are 0 and Done leaves them out.
  const sameDay = startedAt !== null && mealDate(new Date(startedAt)) === date;
  const tookMinutes = sameDay && end ? Math.max(0, Math.round((Date.parse(end) - Date.parse(startedAt)) / 60_000)) : 0;
  const totals =
    screen === "done"
      ? { lifts: lifts.filter((l) => l.sets.length > 0 || l.checked).length, sets: lifts.reduce((a, l) => a + l.sets.length, 0), minutes: tookMinutes }
      : { lifts: lifts.length, sets: lifts.length * setsPerLift, minutes: workoutMinutes(lifts.length * setsPerLift) };
  const done = doneDates(rows, today);

  return {
    date,
    live,
    screen,
    key,
    templateId,
    headline: titleLines(templateId ? workoutTitle(templateId) : "Pick a workout"),
    startedAt,
    endedAt,
    finishedAt: end,
    feel,
    setsPerLift,
    lifts,
    current: lifts.find((l) => !l.done) ?? null,
    choices: choices(scheduled, templateId),
    totals,
    movedUp,
    rockyLine: rockyLine(movedUp.length, rows, date, now, live),
    canMove: live && screen === "plan" && !done.has(date),
    schedule: weekSchedule(weekStart(date), moves, done),
  };
}

/** The next unfinished lift after this one in list order, wrapping round, or null when nothing else is left. */
export function nextOpen(lifts: LiftView[], position: number): LiftView | null {
  const i = lifts.findIndex((l) => l.position === position);
  return [...lifts.slice(i + 1), ...lifts.slice(0, Math.max(0, i))].find((l) => !l.done) ?? null;
}

export interface SetTarget {
  setNumber: number;
  weight: number | null;
  reps: number;
}

/** The next set on a lift: today's weight so far, else the suggestion; last time's reps for that set, else the bottom of the range. */
export function nextTarget(lift: LiftView, setsPerLift: number): SetTarget | null {
  if (lift.done) return null;
  const setNumber = Array.from({ length: setsPerLift }, (_, i) => i + 1).find((k) => !lift.sets.some((x) => x.setNumber === k)) ?? setsPerLift;
  return {
    setNumber,
    weight: lift.sets.at(-1)?.weight ?? lift.suggestion.weight ?? (lift.bodyWeight ? 0 : null),
    reps: lift.last?.sets[setNumber - 1]?.reps ?? lift.repMin,
  };
}

export interface RestState {
  endsAt: number;
  total: number;
  /** The lift whose set was just logged. Rest shows its rows. */
  position: number;
  /** The set the rest leads to. */
  next: { position: number; setNumber: number; name: string };
}

/** The rest after a set: it leads to this lift's next set, else the next unfinished lift. Null after the workout's last set. */
export function restAfter(lifts: LiftView[], setsPerLift: number, position: number, setNumber: number, loggedAt: number): RestState | null {
  const lift = lifts.find((l) => l.position === position);
  if (!lift) return null;
  const same = setNumber < setsPerLift;
  const nextLift = same ? lift : nextOpen(lifts, position);
  if (!nextLift) return null;
  const nextSet = same ? setNumber + 1 : (nextTarget(nextLift, setsPerLift)?.setNumber ?? 1);
  return { endsAt: loggedAt + lift.rest * 1000, total: lift.rest, position, next: { position: nextLift.position, setNumber: nextSet, name: nextLift.name } };
}

/** After a reopen: the rest still running from the newest set, if any (spec section 3, "After a reopen"). */
export function restLeft(m: WorkoutModel, nowMs: number): RestState | null {
  if (!m.live || m.screen !== "set") return null;
  const latest = m.lifts.flatMap((l) => l.sets.map((x) => ({ l, x }))).sort((a, b) => b.x.loggedAt.localeCompare(a.x.loggedAt))[0];
  if (!latest) return null;
  const rest = restAfter(m.lifts, m.setsPerLift, latest.l.position, latest.x.setNumber, Date.parse(latest.x.loggedAt));
  return rest && rest.endsAt > nowMs ? rest : null;
}

/** "270 × 12, 12", or "270 × 12, 260 × 10" when the weight changed. */
export function setsText(sets: LoggedSet[]): string {
  return sets.map((x, i) => (i > 0 && sets[i - 1].weight === x.weight ? `${x.reps}` : `${x.weight} × ${x.reps}`)).join(", ");
}

function whenLast(date: ISODate, today: ISODate): string {
  if (daysBetween(date, today) <= 7) return `Last ${DAY_NAME[weekday(date)]}`;
  const [, m, d] = date.split("-").map(Number);
  return `On ${MONTH_SHORT[m - 1]} ${d}`;
}

/** Set's line on last time. It is the brass callout only when the weight goes up. */
export function lastLine(lift: LiftView, today: ISODate): { goUp: boolean; text: string } {
  const last = lift.last;
  if (!last) {
    return {
      goUp: false,
      text: lift.bodyWeight ? "First time on this one. Body weight counts as 0 lb; add any weight you hold or wear." : "First time on this one. Pick a weight you can do for the bottom of the range.",
    };
  }
  const head = `${whenLast(last.date, today)}: ${setsText(last.sets)}.`;
  const all = last.sets.length === 1 ? "Your set" : last.sets.length === 2 ? "Both sets" : "Every set";
  const weight = lift.suggestion.weight;
  if (lift.suggestion.goUp) return { goUp: true, text: `${head} ${all} hit the top${last.feel === "easy" ? " and it felt easy" : ""}, so ${weight} today.` };
  if (last.feel === "hard" && last.sets.every((x) => x.reps >= lift.repMax)) return { goUp: false, text: `${head} It felt hard, so ${weight} again today.` };
  return { goUp: false, text: `${head} Beat it today.` };
}

/** Rest's line on where the lift stands, for example "11 on set 1, so 280 holds next week. Match or beat it here." */
export function standingLine(lift: LiftView, setsPerLift: number): string {
  const short = lift.sets.find((x) => x.reps < lift.repMax);
  const top = Math.max(...lift.sets.map((x) => x.weight));
  const more = lift.sets.length < setsPerLift;
  if (short) return `${short.reps} on set ${short.setNumber}, so ${top} holds next week.${more ? " Match or beat it here." : ""}`;
  if (more) return `Set ${lift.sets.length} hit ${lift.repMax}. Hit it again and ${top + lift.increment} is next week's weight.`;
  return `Every set hit ${lift.repMax}, so ${top + lift.increment} is next week's weight.`;
}
