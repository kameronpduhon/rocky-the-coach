// Everything the Plan screen shows, worked out from the phone's copy. Pure: the browser and the unit tests both run it.
import { exercises, meals, plan } from "~/content";
import { weekSchedule, type ScheduleDay } from "~/content/schedule";
import { resolveBaseTargets } from "~/content/targets";
import { isRelaxedDay, optionalTemplateFor, setsFor, templateFor, weekNumber, weekType, type Moves } from "~/domain/calendar";
import { checkInWindow } from "~/domain/checkin";
import { addDays, mealDate, weekStart, weekday } from "~/domain/dates";
import { SLOTS, type ISODate, type Slot, type WeekType } from "~/domain/types";
import { weekGroceries } from "~/groceries/model";
import { DAY_NAME, targetEntries, targetsOn, type Rows } from "~/today/slots";
import { choiceLabel, resolveLifts, workoutMinutes } from "~/workout/lifts";
import { buildWorkout, count } from "~/workout/model";
import { doneDates } from "~/workout/sessions";

const DOW = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const WEEKS = Math.max(...Object.keys(plan.weekTypes).map(Number));

export const monthDay = (d: ISODate) => `${MONTH[Number(d.slice(5, 7)) - 1]} ${Number(d.slice(8, 10))}`;

/** "Oct 26 to Nov 1", or "Nov 2 to 8" inside one month. */
export function weekRange(monday: ISODate): string {
  const sunday = addDays(monday, 6);
  return `${monthDay(monday)} to ${monday.slice(5, 7) === sunday.slice(5, 7) ? Number(sunday.slice(8, 10)) : monthDay(sunday)}`;
}

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

export interface PhaseCell {
  n: number;
  state: "done" | "current" | "ahead";
  type: WeekType;
}

export interface StatCell {
  label: string;
  value: string;
  sub: string;
}

export interface DaySheet {
  /** "Friday" */
  title: string;
  /** "Chest, shoulders, arms", or the optional extra on a rest day. */
  workout: string | null;
  lifts: { name: string; sets: string }[];
  /** "Move to another day" from a workout day, "Train this day" from a rest day. */
  action: "move" | "train";
}

export interface PlanDay {
  date: ISODate;
  /** "MON" */
  weekday: string;
  title: string;
  sub: string;
  today: boolean;
  /** The ink check: the day's workout is done. */
  done: boolean;
  /** Where a tap goes, or null. */
  to: string | null;
  /** Future days open the day sheet instead. */
  sheet: DaySheet | null;
}

export interface PlanModel {
  date: ISODate;
  poster: string[];
  meta: string;
  cells: PhaseCell[];
  legend: { type: WeekType; text: string }[];
  targets: StatCell[];
  days: PlanDay[];
  /** For the move sheet. */
  schedule: ScheduleDay[];
  groceries: { checked: number; count: number };
}

function targetCells(rows: Rows, today: ISODate): StatCell[] {
  const entries = targetEntries(rows);
  const t = targetsOn(rows, today);
  const latest = entries.filter((e) => e.effectiveFrom <= today).at(-1) ?? null;
  const steps = latest ? latest.stepGoal - resolveBaseTargets(entries, addDays(latest.effectiveFrom, -1)).stepGoal : 0;
  const n = (v: number) => v.toLocaleString("en-US");
  return [
    { label: "Calories", value: n(t.kcal), sub: weekType(plan, today) === "maintenance" ? "maintenance week" : latest ? "from the check-in" : "starting target" },
    { label: "Protein", value: `${t.proteinG} g`, sub: "every day" },
    { label: "Steps", value: n(t.stepGoal), sub: !latest ? "starting goal" : steps > 0 ? `up ${n(steps)}` : steps < 0 ? `down ${n(-steps)}` : "same as last week" },
  ];
}

/** The weekend-only mains planned that day, in slot order: "Steak salad, chicken fajita bowl". */
function weekendMains(rows: Rows, date: ISODate): string | null {
  const names = rows("planned_meals")
    .filter((r) => r.date === date)
    .sort((a, b) => SLOTS.indexOf(a.slot as Slot) - SLOTS.indexOf(b.slot as Slot))
    .map((r) => meals.get(r.meal_slug as string))
    .filter((m) => m?.mode === "weekend")
    .map((m, i) => (i === 0 ? m!.name : lowerFirst(m!.name)));
  return names.length ? names.join(", ") : null;
}

function liftList(rows: Rows, templateId: string, date: ISODate): DaySheet["lifts"] {
  const open = rows("workout_sessions").find((r) => r.date === date && !r.ended_at) ?? null;
  const sets = setsFor(plan, date);
  return resolveLifts(rows, open, templateId, date).map((l) => ({ name: exercises.get(l.exercise)!.name, sets: `${sets} × ${l.repMin} to ${l.repMax}` }));
}

function sundayLine(rows: Rows, now: Date, monday: ISODate): string {
  if (rows("check_ins").some((r) => r.week_start === monday)) return "Check-in done";
  return checkInWindow(now) === monday ? "Check-in is open" : "Check-in opens at 5pm";
}

function dayRow(rows: Rows, now: Date, today: ISODate, date: ISODate, moves: Moves, done: Set<ISODate>): PlanDay {
  const wd = weekday(date);
  const base = { date, weekday: DOW[wd], today: date === today, done: false, to: null, sheet: null };
  const past = date < today;
  const future = date > today;
  const logIt = `/workout?date=${date}&from=plan`;
  const templateId = templateFor(plan, date, moves);

  if (templateId) {
    const title = choiceLabel(templateId);
    if (past && !done.has(date)) return { ...base, title, sub: "Not logged · tap to log it", to: logIt };
    if (past) {
      const up = buildWorkout(rows, now, { date }).movedUp.length;
      return { ...base, title, sub: up ? `Done · ${count(up, "lift")} moved up` : "Done", done: true, to: logIt };
    }
    if (future) {
      const lifts = liftList(rows, templateId, date);
      return { ...base, title, sub: `Noon · ${count(lifts.length, "lift")} · tap to change`, sheet: { title: DAY_NAME[wd], workout: title, lifts, action: "move" } };
    }
    // Today: the workout screen's own reading, so a workout picked on Today shows here too.
    const w = buildWorkout(rows, now);
    const shown = w.templateId ? choiceLabel(w.templateId) : title;
    if (w.screen === "done") {
      const up = w.movedUp.length;
      return { ...base, title: shown, sub: up ? `Today · done · ${count(up, "lift")} moved up` : "Today · done", done: true, to: "/workout" };
    }
    const usual = resolveLifts(rows, null, w.templateId ?? templateId, date).map((l) => l.exercise).join();
    const edited = w.lifts.map((l) => l.exercise).join() !== usual;
    return { ...base, title: shown, sub: `Today · noon · ${count(w.lifts.length, "lift")}${edited ? ", edited" : ""}`, to: "/workout" };
  }

  if (wd === 0) return { ...base, title: "Rest · weekend meals", sub: sundayLine(rows, now, weekStart(date)), to: "/check-in" };
  if (isRelaxedDay(plan, date)) return { ...base, title: "Relaxed day", sub: "Counts no matter what" };
  if (wd === 6) return { ...base, title: "Rest · weekend meals", sub: weekendMains(rows, date) ?? "Restaurant meal fits, protein first" };

  const extraId = optionalTemplateFor(plan, date);
  if (!extraId) {
    return { ...base, title: "Rest", sub: date in moves ? "Workout moved" : "", sheet: future ? { title: DAY_NAME[wd], workout: null, lifts: [], action: "train" } : null };
  }
  const extra = choiceLabel(extraId);
  const minutes = workoutMinutes(plan.templates[extraId]!.exercises.length * setsFor(plan, date));
  if (past) return done.has(date) ? { ...base, title: "Rest", sub: `${extra} · Done`, done: true, to: logIt } : { ...base, title: "Rest", sub: `${extra}, skipped` };
  if (future) {
    return {
      ...base,
      title: "Rest",
      sub: `Optional: ${lowerFirst(extra)}, ${minutes} min`,
      sheet: { title: DAY_NAME[wd], workout: `Optional: ${lowerFirst(extra)}`, lifts: liftList(rows, extraId, date), action: "train" },
    };
  }
  return done.has(date)
    ? { ...base, title: "Rest", sub: `Today · ${lowerFirst(extra)} · done`, done: true, to: "/workout" }
    : { ...base, title: "Rest", sub: `Today · optional: ${lowerFirst(extra)}, ${minutes} min`, to: "/workout" };
}

export function buildPlan(rows: Rows, now: Date): PlanModel {
  const today = mealDate(now);
  const monday = weekStart(today);
  const week = Math.min(Math.max(weekNumber(plan, today), 1), WEEKS);
  const moves: Moves = Object.fromEntries(rows("schedule_moves").map((r) => [r.date as string, (r.template_id as string | null) ?? null]));
  const done = doneDates(rows, today);
  const mondayOf = (k: number) => addDays(plan.phaseStart, (k - 1) * 7);
  const cells = Array.from({ length: WEEKS }, (_, i): PhaseCell => {
    const k = i + 1;
    return { n: k, state: k < week ? "done" : k === week ? "current" : "ahead", type: weekType(plan, mondayOf(k)) };
  });
  const groceries = weekGroceries(rows, today);
  return {
    date: today,
    poster: [`Week ${week}`, `of ${WEEKS}.`],
    meta: `${weekRange(monday)} · Phase 1 ends ${monthDay(plan.goal.date)}`,
    cells,
    legend: cells
      .filter((c) => c.type !== "standard")
      .map((c) => ({ type: c.type, text: `Wk ${c.n} ${c.type}, ${monthDay(c.type === "checkpoint" ? plan.goal.date : mondayOf(c.n))}` })),
    targets: targetCells(rows, today),
    days: Array.from({ length: 7 }, (_, i) => dayRow(rows, now, today, addDays(monday, i), moves, done)),
    schedule: weekSchedule(monday, moves, done),
    groceries: { checked: groceries.checked, count: groceries.count },
  };
}
