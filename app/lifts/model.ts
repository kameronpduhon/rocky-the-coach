// Every lift's history, worked out from the phone's copy: All lifts, the lift page, and the Library's exercise rows.
// Pure: the browser and the unit tests both run it.
import { BODY_PART, BODY_PARTS, exerciseImage, exercises, plan, type BodyPart } from "~/content";
import type { Exercise } from "~/content/schema";
import { weekType } from "~/domain/calendar";
import { addDays } from "~/domain/dates";
import { nextSuggestion, withDrop, type Feel, type LoggedSet } from "~/domain/progression";
import { bestSet } from "~/domain/stalls";
import type { ISODate } from "~/domain/types";
import { setsText } from "~/workout/model";
import { dropFor, sessionKey, type Rows } from "~/workout/sessions";

export const EQUIPMENT: Record<Exercise["equipment"], string> = { barbell: "Barbell", "body-weight": "Body weight", cable: "Cable", dumbbell: "Dumbbells", machine: "Machine" };
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY_NAME = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
/** A lift outside the plan gets the range an added lift gets. */
const OFF_PLAN_REP_MAX = 12;

export const monthDay = (d: ISODate) => `${MONTH[Number(d.slice(5, 7)) - 1]} ${Number(d.slice(8, 10))}`;
export const partOf = (ex: Exercise): BodyPart => BODY_PART[ex.group];
/** "Chest" */
export const partLabel = (part: BodyPart) => BODY_PARTS.find((b) => b.id === part)!.label;

/** "Monday", "Wednesday and the extra", "Monday, Wednesday and Friday". */
export function joinAnd(parts: string[]): string {
  return parts.length <= 1 ? (parts[0] ?? "") : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}

/** Each plan workout's day: its weekday, or the extra. Plan B doesn't count. */
export const TEMPLATE_DAY: Record<string, { short: string; long: string }> = Object.fromEntries([
  ...Object.entries(plan.training).map(([wd, id]) => [id, { short: DAY_NAME[Number(wd)].slice(0, 3), long: DAY_NAME[Number(wd)] }]),
  ...Object.values(plan.optional).map((id) => [id, { short: "Extra", long: "the extra" }]),
]);

export interface PlanLift {
  /** The workouts that use it, in plan order. */
  templates: string[];
  /** The first workout's range. */
  repMin: number;
  repMax: number;
}

/** The lifts in the plan's gym and extra workouts after always-swaps, in plan order. */
export function planLifts(rows: Rows): Map<string, PlanLift> {
  const overrides = rows("exercise_overrides");
  const out = new Map<string, PlanLift>();
  for (const [id, t] of Object.entries(plan.templates)) {
    if (!TEMPLATE_DAY[id]) continue;
    t.exercises.forEach((e, position) => {
      const swapped = overrides.find((r) => r.template_id === id && Number(r.position) === position)?.exercise_id as string | undefined;
      const exercise = swapped && exercises.has(swapped) ? swapped : e.exercise;
      const have = out.get(exercise);
      if (!have) out.set(exercise, { templates: [id], repMin: e.repMin, repMax: e.repMax });
      else if (!have.templates.includes(id)) have.templates.push(id);
    });
  }
  return out;
}

export interface LiftSession {
  date: ISODate;
  sets: LoggedSet[];
  feel: Feel | null;
  /** The heaviest set, then the most reps at that weight. */
  best: LoggedSet;
}

const asFeel = (v: unknown): Feel | null => (v === "easy" || v === "right" || v === "hard" ? v : null);

/** Each exercise's workouts with logged sets since the phase start, oldest first. */
export function liftSessions(rows: Rows): Map<string, LiftSession[]> {
  const sessions = new Map(rows("workout_sessions").map((r) => [sessionKey(r), r]));
  const grouped = new Map<string, { exercise: string; date: ISODate; key: string; first: string; sets: { n: number; set: LoggedSet }[] }>();
  for (const r of rows("set_logs")) {
    const key = r.session_key as string;
    const date = sessions.get(key)?.date as ISODate | undefined;
    if (!date || date < plan.phaseStart) continue;
    const id = `${r.exercise_id}|${key}`;
    const g = grouped.get(id) ?? { exercise: r.exercise_id as string, date, key, first: r.logged_at as string, sets: [] };
    g.sets.push({ n: Number(r.set_number), set: { weight: Number(r.weight_lb), reps: Number(r.reps) } });
    if ((r.logged_at as string) < g.first) g.first = r.logged_at as string;
    grouped.set(id, g);
  }
  const out = new Map<string, LiftSession[]>();
  for (const g of [...grouped.values()].sort((a, b) => a.date.localeCompare(b.date) || a.first.localeCompare(b.first))) {
    const sets = g.sets.sort((a, b) => a.n - b.n).map((s) => s.set);
    out.set(g.exercise, [...(out.get(g.exercise) ?? []), { date: g.date, sets, feel: asFeel(sessions.get(g.key)?.feel), best: bestSet(sets) }]);
  }
  return out;
}

/** Body-weight lifts with no added weight are measured in reps. */
const inReps = (ex: Exercise, history: LiftSession[]) => ex.equipment === "body-weight" && history.every((s) => s.best.weight === 0);
const measure = (s: LiftSession, reps: boolean) => (reps ? s.best.reps : s.best.weight);
const bestText = (b: LoggedSet, reps: boolean) => (reps ? `${b.reps} reps` : `${b.weight} × ${b.reps}`);
const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "0");
const allTimeBest = (history: LiftSession[]) => bestSet(history.map((s) => s.best));

/** Every lift All lifts lists: the plan's, then anything else with sets since the phase start, by name. */
export function liftIds(rows: Rows, history = liftSessions(rows)): string[] {
  const inPlan = [...planLifts(rows).keys()];
  const others = [...history.keys()].filter((id) => exercises.has(id) && !inPlan.includes(id)).sort((a, b) => exercises.get(a)!.name.localeCompare(exercises.get(b)!.name));
  return [...inPlan, ...others];
}

/** The best set for each exercise with history: "55 × 9", or "8 reps". */
export function bestSets(rows: Rows): Map<string, string> {
  const out = new Map<string, string>();
  for (const [id, list] of liftSessions(rows)) {
    const ex = exercises.get(id);
    if (ex) out.set(id, bestText(allTimeBest(list), inReps(ex, list)));
  }
  return out;
}

export interface LiftRow {
  id: string;
  name: string;
  /** "Best 55 × 9 · Mon" */
  sub: string;
  /** Top weight (or reps) in the last 4 sessions. */
  spark: number[];
  /** "+10", "0" */
  gain: string;
}

export interface LiftsModel {
  /** "All 21 lifts." */
  title: string;
  meta: string;
  sections: { part: BodyPart; label: string; rows: LiftRow[] }[];
}

export function buildLifts(rows: Rows): LiftsModel {
  const history = liftSessions(rows);
  const inPlan = planLifts(rows);
  const ids = liftIds(rows, history);
  const row = (id: string): LiftRow => {
    const ex = exercises.get(id)!;
    const list = history.get(id) ?? [];
    const reps = inReps(ex, list);
    const planned = inPlan.get(id);
    const day = planned ? TEMPLATE_DAY[planned.templates[0]].short : "Swap";
    return {
      id,
      name: ex.name,
      sub: list.length ? `Best ${bestText(allTimeBest(list), reps)} · ${day}` : `No sets yet · ${day}`,
      spark: list.slice(-4).map((s) => measure(s, reps)),
      gain: list.length ? signed(measure(list.at(-1)!, reps) - measure(list[0], reps)) : "0",
    };
  };
  return {
    title: `All ${ids.length} lifts.`,
    meta: `Best set, and gain since ${monthDay(plan.phaseStart)}`,
    sections: BODY_PARTS.map((b) => ({ part: b.id, label: b.label, rows: ids.filter((id) => partOf(exercises.get(id)!) === b.id).map(row) })).filter((s) => s.rows.length > 0),
  };
}

export type LiftFrom = "library" | "progress";

export interface HistoryRow {
  date: ISODate;
  /** "OCT 26" */
  label: string;
  /** "130 × 12, 12", or "8, 7 reps" */
  sets: string;
  /** "next 135" on the newest session, when the next one goes up. */
  next: string | null;
  /** An older session that earned a move. */
  goUp: boolean;
  /** That day's workout, where its sets can be fixed. Null without a plan. */
  to: string | null;
}

export interface LiftPage {
  id: string;
  /** "LIBRARY · CHEST" or "ALL LIFTS · CHEST" */
  header: string;
  back: { to: string; label: string };
  title: string;
  meta: string;
  images: [string, string];
  /** Null with no history: "No sets logged yet." */
  best: { text: string; unit: string; goUp: boolean; change: string } | null;
  chart: { date: ISODate; value: number }[];
  history: HistoryRow[];
  /** "8 for chest" */
  swapsNote: string;
  swaps: { id: string; name: string; equipment: string; to: string }[];
}

export function buildLift(rows: Rows, today: ISODate, id: string, from: LiftFrom, hasPlan: boolean): LiftPage | null {
  const ex = exercises.get(id);
  if (!ex) return null;
  const part = partOf(ex);
  const inPlan = hasPlan ? planLifts(rows) : null;
  const mine = inPlan?.get(id) ?? null;
  const list = liftSessions(rows).get(id) ?? [];
  const reps = inReps(ex, list);
  const repMax = mine?.repMax ?? OFF_PLAN_REP_MAX;
  const unit = reps ? "reps" : "lb";
  const self = `/lift/${id}?from=${from}`;

  let best: LiftPage["best"] = null;
  let next: number | null = null;
  if (list.length > 0) {
    const first = list[0];
    const last = list.at(-1)!;
    const drop = dropFor(rows, id);
    // The next session is today at the earliest. A drop from Sunday's check-in waits for its Monday.
    const on = drop && drop.from > today ? drop.from : today;
    const suggestion = withDrop(nextSuggestion(last.sets, { repMax, increment: ex.increment, deload: weekType(plan, today) === "deload" }, last.feel), drop, last.date, on);
    if (hasPlan && !reps && suggestion.goUp && suggestion.weight !== null) next = suggestion.weight;
    const top = allTimeBest(list);
    const change = measure(last, reps) - measure(first, reps);
    best = {
      text: reps ? String(top.reps) : `${top.weight} × ${top.reps}`,
      unit,
      goUp: next !== null,
      change:
        list.length === 1
          ? `first logged ${monthDay(first.date)}`
          : change === 0
            ? `same as ${monthDay(first.date)}`
            : `${change > 0 ? "up" : "down"} ${Math.abs(change)} ${unit} since ${monthDay(first.date)}`,
    };
  }

  // The same body part, minus the plan's own lifts. Without a plan, every other one.
  const swaps = [...exercises.values()].filter((e) => e.id !== id && partOf(e) === part && !inPlan?.has(e.id)).sort((a, b) => a.name.localeCompare(b.name));
  return {
    id,
    header: `${from === "progress" ? "ALL LIFTS" : "LIBRARY"} · ${partLabel(part).toUpperCase()}`,
    back: from === "progress" ? { to: "/progress/lifts", label: "Back to all lifts" } : { to: "/library?tab=exercises", label: "Back to Library" },
    title: `${ex.name}.`,
    meta: !hasPlan
      ? `${EQUIPMENT[ex.equipment]} · ${partLabel(part)}`
      : mine
        ? `${EQUIPMENT[ex.equipment]} · ${joinAnd(mine.templates.map((t) => TEMPLATE_DAY[t].long))} · ${mine.repMin} to ${mine.repMax} reps`
        : `${EQUIPMENT[ex.equipment]} · Swap for ${part}`,
    images: [exerciseImage(ex, 0), exerciseImage(ex, 1)],
    best,
    chart: list.map((s) => ({ date: s.date, value: measure(s, reps) })),
    history: list
      .map((s, i): HistoryRow => {
        const newest = i === list.length - 1;
        // As the Done screen judges it: a deload the week after holds the weight.
        const earned = nextSuggestion(s.sets, { repMax, increment: ex.increment, deload: weekType(plan, addDays(s.date, 7)) === "deload" }, s.feel).goUp;
        return {
          date: s.date,
          label: monthDay(s.date).toUpperCase(),
          sets: reps ? `${s.sets.map((x) => x.reps).join(", ")} reps` : setsText(s.sets),
          next: newest && next !== null ? `next ${next}` : null,
          goUp: !newest && !reps && earned,
          to: hasPlan ? `/workout?date=${s.date}&back=${encodeURIComponent(self)}` : null,
        };
      })
      .reverse(),
    swapsNote: `${swaps.length} for ${part}`,
    swaps: swaps.map((e) => ({ id: e.id, name: e.name, equipment: EQUIPMENT[e.equipment], to: `/lift/${e.id}?from=${from}` })),
  };
}
