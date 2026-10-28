// Everything Today shows, worked out from the phone's copy of the data. Pure: the browser and the unit tests both run it.
import { exercises, foods, meals, messages, plan, type MealWithMacros } from "~/content";
import { factorFor, scaledMeal } from "~/content/scaled";
import { resolveTargets, type Targets } from "~/content/targets";
import { dayMode, isRelaxedDay, isTrainingDay, optionalTemplateFor, setsFor, templateFor, weekNumber, weekType, type Moves } from "~/domain/calendar";
import { checkInWindow } from "~/domain/checkin";
import { addDays, formatClock, localDate, localMinutes, mealDate, parseTime, weekStart, weekday } from "~/domain/dates";
import { countedDay, dessertAllowance, fullDay, habitStreak, overAllowanceDates, type DayActivity } from "~/domain/habits";
import { pickSituation, renderMessage } from "~/domain/messages";
import { nextUp, type NextUp } from "~/domain/next-up";
import { nextSuggestion } from "~/domain/progression";
import { SLOTS, slotPool, type ISODate, type Slot } from "~/domain/types";
import { sevenDayAverage } from "~/domain/weight";
import { keyOf, type Row } from "~/sync/tables";
import { resolveLifts, titleLines, workoutMinutes, workoutTitle } from "~/workout/lifts";
import { doneDates, lastSession, loggedDates, sessionKey, type Rows } from "~/workout/sessions";

export type { Rows };

const s = (r: Row, c: string) => r[c] as string;
const n = (r: Row, c: string) => Number(r[c] ?? 0);

const WEEKS = Math.max(...Object.keys(plan.weekTypes).map(Number));
const DOW = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const DAY_NAME = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const SLOT_LABEL: Record<Slot, string> = { breakfast: "Breakfast", lunch: "Lunch", snack: "Snack", dinner: "Dinner", dessert: "Dessert" };

export interface SlotModel {
  slot: Slot;
  /** "2:00", as the mock's list shows it. */
  time: string;
  minutes: number;
  meal: MealWithMacros;
  /** The store key of the log that ate it, or null. */
  logKey: string | null;
  /** The meal "Ate it" is for in the list. */
  next: boolean;
}

export interface OffPlanModel {
  key: string;
  name: string;
  kcal: number;
  proteinG: number;
}

export interface TrainingModel {
  templateId: string;
  headline: string[];
  meta: string;
  goUp: string | null;
  started: boolean;
  /** The open workout's key, or null when Start has to plan it first. */
  workoutKey: string | null;
  buttonLabel: string;
}

export interface WeekDayModel {
  date: ISODate;
  letter: string;
  name: string;
  counted: boolean;
  today: boolean;
  future: boolean;
}

interface Common {
  date: ISODate;
  dateLabel: string;
  weighIn: { weight: number; time: string } | null;
  steps: number;
  streak: number;
  voice: "corner" | "plain";
}

export interface NoPlanToday extends Common {
  hasPlan: false;
}

export interface PlanToday extends Common {
  hasPlan: true;
  next: NextUp;
  targets: Targets;
  totals: { kcal: number; proteinG: number };
  slots: SlotModel[];
  offPlan: OffPlanModel[];
  dessertLine: string;
  modeLabel: string;
  training: TrainingModel | null;
  optional: { templateId: string; name: string } | null;
  /** "Change today's workout" shows: nothing started, finished or logged yet. */
  canChange: boolean;
  message: string;
  week: WeekDayModel[];
  countedSoFar: number;
  daysSoFar: number;
  countedLine: string;
  trendLine: string | null;
}

export type TodayModel = NoPlanToday | PlanToday;

export function shortClock(minutes: number): string {
  const h24 = Math.floor(minutes / 60) % 24;
  return `${h24 % 12 === 0 ? 12 : h24 % 12}:${String(minutes % 60).padStart(2, "0")}`;
}

export function dateLabel(d: ISODate): string {
  const [, m, day] = d.split("-").map(Number);
  return `${DOW[weekday(d)]} · ${MONTH[m - 1]} ${day}`;
}

function monthDay(d: ISODate): string {
  const [, m, day] = d.split("-").map(Number);
  return `${MONTH_SHORT[m - 1]} ${day}`;
}

/** The same rule as plannedForDate's fallback: the first meal of the slot's pool that fits the day and isn't resting. */
function fallbackMeal(slot: Slot, date: ISODate, rested: Set<string>): MealWithMacros {
  const mode = dayMode(date);
  const pick = [...meals.values()].find((m) => m.pool === slotPool(slot) && (m.mode === "any" || mode === "weekend") && !rested.has(m.slug));
  if (!pick) throw new Error(`No meal for ${slot}`);
  return pick;
}

const setsWord = (count: number) => (count === 1 ? "your set" : count === 2 ? "both sets" : `all ${count} sets`);

function trainingModel(rows: Rows, date: ISODate, templateId: string, open: Row | undefined): TrainingModel {
  const list = resolveLifts(rows, open ?? null, templateId, date);
  const deload = weekType(plan, date) === "deload";
  const sets = setsFor(plan, date);
  let goUp: string | null = null;
  for (const l of list) {
    const ex = exercises.get(l.exercise)!;
    const last = lastSession(rows, l.exercise, date);
    const next = nextSuggestion(last?.sets ?? null, { repMax: l.repMax, increment: ex.increment, deload }, last?.feel ?? null);
    if (last && next.goUp && next.weight !== null) {
      const top = Math.max(...last.sets.map((x) => x.weight));
      goUp = `${ex.name}: ${setsWord(last.sets.length)} hit ${l.repMax} last time${last.feel === "easy" ? " and it felt easy" : ""}. Add ${next.weight - top} lb today.`;
      break;
    }
  }
  const started = Boolean(open?.started_at);
  const key = open ? sessionKey(open) : null;
  const logged = key ? rows("set_logs").filter((r) => r.session_key === key) : [];
  const checked = new Set(key ? rows("exercise_checks").filter((r) => r.session_key === key).map((r) => s(r, "exercise_id")) : []);
  const current = list.find((l) => !checked.has(l.exercise) && logged.filter((r) => n(r, "position") === l.position).length < sets) ?? list.at(-1);
  const name = current ? exercises.get(current.exercise)!.name : null;
  const verb = started ? "Resume" : "Start";
  return {
    templateId,
    headline: [...titleLines(workoutTitle(templateId)), `${list.length} lifts.`],
    meta: `Noon · ${list.length * sets} sets · about ${workoutMinutes(list.length * sets)} min · week ${weekNumber(plan, date)} of ${WEEKS}${deload ? " · deload" : ""}`,
    goUp,
    started,
    workoutKey: key,
    buttonLabel: name ? `${verb}: ${name}` : verb,
  };
}

/** The last two training days before today both had no workout, and nothing was logged since the first of them. */
function missedTwoInARow(today: ISODate, setDates: Set<ISODate>, moves: Moves): boolean {
  const missed: ISODate[] = [];
  for (let d = addDays(today, -1); missed.length < 2 && d >= addDays(today, -14) && d >= plan.phaseStart; d = addDays(d, -1)) {
    if (!isTrainingDay(plan, d, moves)) continue;
    if (setDates.has(d)) return false;
    missed.push(d);
  }
  if (missed.length < 2) return false;
  for (const d of setDates) if (d > missed[1]) return false;
  return true;
}

function countedLine(a: DayActivity, weighInTime: string | null, firstMeal: string | null, relaxed: boolean): string {
  if (a.weighIn && weighInTime) return `Your ${weighInTime} weigh-in made today count.`;
  if (a.mealLogged && firstMeal) return `Logging ${firstMeal.toLowerCase()} made today count.`;
  if (a.workout) return "Your workout made today count.";
  if (a.steps >= 3000) return "3,000 steps made today count.";
  if (relaxed) return "Holiday. Today counts.";
  return "One thing makes today count: a weigh-in, a meal, a set, or 3,000 steps.";
}

function trendLine(weights: { date: ISODate; weight: number }[], date: ISODate): string | null {
  const now = sevenDayAverage(weights, date);
  if (now === null) return null;
  const start = sevenDayAverage(weights, addDays(plan.phaseStart, 6));
  if (start === null || date <= addDays(plan.phaseStart, 6)) return `Trend ${now} lb.`;
  const diff = Math.round((now - start) * 10) / 10;
  const change = diff < 0 ? `down ${Math.abs(diff)}` : diff > 0 ? `up ${diff}` : "level";
  return `Trend ${now} lb, ${change} since ${monthDay(plan.phaseStart)}.`;
}

const firstMealName = (logs: Row[]): string | null => {
  const first = logs.find((l) => l.category !== "skipped");
  return first ? s(first, "name") : null;
};

export function buildToday(rows: Rows, now: Date, hasPlan: boolean): TodayModel {
  const date = mealDate(now);
  const minutes = localMinutes(now) + (localDate(now) === date ? 0 : 24 * 60);

  const weighInRows = rows("weigh_ins");
  const todayWeighIn = weighInRows.find((r) => r.date === date);
  const weighIn = todayWeighIn ? { weight: n(todayWeighIn, "weight_lb"), time: formatClock(localMinutes(new Date(s(todayWeighIn, "logged_at")))) } : null;
  const stepsByDate = new Map(rows("steps_daily").map((r) => [s(r, "date"), n(r, "steps")]));
  const steps = stepsByDate.get(date) ?? 0;
  const voice = rows("profile").find((r) => r.id === "me")?.voice === "plain" ? "plain" : "corner";

  const mealLogs = rows("meal_logs");
  const sessions = rows("workout_sessions");
  const workoutDates = loggedDates(rows);
  const weighDates = new Set(weighInRows.map((r) => s(r, "date")));
  // A skip answers the slot but isn't a meal, so it doesn't make a day count.
  const mealDates = new Set(mealLogs.filter((r) => r.category !== "skipped").map((r) => s(r, "date")));
  const activity = (d: ISODate): DayActivity => ({
    weighIn: weighDates.has(d),
    mealLogged: mealDates.has(d),
    workout: workoutDates.has(d),
    steps: stepsByDate.get(d) ?? 0,
    relaxed: hasPlan && isRelaxedDay(plan, d),
  });
  const counted = (d: ISODate) => countedDay(activity(d));
  const firstDay = [...weighDates, ...mealDates, ...workoutDates, ...stepsByDate.keys()].reduce((a, b) => (b < a ? b : a), date);
  const streak = habitStreak(counted, date, firstDay);
  const common: Common = { date, dateLabel: dateLabel(date), weighIn, steps, streak, voice };
  if (!hasPlan) return { ...common, hasPlan: false };

  const targets = resolveTargets(
    rows("targets")
      .map((r) => ({ effectiveFrom: s(r, "effective_from"), kcal: n(r, "kcal"), proteinG: n(r, "protein_g"), stepGoal: n(r, "step_goal") }))
      .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom)),
    date,
  );
  const factor = factorFor(targets.kcal);
  const relaxed = isRelaxedDay(plan, date);

  const rested = new Set(rows("meal_state").filter((r) => typeof r.rested_until === "string" && s(r, "rested_until") >= date).map((r) => s(r, "slug")));
  const plannedBySlot = new Map(rows("planned_meals").filter((r) => r.date === date).map((r) => [s(r, "slot"), s(r, "meal_slug")]));
  const todayLogs = mealLogs.filter((r) => r.date === date).sort((a, b) => s(a, "logged_at").localeCompare(s(b, "logged_at")));
  const base = SLOTS.map((slot) => {
    const at = parseTime(plan.slotTimes[slot]);
    const log = todayLogs.find((l) => l.slot === slot && l.category === "planned");
    return { slot, minutes: at, time: shortClock(at), meal: scaledMeal(meals.get(plannedBySlot.get(slot) ?? "") ?? fallbackMeal(slot, date, rested), factor), logKey: log ? keyOf("meal_logs", log) : null };
  });
  // "Next" in the list: the first uneaten meal whose window (until the next slot begins) is still open.
  const nextIndex = base.findIndex((x, i) => x.logKey === null && minutes < (base[i + 1]?.minutes ?? 27 * 60));
  const slots: SlotModel[] = base.map((x, i) => ({ ...x, next: i === nextIndex }));
  const totals = todayLogs.reduce<{ kcal: number; proteinG: number }>((t, l) => ({ kcal: t.kcal + n(l, "kcal"), proteinG: t.proteinG + n(l, "protein_g") }), { kcal: 0, proteinG: 0 });
  const offPlan = todayLogs.filter((l) => l.category !== "planned" && l.category !== "skipped").map((l) => ({ key: keyOf("meal_logs", l), name: s(l, "name"), kcal: n(l, "kcal"), proteinG: n(l, "protein_g") }));

  const monday = weekStart(date);
  const desserts = mealLogs.filter((r) => r.category === "dessert" && !r.relaxed).map((r) => ({ date: s(r, "date"), at: s(r, "logged_at") }));
  const usedThisWeek = desserts.filter((d) => d.date >= monday && d.date <= addDays(monday, 6)).length;
  const over = overAllowanceDates(desserts);

  const moves: Moves = Object.fromEntries(rows("schedule_moves").map((r) => [s(r, "date"), (r.template_id as string | null) ?? null]));
  const todaySessions = sessions.filter((r) => r.date === date);
  // At most one open workout a day: planned or started, and not finished.
  const open = todaySessions.find((r) => !r.ended_at);
  const finished = todaySessions.some((r) => r.ended_at);
  // A workout picked on Plan replaces the day's scheduled one, for today only.
  const templateId = (open?.template_id as string | undefined) ?? templateFor(plan, date, moves);
  const setDates = doneDates(rows, date);
  const training = templateId ? trainingModel(rows, date, templateId, open) : null;
  const optionalId = optionalTemplateFor(plan, date);

  const window = checkInWindow(now);
  const next = nextUp({
    hasPlan: true,
    minutes,
    checkInOpen: window !== null && !rows("check_ins").some((r) => r.week_start === window),
    slots: slots.map((x) => ({ slot: x.slot, minutes: x.minutes, eaten: x.logKey !== null })),
    workout: templateId ? { templateId, started: Boolean(open?.started_at), finished } : null,
    steps,
    stepGoal: targets.stepGoal,
  });

  const onPlan = fullDay({ proteinG: totals.proteinG, proteinTarget: targets.proteinG, steps, stepGoal: targets.stepGoal, relaxedDay: relaxed, overAllowance: over.has(date) });
  const missedTwice = missedTwoInARow(date, setDates, moves);
  const situation = pickSituation({
    minutes: localMinutes(now),
    relaxedDay: relaxed,
    trainingDay: templateId !== null,
    sessionStarted: todaySessions.some((r) => r.started_at),
    loggedSetToday: workoutDates.has(date),
    missedTwice,
    weighedIn: weighIn !== null,
    proteinG: totals.proteinG,
    proteinTarget: targets.proteinG,
    steps,
    stepGoal: targets.stepGoal,
    onPlan,
  });
  const nextMeal = slots.find((x) => x.next)?.meal.name ?? "breakfast tomorrow";
  const message = renderMessage(messages, situation, date, {
    protein: totals.proteinG,
    lunch: slots.find((x) => x.slot === "lunch")!.meal.name.toLowerCase(),
    workout: templateId ? workoutTitle(templateId) : "",
    left: situation === "steps-behind" ? (targets.stepGoal - steps).toLocaleString() : Math.max(0, targets.proteinG - totals.proteinG),
    streak,
    nextMeal: nextMeal.toLowerCase(),
  });

  const week: WeekDayModel[] = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(monday, i);
    return { date: d, letter: DOW[weekday(d)][0], name: DAY_NAME[weekday(d)], counted: d <= date && counted(d), today: d === date, future: d > date };
  });
  const todayCounted = counted(date);

  return {
    ...common,
    hasPlan: true,
    next,
    targets,
    totals,
    slots,
    offPlan,
    dessertLine: dessertAllowance(usedThisWeek),
    modeLabel: relaxed ? "Holiday" : dayMode(date) === "weekday" ? "Weekday meals" : "Weekend meals",
    training,
    optional: !templateId && optionalId ? { templateId: optionalId, name: plan.templates[optionalId]!.name } : null,
    canChange: !open?.started_at && !finished && !workoutDates.has(date),
    message,
    week,
    countedSoFar: week.filter((d) => d.counted).length,
    daysSoFar: week.filter((d) => d.date < date).length + (todayCounted ? 1 : 0),
    countedLine: countedLine(activity(date), weighIn?.time ?? null, firstMealName(todayLogs), relaxed),
    trendLine: trendLine(weighInRows.map((r) => ({ date: s(r, "date"), weight: n(r, "weight_lb") })), date),
  };
}

/** The meal poster's headline: the meal, then its protein. */
export function mealHeadline(meal: MealWithMacros): string[] {
  return [`${meal.name}.`, `${meal.protein} g.`];
}

/** What goes on the scale for a meal: each ingredient's name and grams. */
export function scaleList(meal: MealWithMacros): { name: string; grams: number }[] {
  return meal.ingredients.map((i) => ({ name: foods.get(i.food)?.name ?? i.food, grams: i.grams }));
}
