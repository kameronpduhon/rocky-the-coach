import { roundGrams } from "./macros";
import { SLOTS, slotPool, type Pool } from "./types";

export type FoodRole = "protein" | "flex" | "fixed";

export const FACTOR_MIN = 0.5;
export const FACTOR_MAX = 1.5;

export interface RescaleMeal {
  pool: Pool;
  ingredients: { grams: number; kcalPer100: number; role: FoodRole }[];
}

/** Flex calories on an average planned day: each slot's pool average at recipe grams, added over the five slots. */
export function flexKcalPerDay(meals: RescaleMeal[]): number {
  const flexKcal = (m: RescaleMeal) => m.ingredients.reduce((sum, i) => sum + (i.role === "flex" ? (i.grams / 100) * i.kcalPer100 : 0), 0);
  return SLOTS.reduce((sum, slot) => {
    const pool = meals.filter((m) => m.pool === slotPool(slot));
    return sum + (pool.length ? pool.reduce((s, m) => s + flexKcal(m), 0) / pool.length : 0);
  }, 0);
}

/** How far every flex food moves for a target, when the meals were written for `referenceKcal`. */
export function rescaleFactor(targetKcal: number, referenceKcal: number, flexPerDay: number): number {
  if (flexPerDay <= 0) return 1;
  return Math.min(FACTOR_MAX, Math.max(FACTOR_MIN, 1 + (targetKcal - referenceKcal) / flexPerDay));
}

/** The lowest target that keeps flex foods at half portions or more, rounded up to the next 50. */
export function halfPortionKcal(referenceKcal: number, flexPerDay: number): number {
  return Math.ceil((referenceKcal + (FACTOR_MIN - 1) * flexPerDay) / 50) * 50;
}

export function scaleIngredient(grams: number, role: FoodRole, factor: number): number {
  return role === "flex" && factor !== 1 ? roundGrams(grams * factor) : grams;
}
