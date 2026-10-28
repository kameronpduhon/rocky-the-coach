// Everything Progress shows, worked out from the phone's copy. Pure: the browser and the unit tests both run it.
import { exercises, plan } from "~/content";
import { isTrainingDay, type Moves } from "~/domain/calendar";
import { dayCompleteness, isTracked } from "~/domain/completeness";
import { addDays, daysBetween, mealDate } from "~/domain/dates";
import { countedDay } from "~/domain/habits";
import { MIN_TREND_WEIGH_INS, trendReading, trendSeries } from "~/domain/trend";
import type { ISODate } from "~/domain/types";
import { liftIds, liftSessions, monthDay } from "~/lifts/model";
import type { Row } from "~/sync/tables";
import { dayActivity } from "~/today/model";
import type { TrendPoint } from "~/ui/TrendChart";
import { doneDates, type Rows } from "~/workout/sessions";

export type Range = "4w" | "phase" | "all";

export interface StatCell {
  label?: string;
  value: string;
  sub: string;
}

export interface ProgressModel {
  date: ISODate;
  poster: string[];
  meta: string;
  chart: {
    points: TrendPoint[];
    goal: { date: ISODate; low: number; high: number } | null;
    projection: { date: ISODate; weight: number } | null;
    /** "Oct 5 · 207.0", "Today 205.3", and on PHASE "Jan 1 · 195 to 198". */
    labels: { start: string; today: string; end: string | null };
  };
  note: string;
  /** The last 10, newest first, for "Fix a weigh-in". */
  weighIns: { date: ISODate; weight: number }[];
  body: StatCell[];
  stronger: { id: string; name: string; from: number; to: number }[];
  liftsLink: string;
  showingUp: StatCell[];
  streakLine: string;
}

const lb = (n: number) => n.toFixed(1);
/** Inches as entered, without trailing zeros: 35.5, 0.25. */
const inches = (n: number) => String(Math.round(n * 100) / 100);
const goalRange = () => `${plan.goal.low} to ${plan.goal.high}`;

/** Progress photos every 4 weeks: the first round on the Sunday that ends week 4. */
export function nextPhotoDate(today: ISODate): ISODate {
  const first = addDays(plan.phaseStart, 27);
  if (today <= first) return first;
  return addDays(first, Math.ceil(daysBetween(first, today) / 28) * 28);
}

/**
 * Where the trend lands on the goal date at the pace of the last 4 weeks of trend, or of all of it when there is less.
 * Null under 2 weeks, which is too short to call a pace.
 */
export function projectTrend(series: Map<ISODate, number>, today: ISODate, goalDate: ISODate): number | null {
  const now = series.get(today);
  const first = series.keys().next().value as ISODate | undefined;
  if (now === undefined || first === undefined) return null;
  const from = first > addDays(today, -28) ? first : addDays(today, -28);
  const days = daysBetween(from, today);
  if (days < 14) return null;
  return now + ((now - series.get(from)!) / days) * Math.max(0, daysBetween(today, goalDate));
}

/** On pace lands in the goal range. Under it is ahead, over it is slower. Never "behind". */
export function paceLine(projection: number, goal: { low: number; high: number }): string {
  if (projection < goal.low) return "Ahead of pace.";
  if (projection > goal.high) return "Slower than pace.";
  return "On pace.";
}

function chart(weighIns: { date: ISODate; weight: number }[], today: ISODate, range: Range, projection: number | null, trendNow: number | null): ProgressModel["chart"] {
  const firstWeighIn = weighIns[0]?.date ?? today;
  const from = range === "4w" ? addDays(today, -27) : range === "phase" ? plan.phaseStart : firstWeighIn;
  const series = trendSeries(weighIns, today);
  const byDate = new Map(weighIns.map((w) => [w.date, w.weight]));
  const points: TrendPoint[] = [];
  for (let d = from; d <= today; d = addDays(d, 1)) {
    // As on Today and the check-in, the line starts with the third weigh-in. Unrounded, so the line does not stair-step.
    const enough = weighIns.filter((w) => w.date <= d).length >= MIN_TREND_WEIGH_INS;
    const t = series.get(d);
    points.push({ date: d, weight: byDate.get(d) ?? null, trend: enough && t !== undefined ? t : null });
  }
  const first = weighIns.find((w) => w.date >= from);
  const phase = range === "phase";
  return {
    points,
    goal: phase ? { ...plan.goal } : null,
    projection: phase && projection !== null ? { date: plan.goal.date, weight: projection } : null,
    labels: {
      start: first ? `${monthDay(first.date)} · ${lb(first.weight)}` : monthDay(from),
      today: trendNow === null ? "Today" : `Today ${lb(trendNow)}`,
      end: phase ? `${monthDay(plan.goal.date)} · ${goalRange()}` : null,
    },
  };
}

function waistCell(rows: Rows): StatCell {
  const logs = rows("waist_logs")
    .map((r) => ({ date: r.date as ISODate, inches: Number(r.inches) }))
    .sort((a, b) => a.date.localeCompare(b.date));
  if (logs.length === 0) return { label: "Waist", value: "Not yet", sub: "Measure at the check-in" };
  const first = logs[0];
  const last = logs.at(-1)!;
  const change = Math.round((last.inches - first.inches) * 100) / 100;
  const sub =
    logs.length === 1
      ? `measured ${monthDay(first.date)}`
      : change === 0
        ? `same as ${monthDay(first.date)}`
        : `${change < 0 ? "down" : "up"} ${inches(Math.abs(change))} since ${monthDay(first.date)}`;
  return { label: "Waist", value: `${inches(last.inches)} in`, sub };
}

function photoCell(today: ISODate): StatCell {
  const next = nextPhotoDate(today);
  return next === today
    ? { label: "Photos", value: "Today", sub: "front, side, back. They stay on your phone." }
    : { label: "Photos", value: monthDay(next), sub: "next set, front side back" };
}

/** The 4 lifts with the most pounds gained since the phase start, from their first session's top weight to their latest. */
function stronger(rows: Rows): ProgressModel["stronger"] {
  return [...liftSessions(rows)]
    .filter(([id, list]) => exercises.has(id) && list.length >= 2)
    .map(([id, list]) => ({ id, name: exercises.get(id)!.name, from: list[0].best.weight, to: list.at(-1)!.best.weight }))
    .filter((l) => l.to > l.from)
    .sort((a, b) => b.to - b.from - (a.to - a.from) || a.name.localeCompare(b.name))
    .slice(0, 4);
}

function showingUp(rows: Rows, today: ISODate): { cells: StatCell[]; streakLine: string } {
  const start = plan.phaseStart;
  const activity = dayActivity(rows, true);
  const counted = (d: ISODate) => countedDay(activity(d));
  let days = 0;
  let countedDays = 0;
  let lastDoubleMiss: ISODate | null = null;
  for (let d = start; d < today; d = addDays(d, 1)) {
    days++;
    if (counted(d)) countedDays++;
    else if (d > start && !counted(addDays(d, -1))) lastDoubleMiss = d;
  }
  // Today joins once it counts. Until it is over it can't break anything.
  if (counted(today)) {
    days++;
    countedDays++;
  }

  const moves: Moves = Object.fromEntries(rows("schedule_moves").map((r) => [r.date as string, (r.template_id as string | null) ?? null]));
  const done = doneDates(rows, today);
  let planned = 0;
  let workouts = 0;
  let extras = 0;
  for (let d = start; d <= today; d = addDays(d, 1)) {
    if (isTrainingDay(plan, d, moves)) {
      if (d < today || done.has(d)) planned++;
      if (done.has(d)) workouts++;
    } else if (done.has(d)) extras++;
  }

  const byDay = new Map<ISODate, Row[]>();
  for (const l of rows("meal_logs")) {
    const d = l.date as ISODate;
    if (d >= start && d <= today) byDay.set(d, [...(byDay.get(d) ?? []), l]);
  }
  const tracked = [...byDay.values()].filter((logs) => isTracked(dayCompleteness(logs.map((l) => ({ slot: (l.slot as string | null) ?? null, category: l.category as string })))));
  const protein = tracked.length ? Math.round(tracked.reduce((sum, logs) => sum + logs.reduce((s, l) => s + Number(l.protein_g ?? 0), 0), 0) / tracked.length) : null;

  const since = lastDoubleMiss === null ? 0 : daysBetween(lastDoubleMiss, today);
  return {
    cells: [
      { value: `${countedDays} of ${days}`, sub: "days counted" },
      { value: `${workouts + extras} of ${planned}`, sub: extras > 0 ? "workouts, plus extras" : "workouts" },
      { value: protein === null ? "Not yet" : `${protein} g`, sub: "protein a day" },
    ],
    streakLine:
      lastDoubleMiss === null
        ? "Never missed twice in a row. That's the streak that matters."
        : `${since} day${since === 1 ? "" : "s"} since the last double miss. Never miss twice.`,
  };
}

export function buildProgress(rows: Rows, now: Date, range: Range = "phase"): ProgressModel {
  const today = mealDate(now);
  const weighIns = rows("weigh_ins")
    .map((r) => ({ date: r.date as ISODate, weight: Number(r.weight_lb) }))
    .filter((w) => w.date <= today)
    .sort((a, b) => a.date.localeCompare(b.date));
  const reading = trendReading(weighIns, today, plan.phaseStart);
  const projection = reading ? projectTrend(trendSeries(weighIns, today), today, plan.goal.date) : null;
  const change = reading?.sinceFrom ?? 0;
  const { cells, streakLine } = showingUp(rows, today);
  return {
    date: today,
    poster: !reading
      ? ["Progress.", "No trend yet."]
      : [change < 0 ? `Down ${lb(-change)}.` : change > 0 ? `Up ${lb(change)}.` : "Level.", ...(projection === null ? [] : [paceLine(projection, plan.goal)])],
    meta: reading ? `Trend ${lb(reading.weight)} lb · ${monthDay(plan.goal.date)} goal ${goalRange()}` : "The trend needs 3 weigh-ins.",
    chart: chart(weighIns, today, range, projection, reading?.weight ?? null),
    note: `Dots are daily weigh-ins, the line is the trend.${projection === null ? "" : ` At this pace you land near ${Math.round(projection)} on ${monthDay(plan.goal.date)}.`} Waist matters more during a recomp.`,
    weighIns: weighIns.slice(-10).reverse(),
    body: [waistCell(rows), photoCell(today)],
    stronger: stronger(rows),
    liftsLink: `All ${liftIds(rows).length} lifts, best sets and history`,
    showingUp: cells,
    streakLine,
  };
}
