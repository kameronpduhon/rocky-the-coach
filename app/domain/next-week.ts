import { dayMode } from './calendar';
import { generateWeek, type PlannedMeal, type RotationMeal } from './rotation';
import { slotPool, type ISODate, type Slot } from './types';

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
