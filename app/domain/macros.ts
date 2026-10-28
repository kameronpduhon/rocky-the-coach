export interface FoodMacros {
  kcalPer100: number;
  proteinPer100: number;
}

export interface IngredientAmount {
  foodId: string;
  grams: number;
}

export interface Macros {
  kcal: number;
  protein: number;
}

export function mealMacros(ingredients: IngredientAmount[], foods: Map<string, FoodMacros>): Macros {
  let kcal = 0;
  let protein = 0;
  for (const ing of ingredients) {
    const food = foods.get(ing.foodId);
    if (!food) throw new Error(`Unknown food: ${ing.foodId}`);
    kcal += (ing.grams / 100) * food.kcalPer100;
    protein += (ing.grams / 100) * food.proteinPer100;
  }
  return { kcal: Math.round(kcal / 5) * 5, protein: Math.round(protein) };
}

/** Portion rounding: to the nearest gram under 20 g, else to the nearest 5 g. */
export function roundGrams(g: number): number {
  return g < 20 ? Math.round(g) : Math.round(g / 5) * 5;
}

export function scaleGrams(gramsPerPortion: number, portions: number): number {
  return roundGrams(gramsPerPortion * portions);
}

export function batchPortion(cookedWeightG: number, portions: number): number {
  return Math.round(cookedWeightG / portions / 5) * 5;
}
