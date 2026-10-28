// Everything the meal screen shows, worked out from the phone's copy. Pure: the browser and the unit tests both run it.
import { foods, meals, type MealWithMacros } from "~/content";
import { factorFor, scaledMeal } from "~/content/scaled";
import { resolveTargets } from "~/content/targets";
import { recentTargetChange, wasReason, type TargetChange } from "~/content/was";
import { dayMode } from "~/domain/calendar";
import { addDays, formatClock, localDate, localMinutes, mealDate, weekday } from "~/domain/dates";
import { scaleGrams } from "~/domain/macros";
import { swapFits } from "~/domain/next-week";
import { scaleIngredient } from "~/domain/rescale";
import type { RotationMeal } from "~/domain/rotation";
import { slotPool, type ISODate, type Pool, type Slot } from "~/domain/types";
import type { Row } from "~/sync/tables";
import { DAY_NAME, daySlots, restedOn, SLOT_LABEL, targetEntries, type Rows } from "~/today/slots";

export type MealMode = "today" | "browse";
export type SlotState = "open" | "eaten" | "skipped";

const POOL_LABEL: Record<Pool, string> = { breakfast: "Breakfast", main: "Lunch or dinner", snack: "Snack", dessert: "Dessert" };
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export interface ScaleItem {
  food: string;
  name: string;
  /** "Raw" or "Cooked" on protein and flex foods, where the state changes what you weigh. */
  state: string | null;
  /** Grams for one portion. */
  grams: number;
  note: string | null;
  eachG: number | null;
  eachLabel: string | null;
  /** One portion's grams under the previous target, for the 7 days after it moved. Null when unchanged. */
  wasG: number | null;
}

export interface LeftoverModel {
  portion: number;
  portions: number;
  /** The weekday the batch was cooked. */
  cookedOn: string;
  portionG: number;
  cookedWeightG: number;
  closing: string;
}

export interface SwapOption {
  slug: string;
  name: string;
  kcal: number;
  protein: number;
  best: boolean;
  /** 10 g or more under the meal it replaces. */
  lowProtein: boolean;
}

export interface MealModel {
  mode: MealMode;
  date: ISODate;
  /** At the grams shown: the day's, or the batch's. */
  meal: MealWithMacros;
  slot: Slot | null;
  meta: string;
  /** Always "open" in browse mode. */
  state: SlotState;
  /** "2:04pm" */
  eatenAt: string | null;
  /** The eaten or skipped log, for Undo. */
  logKey: string | null;
  items: ScaleItem[];
  /** Why the grams moved, on the first changed row. Today's slot only. */
  wasNote: string | null;
  mainProtein: { food: string; name: string };
  /** "Cooking for" shows: today's slot, unmarked, with no batch open. */
  canCook: boolean;
  /** A batch of this meal cooked today. */
  todayBatch: { portions: number; portionG: number; laterDays: string[] } | null;
  /** Today's portion comes from a batch cooked on an earlier day. */
  leftover: LeftoverModel | null;
  swaps: SwapOption[];
  /** Browse mode's "Have it for…" dock. */
  haveIt: { slot: Slot; label: string; then: string } | null;
  /** "Nov 24", browse mode only. */
  restingUntil: string | null;
  photoKey: string | null;
  steps: string[];
}

export interface ScaleRow {
  food: string;
  name: string;
  sub: string | null;
  grams: number;
  /** "Was 200." on today's slot. Browse mode folds it into the subline instead. */
  was: string | null;
  /** The batch's protein on a leftover day. */
  highlight: boolean;
}

/** The ingredient carrying the most protein: the one a batch weighs after cooking. */
export function mainProtein(meal: MealWithMacros) {
  let best = meal.ingredients[0];
  let bestProtein = -1;
  for (const ing of meal.ingredients) {
    const p = (ing.grams / 100) * (foods.get(ing.food)?.proteinPer100 ?? 0);
    if (p > bestProtein) {
      best = ing;
      bestProtein = p;
    }
  }
  return best;
}

const monthDay = (d: ISODate) => `${MONTH[Number(d.slice(5, 7)) - 1]} ${Number(d.slice(8, 10))}`;
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const rotationMeals = (): RotationMeal[] => [...meals.values()].map((m) => ({ slug: m.slug, pool: m.pool, mode: m.mode, tags: m.tags }));

/** Same rule as the logMeal change: the newest batch of this meal with portions left, cooked up to 3 days ago. */
function openBatch(rows: Rows, slug: string, date: ISODate): Row | undefined {
  // A batch started on this phone has no id until the server numbers it, so it sorts as the newest.
  const order = (b: Row) => (b.id as number | null | undefined) ?? Number.MAX_SAFE_INTEGER;
  return rows("batches")
    .filter((b) => b.meal_slug === slug && Number(b.portions_left) > 0 && (b.created_on as string) >= addDays(date, -3) && (b.created_on as string) <= date)
    .sort((x, y) => (y.created_on as string).localeCompare(x.created_on as string) || order(y) - order(x))[0];
}

function scaleItems(meal: MealWithMacros, raw: MealWithMacros, change: TargetChange | null): ScaleItem[] {
  const before = change ? factorFor(change.fromKcal) : null;
  return meal.ingredients.map((i, n) => {
    const f = foods.get(i.food)!;
    const was = before === null ? null : scaleIngredient(raw.ingredients[n].grams, f.role, before);
    return {
      food: i.food,
      name: f.name,
      state: f.role !== "fixed" && f.state !== "as-is" ? capital(f.state) : null,
      grams: i.grams,
      note: i.note ?? null,
      eachG: f.eachG ?? null,
      eachLabel: f.eachLabel ?? null,
      wasG: was !== null && was !== i.grams ? was : null,
    };
  });
}

/** v1's fit order on scaled numbers: closest to what's left per open slot, with protein counting double. */
function swapOptions(rows: Rows, date: ISODate, slot: Slot, current: MealWithMacros, factor: number, perSlot: number): SwapOption[] {
  const rested = [...restedOn(rows, date)];
  const list = rotationMeals();
  const fit = (m: MealWithMacros) => Math.abs(m.kcal - perSlot) - 2 * m.protein;
  return [...meals.values()]
    .filter((m) => m.slug !== current.slug && swapFits({ date, slot, slug: m.slug }, list, rested))
    .map((m) => scaledMeal(m, factor))
    .sort((a, b) => fit(a) - fit(b))
    .map((m, i) => ({ slug: m.slug, name: m.name, kcal: m.kcal, protein: m.protein, best: i === 0, lowProtein: m.protein <= current.protein - 10 }));
}

export function buildMeal(rows: Rows, now: Date, p: { slug: string; slot: string | null }): MealModel | null {
  const raw = meals.get(p.slug);
  if (!raw) return null;
  const date = mealDate(now);
  const minutes = localMinutes(now) + (localDate(now) === date ? 0 : 24 * 60);
  const entries = targetEntries(rows);
  const targets = resolveTargets(entries, date);
  const factor = factorFor(targets.kcal);
  const slots = daySlots(rows, date, factor);
  const change = recentTargetChange(entries, date);
  // A meal on today's plan opens as its slot, wherever the link came from.
  const own = slots.find((s) => s.slot === p.slot) ?? slots.find((s) => s.meal.slug === raw.slug);
  const photoOf = (slug: string) => (rows("meal_state").find((r) => r.slug === slug)?.photo_key as string | null | undefined) ?? null;

  if (own) {
    const state: SlotState = own.logKey ? "eaten" : own.skipKey ? "skipped" : "open";
    const plannedRaw = meals.get(own.meal.slug)!;
    const batch = state === "open" ? openBatch(rows, plannedRaw.slug, date) : undefined;
    const meal = batch ? scaledMeal(plannedRaw, Number(batch.factor ?? 1)) : own.meal;
    const main = mainProtein(meal);
    const portions = Number(batch?.portions ?? 1);
    const left = Number(batch?.portions_left ?? 0) - 1;
    const leftover: LeftoverModel | null =
      batch && (batch.created_on as string) < date
        ? {
            portion: portions - left,
            portions,
            cookedOn: DAY_NAME[weekday(batch.created_on as string)],
            portionG: Number(batch.portion_g),
            cookedWeightG: Number(batch.cooked_weight_g),
            closing: left === 0 ? "Last portion." : left === 1 ? `One portion left for ${DAY_NAME[weekday(addDays(date, 1))]}.` : `${left} portions left.`,
          }
        : null;
    const todayBatch =
      batch && batch.created_on === date
        ? {
            portions,
            portionG: Number(batch.portion_g),
            laterDays: Array.from({ length: portions - 1 }, (_, i) => addDays(date, i + 1))
              .filter((d) => rows("planned_meals").some((r) => r.date === d && r.slot === own.slot && r.meal_slug === meal.slug))
              .map((d) => DAY_NAME[weekday(d)]),
          }
        : null;
    // A batch portion keeps the grams it was cooked at, so there is nothing to explain.
    const items = scaleItems(meal, plannedRaw, batch ? null : change);
    const moved = items.filter((i) => i.wasG !== null).map((i) => i.food);
    const open = slots.filter((x) => x.logKey === null && x.skipKey === null).length || 1;
    const eatenKcal = rows("meal_logs")
      .filter((l) => l.date === date)
      .reduce((sum, l) => sum + Number(l.kcal ?? 0), 0);
    return {
      mode: "today",
      date,
      meal,
      slot: own.slot,
      meta: leftover
        ? `${DAY_NAME[weekday(date)]} ${own.slot} · portion ${leftover.portion} of ${portions} from ${leftover.cookedOn}'s batch`
        : `${SLOT_LABEL[own.slot]} · ${own.time} · ${meal.kcal} cal · ${meal.protein} g protein`,
      state,
      eatenAt: own.loggedAt ? formatClock(localMinutes(new Date(own.loggedAt))) : null,
      logKey: own.logKey ?? own.skipKey,
      items,
      wasNote: change && moved.length ? wasReason(change, moved) : null,
      mainProtein: { food: main.food, name: foods.get(main.food)!.name },
      canCook: state === "open" && !batch,
      todayBatch,
      leftover,
      swaps: state === "open" ? swapOptions(rows, date, own.slot, meal, factor, (targets.kcal - eatenKcal) / open) : [],
      haveIt: null,
      restingUntil: null,
      photoKey: photoOf(meal.slug),
      steps: meal.steps,
    };
  }

  const meal = scaledMeal(raw, factor);
  const main = mainProtein(meal);
  const rest = rows("meal_state").find((r) => r.slug === raw.slug && typeof r.rested_until === "string" && (r.rested_until as string) >= date);
  const restingUntil = rest ? monthDay(rest.rested_until as string) : null;
  const fitsToday = raw.mode === "any" || dayMode(date) === "weekend";
  const open = slots.filter((x) => x.logKey === null && x.skipKey === null && slotPool(x.slot) === raw.pool);
  // The pool's slot that is still current (until the next slot begins, as Today's "next" row), else its first open one.
  const pick = open.find((x) => minutes < (slots[slots.indexOf(x) + 1]?.minutes ?? 27 * 60)) ?? open[0];
  return {
    mode: "browse",
    date,
    meal,
    slot: null,
    meta: `${POOL_LABEL[raw.pool]} · ${meal.kcal} cal · ${meal.protein} g protein`,
    state: "open",
    eatenAt: null,
    logKey: null,
    items: scaleItems(meal, raw, change),
    wasNote: null,
    mainProtein: { food: main.food, name: foods.get(main.food)!.name },
    canCook: false,
    todayBatch: null,
    leftover: null,
    swaps: [],
    haveIt:
      pick && fitsToday && !restingUntil
        ? { slot: pick.slot, label: pick.slot === "dinner" ? "Have it for dinner tonight" : `Have it for ${pick.slot} today`, then: `Replaces ${pick.meal.name.toLowerCase()}, just today.` }
        : null,
    restingUntil,
    photoKey: photoOf(raw.slug),
    steps: meal.steps,
  };
}

/** What goes on the scale for `portions` portions. A leftover day weighs the batch's cooked protein instead. */
export function scaleRows(m: MealModel, portions: number): ScaleRow[] {
  return m.items.map((i) => {
    if (m.leftover && i.food === m.mainProtein.food) {
      const share = m.leftover.portions === 3 ? "a third" : "half";
      return { food: i.food, name: `${i.name}, from the batch`, sub: `Cooked, ${share} of ${m.leftover.cookedWeightG} g`, grams: m.leftover.portionG, was: null, highlight: true };
    }
    const grams = scaleGrams(i.grams, portions);
    const wasG = i.wasG === null ? null : scaleGrams(i.wasG, portions);
    const each = i.eachG && i.eachLabel ? Math.round(grams / i.eachG) : null;
    const parts = [
      i.state,
      portions > 1 ? `${i.grams} g a portion` : null,
      i.note,
      each ? `about ${each} ${i.eachLabel}${each === 1 ? "" : "s"}` : null,
      m.mode === "browse" && wasG !== null ? `was ${wasG}` : null,
    ].filter((x): x is string => Boolean(x));
    return {
      food: i.food,
      name: i.name,
      sub: parts.length ? capital(parts.join(", ")) : null,
      grams,
      was: m.mode === "today" && wasG !== null ? `Was ${wasG}.` : null,
      highlight: false,
    };
  });
}

/** The meta line while cooking for more than today: "Lunch for Wed, Thu, Fri · 605 cal each". */
export function batchMeta(m: MealModel, portions: number): string {
  const days = Array.from({ length: portions }, (_, i) => DOW[weekday(addDays(m.date, i))]);
  return `${SLOT_LABEL[m.slot!]} for ${days.join(", ")} · ${m.meal.kcal} cal each`;
}
