// A day's five planned meals at that day's grams, and how each was answered. Today, the close-out and the meal screen
// all read it, so they never disagree about what was planned. Pure: the browser and the unit tests both run it.
import { meals, plan, type MealWithMacros } from "~/content";
import { factorFor, scaledMeal } from "~/content/scaled";
import { resolveTargets, type TargetEntry, type Targets } from "~/content/targets";
import { dayMode } from "~/domain/calendar";
import { parseTime } from "~/domain/dates";
import { SLOTS, slotPool, type ISODate, type Slot } from "~/domain/types";
import { keyOf } from "~/sync/tables";
import type { Rows } from "~/workout/sessions";

export type { Rows };

export const SLOT_LABEL: Record<Slot, string> = { breakfast: "Breakfast", lunch: "Lunch", snack: "Snack", dinner: "Dinner", dessert: "Dessert" };
export const DAY_NAME = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function shortClock(minutes: number): string {
  const h24 = Math.floor(minutes / 60) % 24;
  return `${h24 % 12 === 0 ? 12 : h24 % 12}:${String(minutes % 60).padStart(2, "0")}`;
}

export function targetEntries(rows: Rows): TargetEntry[] {
  return rows("targets")
    .map((r) => ({ effectiveFrom: r.effective_from as string, kcal: Number(r.kcal), proteinG: Number(r.protein_g), stepGoal: Number(r.step_goal) }))
    .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
}

export function targetsOn(rows: Rows, date: ISODate): Targets {
  return resolveTargets(targetEntries(rows), date);
}

export function restedOn(rows: Rows, date: ISODate): Set<string> {
  return new Set(rows("meal_state").filter((r) => typeof r.rested_until === "string" && (r.rested_until as string) >= date).map((r) => r.slug as string));
}

/** The same rule as plannedForDate's fallback: the first meal of the slot's pool that fits the day and isn't resting. */
function fallbackMeal(slot: Slot, date: ISODate, rested: Set<string>): MealWithMacros {
  const mode = dayMode(date);
  const pick = [...meals.values()].find((m) => m.pool === slotPool(slot) && (m.mode === "any" || mode === "weekend") && !rested.has(m.slug));
  if (!pick) throw new Error(`No meal for ${slot}`);
  return pick;
}

export interface DaySlot {
  slot: Slot;
  /** "2:00", as the mock's list shows it. */
  time: string;
  minutes: number;
  meal: MealWithMacros;
  /** The store key of the log that ate it, or null. */
  logKey: string | null;
  /** The store key of the skip that answered it, or null. */
  skipKey: string | null;
  /** When it was eaten, from its log. */
  loggedAt: string | null;
}

export function daySlots(rows: Rows, date: ISODate, factor = factorFor(targetsOn(rows, date).kcal)): DaySlot[] {
  const rested = restedOn(rows, date);
  const planned = new Map(rows("planned_meals").filter((r) => r.date === date).map((r) => [r.slot as string, r.meal_slug as string]));
  const logs = rows("meal_logs").filter((r) => r.date === date);
  return SLOTS.map((slot) => {
    const at = parseTime(plan.slotTimes[slot]);
    const eaten = logs.find((l) => l.slot === slot && l.category === "planned");
    const skip = logs.find((l) => l.slot === slot && l.category === "skipped");
    return {
      slot,
      time: shortClock(at),
      minutes: at,
      meal: scaledMeal(meals.get(planned.get(slot) ?? "") ?? fallbackMeal(slot, date, rested), factor),
      logKey: eaten ? keyOf("meal_logs", eaten) : null,
      skipKey: skip ? keyOf("meal_logs", skip) : null,
      loggedAt: eaten ? (eaten.logged_at as string) : null,
    };
  });
}
