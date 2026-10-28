// Everything the Sunday check-in shows, from the phone's copy (spec section 3, "Check-in"). Pure: the page and the unit
// tests run it. The page holds the choices until Finish; finishCheckIn works every number out again.
import { plan } from "~/content";
import { factorFor } from "~/content/scaled";
import { checkInWindow } from "~/domain/checkin";
import { addDays, mealDate, weekStart, weekday } from "~/domain/dates";
import type { Call } from "~/domain/energy";
import { MIN_TREND_WEIGH_INS, trendSeries } from "~/domain/trend";
import type { ISODate } from "~/domain/types";
import type { Row } from "~/sync/tables";
import type { Rows } from "~/today/slots";
import type { TrendPoint } from "~/ui/TrendChart";
import { setsText } from "~/workout/model";
import { callView, changedFoods, scaleChanges, type CallPick, type CallView, type ScaleList } from "./call";
import { buildDigest, type CheckInChoices, type CheckInDigest, type Level, type SleepLevel } from "./digest";
import { weekCall, weighIns } from "./engine";
import { groceryCount, previewNextWeek } from "./meals";
import { ruleTake, type Take } from "./take";

export type LiftPlan = "hold" | "drop";
export type Phase = "early" | "open" | "finished";

export interface PageChoices extends CheckInChoices {
  /** The Monday these choices are for. Choices for another week are dropped. */
  week: ISODate;
  pick: CallPick | null;
  lifts: Record<string, LiftPlan>;
}

export interface StatView {
  value: string;
  sub: string;
}

export interface StuckCard {
  exercise: string;
  title: string;
  line: string;
  hold: string;
  drop: string;
  plan: LiftPlan;
}

export interface NextWeekView {
  deload: boolean;
  movedUp: { name: string; change: string }[];
  movedUpNote: string;
  stuck: StuckCard[];
  repeats: { slug: string; name: string; rest: boolean; sub: string }[];
  backFromRest: string[];
  groceries: { title: string; sub: string; href: string };
}

/** finishCheckIn's args, less `at`, which the page stamps when Finish is tapped. */
export interface FinishArgs {
  week: ISODate;
  pick: CallPick;
  hunger: Level | null;
  energy: Level | null;
  sleep: SleepLevel | null;
  rest: string[];
  lifts: { exercise: string; plan: LiftPlan }[];
}

export interface CheckInModel {
  monday: ISODate;
  sunday: ISODate;
  phase: Phase;
  /** Finished, and not reopened: the choices show but can't change. */
  readOnly: boolean;
  header: string;
  poster: [string, string];
  meta: string;
  chart: { points: TrendPoint[]; marker: ISODate; left: string | null; right: string | null; label: string };
  stats: { days: StatView; lifts: StatView; steps: StatView };
  waist: { value: number | null; note: string | null; editable: boolean };
  /** The choices in effect: what the page holds, else the saved ones, else the defaults. */
  choices: PageChoices;
  take: Take | null;
  call: { view: CallView; changes: ScaleList; choice: CallPick } | null;
  next: NextWeekView | null;
  dock: { note: string; action: "finish" | "today" | null; change: boolean };
  /** What Finish sends, while it can be tapped. */
  finish: FinishArgs | null;
}

const DAY_NAME = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const num = (n: number) => n.toLocaleString("en-US");
/** Inches, at most two decimals: "35.75", "35.5". */
const inches = (n: number) => String(Math.round(n * 100) / 100);

function monthDay(d: ISODate): string {
  const [, m, day] = d.split("-").map(Number);
  return `${MONTH_SHORT[m - 1]} ${day}`;
}

/** "Oct 19 to 25", or "Oct 26 to Nov 1" across a month. */
function range(from: ISODate, to: ISODate): string {
  return from.slice(0, 7) === to.slice(0, 7) ? `${monthDay(from)} to ${Number(to.slice(8))}` : `${monthDay(from)} to ${monthDay(to)}`;
}

function trendLine(trend: number | null, change: number | null): string {
  if (trend === null) return "No trend yet.";
  if (change === null) return `Trend ${trend.toFixed(1)}.`;
  if (Math.abs(change) < 0.05) return "Steady.";
  return `${change < 0 ? "Down" : "Up"} ${Math.abs(change).toFixed(1)}.`;
}

function checkpointLine(weeks: number): string | null {
  const day = monthDay(plan.goal.date);
  if (weeks > 1) return `${weeks} weeks to the ${day} checkpoint`;
  if (weeks === 1) return `1 week to the ${day} checkpoint`;
  if (weeks === 0) return "Checkpoint week";
  return null;
}

/** "3 planned, plus Tuesday's extra", "All 3 planned", "2 of 3 planned, Friday missed", "1 of 3 planned, 2 missed". */
function liftsSub(l: CheckInDigest["lifts"]): string {
  const extras = l.extras.length === 0 ? null : l.extras.length === 1 ? `${DAY_NAME[weekday(l.extras[0])]}'s extra` : `${l.extras.length} extras`;
  if (l.plannedDone === l.planned) return extras ? `${l.planned} planned, plus ${extras}` : `All ${l.planned} planned`;
  const missed = l.missed.length === 0 ? "" : l.missed.length === 1 ? `, ${DAY_NAME[weekday(l.missed[0])]} missed` : `, ${l.missed.length} missed`;
  return `${l.plannedDone} of ${l.planned} planned${missed}${extras ? `, plus ${extras}` : ""}`;
}

/** Weigh-ins and the trend for each day from the phase start, the line starting with the third weigh-in. */
function chartPoints(rows: Rows, end: ISODate): TrendPoint[] {
  const weights = weighIns(rows, end);
  const byDate = new Map(weights.map((w) => [w.date, w.weight]));
  const series = trendSeries(weights, end);
  let seen = weights.filter((w) => w.date < plan.phaseStart).length;
  const out: TrendPoint[] = [];
  for (let d = plan.phaseStart; d <= end; d = addDays(d, 1)) {
    if (byDate.has(d)) seen++;
    const t = series.get(d);
    out.push({ date: d, weight: byDate.get(d) ?? null, trend: seen >= MIN_TREND_WEIGH_INS && t !== undefined ? t : null });
  }
  return out;
}

const asLevel = (v: unknown): Level | null => (v === "low" || v === "fine" || v === "high" ? v : null);
const asSleep = (v: unknown): SleepLevel | null => (v === "poor" || v === "fine" || v === "great" ? v : null);

/** A finished week's choices and call, from its row. N3-era rows have a pick and no call; v1 rows have neither. */
function savedCheckIn(row: Row, week: ISODate): { choices: PageChoices; call: Call | null } {
  let o: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(String(row.outcome ?? "{}"));
    if (parsed && typeof parsed === "object") o = parsed as Record<string, unknown>;
  } catch {
    // A row from before the outcome was JSON: nothing saved to show.
  }
  const lifts: Record<string, LiftPlan> = {};
  if (Array.isArray(o.lifts)) {
    for (const l of o.lifts as { exercise?: unknown; plan?: unknown }[]) if (typeof l?.exercise === "string" && (l.plan === "hold" || l.plan === "drop")) lifts[l.exercise] = l.plan;
  }
  const call = o.call && typeof o.call === "object" && "kind" in o.call ? (o.call as Call) : null;
  return {
    call,
    choices: {
      week,
      hunger: asLevel(row.hunger),
      energy: asLevel(row.energy),
      sleep: asSleep(row.sleep),
      pick: o.pick === "calories" || o.pick === "steps" ? o.pick : null,
      rest: Array.isArray(o.rest) ? (o.rest as unknown[]).filter((s): s is string => typeof s === "string") : null,
      lifts,
    },
  };
}

/**
 * The check-in at `now`. In the window (Sunday 5pm to Monday noon) it is the week under review; otherwise the week so
 * far. `choices` are the page's, or null for the saved or default ones. `editing` is "Change my answers".
 */
export function buildCheckIn(rows: Rows, now: Date, choices: PageChoices | null, editing = false): CheckInModel {
  const today = mealDate(now);
  const window = checkInWindow(now);
  const monday = window ?? weekStart(today);
  const sunday = addDays(monday, 6);
  const next = addDays(monday, 7);
  const row = window ? (rows("check_ins").find((r) => r.week_start === monday) ?? null) : null;
  const kept = row ? savedCheckIn(row, monday) : null;
  const phase: Phase = window === null ? "early" : row ? "finished" : "open";
  // A finished check-in can be changed until the new week starts at Monday 3am, mealDate's rule.
  const canChange = phase === "finished" && today < next;
  const readOnly = phase === "finished" && !(canChange && editing);
  const own = !readOnly && choices?.week === monday ? choices : null;
  const base: PageChoices = own ?? kept?.choices ?? { week: monday, hunger: null, energy: null, sleep: null, pick: null, rest: null, lifts: {} };

  const early = phase === "early";
  const digest = buildDigest(rows, monday, base, early ? today : next);
  const l = digest.lifts;
  const rest = digest.meals.repeats.filter((r) => r.rest).map((r) => r.slug);
  const lifts: Record<string, LiftPlan> = Object.fromEntries(l.stuck.map((s) => [s.exercise, base.lifts[s.exercise] ?? "hold"]));
  const sessions = l.plannedDone + l.extras.length;
  const end = early && today < sunday ? today : sunday;
  const waists = rows("waist_logs")
    .map((r) => ({ date: r.date as ISODate, inches: Number(r.inches) }))
    .filter((w) => w.date <= end)
    .sort((a, b) => a.date.localeCompare(b.date));
  const latest = waists.at(-1) ?? null;
  const { trend, change, firstDate, firstWeight } = digest.weight;

  const shared = {
    monday,
    sunday,
    phase,
    readOnly,
    header: `SUNDAY CHECK-IN · ${monthDay(sunday).toUpperCase()}`,
    poster: [`Week ${digest.week.number}.`, trendLine(trend, change)] as [string, string],
    meta: [range(monday, sunday), checkpointLine(digest.week.weeksToCheckpoint)].filter(Boolean).join(" · "),
    chart: {
      points: chartPoints(rows, end),
      marker: monday,
      left: firstDate !== null && firstWeight !== null ? `${monthDay(firstDate)} · ${firstWeight.toFixed(1)}` : null,
      right: trend !== null ? `Trend ${trend.toFixed(1)}` : null,
      label: `Weight since ${monthDay(plan.phaseStart)}: daily weigh-ins as dots and the trend as a line${trend !== null ? `, now ${trend.toFixed(1)} pounds` : ""}.`,
    },
    stats: {
      days: { value: `${digest.days.counted} of ${digest.days.total}`, sub: `${digest.days.full} fully on plan` },
      lifts: { value: `${sessions} ${sessions === 1 ? "session" : "sessions"}`, sub: liftsSub(l) },
      steps: { value: num(digest.steps.avg), sub: `goal ${num(digest.steps.goal)}` },
    },
    waist: early
      ? { value: latest?.inches ?? null, note: latest ? `last measured ${monthDay(latest.date)}` : null, editable: false }
      : { value: digest.waist.now, note: digest.waist.was !== null ? `was ${inches(digest.waist.was)}` : null, editable: !readOnly },
  };

  if (early) {
    return { ...shared, choices: { ...base, rest, lifts }, take: null, call: null, next: null, dock: { note: "Opens Sunday at 5pm.", action: null, change: false }, finish: null };
  }

  const wc = weekCall(rows, monday, { hungry: digest.feel.hungryTwice });
  // A finished page shows what Finish saved; an open one, the call as the rows have it now.
  const call: Call = (readOnly ? kept?.call : null) ?? wc.call;
  const pick: CallPick = (base.pick ?? call.pick) === "steps" && call.steps ? "steps" : "calories";
  const plannedNext = rows("planned_meals").filter((r) => (r.date as string) >= next && (r.date as string) <= addDays(next, 6));
  const slugs = readOnly && plannedNext.length > 0 ? plannedNext.map((r) => r.meal_slug as string) : previewNextWeek(rows, monday, rest).map((p) => p.slug);
  // The grams start from this week's target as eaten and end at what the pick brings on Monday, as N3's page did.
  const nowFactor = factorFor(wc.thisWeekKcal);
  const view = callView({ ...wc, call }, pick, changedFoods(scaleChanges(slugs, nowFactor, factorFor(call.calories.kcal))));
  const changes = scaleChanges(slugs, nowFactor, factorFor(view.kcal));
  const take = ruleTake(readOnly && kept?.call ? { ...digest, call: { ...digest.call, ...kept.call } } : digest);

  const query = new URLSearchParams({ week: next, from: "check-in", kcal: String(view.kcal) });
  if (rest.length === 0) query.append("rest", "");
  for (const slug of rest) query.append("rest", slug);

  return {
    ...shared,
    choices: { ...base, pick, rest, lifts },
    take,
    call: { view, changes, choice: pick },
    next: {
      deload: l.nextWeekDeload,
      movedUp: l.movedUp.map((m) => ({ name: m.name, change: `${m.from} → ${m.to} lb` })),
      movedUpNote: `${l.movedUp.length} ${l.movedUp.length === 1 ? "lift" : "lifts"} this week`,
      stuck: l.stuck.map((s) => ({
        exercise: s.exercise,
        title: `${s.name} is stuck`,
        line: `${setsText(s.lastSets)} three sessions running.`,
        hold: `Hold ${s.top}, chase ${s.chase.join(", ")}`,
        drop: `Drop to ${s.drop}, build back`,
        plan: lifts[s.exercise],
      })),
      repeats: digest.meals.repeats.map((r) => ({ slug: r.slug, name: r.name, rest: r.rest, sub: `${r.count} times · ${r.rest ? "rests 2 weeks" : "staying in"}` })),
      backFromRest: digest.meals.backFromRest,
      groceries: { title: "Grocery list is ready", sub: `${groceryCount(slugs)} items for ${range(next, addDays(next, 6))}`, href: `/groceries?${query}` },
    },
    dock: readOnly ? { note: "Done. New numbers start Monday morning.", action: "today", change: canChange } : { note: "New numbers start Monday morning.", action: "finish", change: false },
    finish: readOnly ? null : { week: monday, pick, hunger: base.hunger, energy: base.energy, sleep: base.sleep, rest, lifts: l.stuck.map((s) => ({ exercise: s.exercise, plan: lifts[s.exercise] })) },
  };
}
