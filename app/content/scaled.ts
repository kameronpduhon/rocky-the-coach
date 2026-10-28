// Meals at the grams the calorie target asks for. Rice, potato, honey and added fats move together; protein never does.
import { mealMacros } from "~/domain/macros";
import { flexKcalPerDay, halfPortionKcal, rescaleFactor, scaleIngredient } from "~/domain/rescale";
import { foods, meals, plan, type MealWithMacros } from "./index";

const food = (id: string) => foods.get(id)!;

/** The target the meal files were written for. */
export const REFERENCE_KCAL = plan.startingTargets.kcal;

export const FLEX_KCAL_PER_DAY = flexKcalPerDay(
  [...meals.values()].map((m) => ({
    pool: m.pool,
    ingredients: m.ingredients.map((i) => ({ grams: i.grams, kcalPer100: food(i.food).kcalPer100, role: food(i.food).role })),
  })),
);

export const HALF_PORTION_KCAL = halfPortionKcal(REFERENCE_KCAL, FLEX_KCAL_PER_DAY);

export function factorFor(targetKcal: number): number {
  return rescaleFactor(targetKcal, REFERENCE_KCAL, FLEX_KCAL_PER_DAY);
}

/** The meal at `factor`, with its calories and protein recounted from the new grams. The same object at 1. */
export function scaledMeal(meal: MealWithMacros, factor: number): MealWithMacros {
  if (factor === 1) return meal;
  const ingredients = meal.ingredients.map((i) => ({ ...i, grams: scaleIngredient(i.grams, food(i.food).role, factor) }));
  const m = mealMacros(ingredients.map((i) => ({ foodId: i.food, grams: i.grams })), foods);
  return { ...meal, ingredients, kcal: m.kcal, protein: m.protein };
}
