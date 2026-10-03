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

export function scaleGrams(gramsPerPortion: number, portions: number): number {
  const total = gramsPerPortion * portions;
  return total < 20 ? Math.round(total) : Math.round(total / 5) * 5;
}

export function batchPortion(cookedWeightG: number, portions: number): number {
  return Math.round(cookedWeightG / portions / 5) * 5;
}
