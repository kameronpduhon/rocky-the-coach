import { dayMode } from './calendar';
import type { RotationMeal } from './rotation';
import { slotPool, type ISODate, type Pool, type Slot } from './types';

export interface MealSwap {
  date: ISODate;
  slot: Slot;
  slug: string;
}

/** A swap is kept only when the meal fits the slot's pool and the day's mode and is not resting. */
export function swapFits(swap: MealSwap, meals: RotationMeal[], rested: string[]): boolean {
  const meal = meals.find((m) => m.slug === swap.slug);
  if (!meal || rested.includes(meal.slug)) return false;
  if (meal.pool !== slotPool(swap.slot)) return false;
  return meal.mode === 'any' || dayMode(swap.date) === 'weekend' || meal.mode === dayMode(swap.date);
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
