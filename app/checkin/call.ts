// The check-in's call, in words. Every number comes from the engine and every line is written by a rule (spec section
// 4, "Check-in call"). Pure: the check-in page reruns it in the browser as the pick changes, and project 4 reuses it.
import { COACH_NAME } from "~/brand";
import { foods, meals, plan } from "~/content";
import { flexName } from "~/content/was";
import { addDays } from "~/domain/dates";
import {
  KCAL_FLOOR,
  MIN_TRACKED_IN_WEEK,
  MIN_TRACKED_IN_WINDOW,
  MIN_WEIGH_INS,
  SETTLED_CAP,
  SETTLING_CAP,
  SETTLING_UPDATES,
  WINDOW_DAYS,
  type Call,
  type EnergyWeek,
  type Guardrail,
} from "~/domain/energy";
import { scaleIngredient } from "~/domain/rescale";
import { STEP_CAP } from "~/domain/steps";

export type CallPick = "calories" | "steps";

export interface CallFacts {
  call: Call;
  /** This week's entry from `energyHistory`. */
  energy: EnergyWeek;
  /** Last week's burn: the plan's 2,800 until a week has updated. */
  lastBurn: number;
  /** The base calorie target now, its step goal before the ramp, and its protein. */
  kcal: number;
  stepGoal: number;
  proteinG: number;
  weekNumber: number;
}

export interface CallOptionView {
  value: CallPick;
  title: string;
  sub: string;
}

export interface CallView {
  kcal: number;
  /** "cal a day from Monday", "cal a day" or "cal a day next week". */
  unit: string;
  /** "was 2,400", "holds" or "maintenance week". */
  was: string;
  protein: string;
  steps: string;
  why: string[];
  /** For a settling or holding burn only. */
  note: string | null;
  /** Rocky's pick first. Empty when there is nothing to choose. */
  options: CallOptionView[];
}

const num = (n: number) => n.toLocaleString("en-US");
/** A weight change, always with one decimal: "1.0". */
const lb = (n: number) => (Math.round(n * 10) / 10).toFixed(1);
const list = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);
const CANT = `so ${COACH_NAME} can't read your burn yet.`;

function readLines({ energy: e, lastBurn }: CallFacts): string[] {
  const fell = e.trendStart! - e.trendEnd!;
  const trend = Math.abs(fell) < 0.05 ? "the trend held level" : fell > 0 ? `the trend fell ${lb(fell)} lb` : `the trend rose ${lb(-fell)} lb`;
  const than = e.burn < lastBurn ? "lower than" : e.burn > lastBurn ? "higher than" : "level with";
  const before = e.updates === 1 ? `the ${num(lastBurn)} we started with` : `last week's ${num(lastBurn)}`;
  return [`You averaged ${num(e.intakeAvg!)} a day and ${trend}.`, `That puts your burn near ${num(e.burn)} a day, ${than} ${before}.`];
}

function holdingLines({ energy: e }: CallFacts): string[] {
  const firstWeeks = [`Two weeks of weigh-ins come first. Burn starts at ${num(plan.maintenanceKcal)}.`];
  // The first two weeks' windows reach back before the phase began, so they can't update.
  if (addDays(e.weekStart, 6 - (WINDOW_DAYS - 1)) < plan.phaseStart) return firstWeeks;
  let reason: string;
  if (e.trackedDays < MIN_TRACKED_IN_WEEK) {
    const n = e.trackedDays;
    reason = n === 0 ? `No days this week were tracked in full, ${CANT}` : `Only ${n} ${n === 1 ? "day this week was" : "days this week were"} tracked in full, ${CANT}`;
  } else if (e.windowTrackedDays < MIN_TRACKED_IN_WINDOW) {
    reason = `Only ${e.windowTrackedDays} of the last ${WINDOW_DAYS} days were tracked in full, ${CANT}`;
  } else if (e.weighIns < MIN_WEIGH_INS) {
    reason = `Only ${e.weighIns} ${e.weighIns === 1 ? "weigh-in" : "weigh-ins"} in the last 3 weeks, ${CANT}`;
  } else {
    // Every count passed, so there was no weigh-in yet by the day before the window: no trend to read it from.
    return firstWeeks;
  }
  return [reason, e.updates === 0 ? `Burn starts at ${num(plan.maintenanceKcal)}.` : `Burn stays at ${num(e.burn)} from last Sunday.`];
}

const GUARDRAIL: Record<Guardrail, (call: Call) => string> = {
  "fast-loss": () => `You lost more than 2 lb two weeks running, so ${COACH_NAME} won't cut.`,
  "no-surplus": () => `${COACH_NAME} never sets you above your burn.`,
  floor: () => `${num(KCAL_FLOOR)} is the floor.`,
  "half-portions": (call) =>
    call.steps
      ? "Rice and potato are at half portions, so the rest comes from steps."
      : `Rice and potato are at half portions and your steps are at ${num(STEP_CAP)}, so the number holds.`,
};

function moveLines({ call, energy, kcal }: CallFacts): string[] {
  const goal = String(Math.round(call.goalLbPerWeek * 10) / 10);
  if (call.kind === "on-pace") return ["You're on pace, so the number holds."];
  if (call.kind === "raise" && !call.guardrail) return [`You're losing faster than ${goal} lb a week, so ${COACH_NAME} adds ${num(call.calories.kcal - kcal)}.`];
  const aim = `About ${goal} lb a week would mean ${num(call.ideal!)}.`;
  if (call.guardrail) return [aim, GUARDRAIL[call.guardrail](call)];
  const settling = energy.state === "settling";
  // Name the weekly cap only when it held the move back.
  if (Math.abs(call.ideal! - kcal) <= (settling ? SETTLING_CAP : SETTLED_CAP)) return [aim];
  return [`${aim} ${settling ? `Early weeks are noisy, so ${COACH_NAME} moves ${SETTLING_CAP} at a time.` : `${COACH_NAME} moves up to ${SETTLED_CAP} a week.`}`];
}

function stateNote({ energy: e, weekNumber }: CallFacts): string | null {
  if (e.state === "holding") return "Burn estimate is holding. Close out each night and it updates next Sunday.";
  if (e.state === "settling") return `Burn estimate is still settling. Steady by week ${weekNumber + SETTLING_UPDATES - e.updates}.`;
  return null;
}

function options({ call, kcal, stepGoal }: CallFacts, flexFoods: string[]): CallOptionView[] {
  if (!call.steps) return [];
  const mark = (pick: CallPick) => (call.pick === pick ? `${COACH_NAME}'s pick. ` : "");
  const trim = kcal - call.calories.kcal;
  const portions = flexFoods.length ? `Smaller portions of ${list(flexFoods.slice(0, 3))}.` : "Smaller portions.";
  const calories: CallOptionView = {
    value: "calories",
    title: trim > 0 ? `Trim ${num(trim)} cal a day` : `Keep ${num(kcal)}`,
    sub: `${mark("calories")}${trim > 0 ? portions : "Portions stay as they are."}`,
  };
  const steps: CallOptionView = {
    value: "steps",
    title: `Keep ${num(call.steps.kcal)}, walk ${num(call.steps.stepGoal - stepGoal)} more`,
    sub: `${mark("steps")}Steps go to ${num(call.steps.stepGoal)} a day instead.`,
  };
  return call.pick === "steps" ? [steps, calories] : [calories, steps];
}

/** The call block for a pick. `flexFoods` names what the calories pick shrinks, as `changedFoods` lists them. */
export function callView(f: CallFacts, choice: CallPick, flexFoods: string[]): CallView {
  const { call } = f;
  const chosen = choice === "steps" && call.steps ? call.steps : call.calories;
  const common = { protein: `Protein stays ${f.proteinG} g`, steps: `Steps ${num(chosen.stepGoal)}`, note: stateNote(f) };
  if (call.kind === "maintenance") {
    const kcal = call.maintenanceKcal!;
    return { ...common, kcal, unit: "cal a day next week", was: "maintenance week", why: [`${num(kcal)} cal a day next week. Maintenance week: you eat at your burn.`], options: [] };
  }
  const why = f.energy.state === "holding" ? holdingLines(f) : [...readLines(f), ...moveLines(f)];
  const moves = chosen.kcal !== f.kcal;
  return { ...common, kcal: chosen.kcal, unit: moves ? "cal a day from Monday" : "cal a day", was: moves ? `was ${num(f.kcal)}` : "holds", why, options: options(f, flexFoods) };
}

export interface ScaleChange {
  food: string;
  /** "Rice", "Potato", "Honey". */
  name: string;
  /** The meals that use it, at most three named. */
  meals: string;
  from: number;
  to: number;
}

export interface ScaleList {
  /** One row per portion food that moves. */
  rows: ScaleChange[];
  /** The other flex foods that move, in one line: "Butter, cheddar and olive oil trim a little too." */
  alsoTrim: string | null;
}

/** The carbs a cut takes portions from. The other flex foods are fats and only trim a little. */
const PORTION_FOODS = new Set(["white-rice-cooked", "potato-russet-raw", "sweet-potato-raw", "honey"]);

const capital = (s: string) => s[0].toUpperCase() + s.slice(1);

/** Flex foods whose grams move between two factors, each at its most common recipe weight in the meals in `slugs`. */
export function scaleChanges(slugs: string[], fromFactor: number, toFactor: number): ScaleList {
  const uses = new Map<string, { meals: string[]; weights: number[] }>();
  for (const slug of new Set(slugs)) {
    const meal = meals.get(slug);
    if (!meal) continue;
    for (const i of meal.ingredients) {
      if (foods.get(i.food)?.role !== "flex") continue;
      const use = uses.get(i.food) ?? { meals: [], weights: [] };
      if (!use.meals.includes(meal.name)) {
        use.meals.push(meal.name);
        use.weights.push(i.grams);
      }
      uses.set(i.food, use);
    }
  }
  const moved = [...uses]
    .map(([food, { meals: used, weights }]) => {
      const count = (g: number) => weights.filter((w) => w === g).length;
      const grams = weights.reduce((best, g) => (count(g) > count(best) || (count(g) === count(best) && g > best) ? g : best));
      return { food, name: flexName(food), meals: used, from: scaleIngredient(grams, "flex", fromFactor), to: scaleIngredient(grams, "flex", toFactor) };
    })
    .filter((r) => r.from !== r.to)
    .sort((a, b) => b.meals.length - a.meals.length || a.name.localeCompare(b.name));
  const rows = moved
    .filter((r) => PORTION_FOODS.has(r.food))
    .map((r) => {
      const named = r.meals.length > 3 ? `${r.meals.slice(0, 3).join(", ")} and ${r.meals.length - 3} more` : r.meals.join(", ");
      return { food: r.food, name: capital(r.name), meals: named, from: r.from, to: r.to };
    });
  const fats = moved.filter((r) => !PORTION_FOODS.has(r.food)).map((r) => r.name);
  const alsoTrim = fats.length ? `${capital(list(fats))} ${fats.length === 1 ? "trims" : "trim"} a little too.` : null;
  return { rows, alsoTrim };
}

/** The portion foods in a scale list, in its order: "rice", "honey", "potato". */
export function changedFoods(changes: ScaleList): string[] {
  return changes.rows.map((c) => flexName(c.food));
}
