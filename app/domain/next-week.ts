import { dayMode } from './calendar';
import { generateWeek, type PlannedMeal, type RotationMeal } from './rotation';
import { SLOTS, slotPool, type ISODate, type Pool, type Slot } from './types';

export interface MealSwap {
  date: ISODate;
  slot: Slot;
  slug: string;
}

export interface NextWeekInput {
  weekStart: ISODate;
  meals: RotationMeal[];
  lastEaten: Record<string, ISODate>;
  rested: string[];
  swaps: MealSwap[];
}

/** A swap is kept only when the meal fits the slot's pool and the day's mode and is not resting. */
export function swapFits(swap: MealSwap, meals: RotationMeal[], rested: string[]): boolean {
  const meal = meals.find((m) => m.slug === swap.slug);
  if (!meal || rested.includes(meal.slug)) return false;
  if (meal.pool !== slotPool(swap.slot)) return false;
  return meal.mode === 'any' || dayMode(swap.date) === 'weekend' || meal.mode === dayMode(swap.date);
}

/**
 * Next week's plan as the check-in shows it: the rotation with the chosen rests, then any swaps on top.
 * Pure so the check-in page can redraw it in the browser as Rest toggles change.
 */
export function previewWeek(input: NextWeekInput): PlannedMeal[] {
  const week = generateWeek({ weekStart: input.weekStart, meals: input.meals, lastEaten: input.lastEaten, rested: input.rested });
  return week.map((p) => {
    const swap = input.swaps.find((s) => s.date === p.date && s.slot === p.slot);
    return swap && swapFits(swap, input.meals, input.rested) ? { ...p, slug: swap.slug } : p;
  });
}

/** Swaps travel in forms and links as "date|slot|slug". Anything malformed is dropped. */
export function encodeSwap(s: MealSwap): string {
  return `${s.date}|${s.slot}|${s.slug}`;
}

export function parseSwaps(values: string[]): MealSwap[] {
  const out: MealSwap[] = [];
  for (const v of values) {
    const [date, slot, slug] = v.split('|');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? '') || !SLOTS.includes(slot as Slot) || !slug) continue;
    out.push({ date, slot: slot as Slot, slug });
  }
  return out;
}

const POOL_ORDER: Record<Pool, number> = { main: 0, breakfast: 1, snack: 2, dessert: 3 };

/** Meals entering rotation: planned next week but not eaten this week, mains first, in plan order. */
export function freshMeals(plannedSlugs: string[], eatenThisWeek: string[], poolOf: (slug: string) => Pool | undefined, limit = 3): string[] {
  return [...new Set(plannedSlugs)]
    .filter((s) => !eatenThisWeek.includes(s) && poolOf(s) !== undefined)
    .map((slug, i) => ({ slug, i, rank: POOL_ORDER[poolOf(slug)!] }))
    .sort((a, b) => a.rank - b.rank || a.i - b.i)
    .slice(0, limit)
    .map((x) => x.slug);
}
