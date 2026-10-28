import exercisesJson from "../../content/exercises.json";
import foodsJson from "../../content/foods.json";
import messagesJson from "../../content/messages.json";
import planJson from "../../content/plan.json";
import { mealMacros } from "~/domain/macros";
import { ExerciseSchema, FoodSchema, MealSchema, MessagesSchema, PlanSchema, type Exercise, type Food, type Meal } from "./schema";

const mealFiles = import.meta.glob("../../content/meals/*.json", { eager: true, import: "default" });

export const plan = PlanSchema.parse(planJson);
export const messages = MessagesSchema.parse(messagesJson);
export const foods: Map<string, Food> = new Map(FoodSchema.array().parse(foodsJson).map((f) => [f.id, f]));
export const exercises: Map<string, Exercise> = new Map(ExerciseSchema.array().parse(exercisesJson).map((e) => [e.id, e]));

export interface MealWithMacros extends Meal {
  kcal: number;
  protein: number;
}

const foodMacros = new Map([...foods].map(([id, f]) => [id, { kcalPer100: f.kcalPer100, proteinPer100: f.proteinPer100 }]));

export const meals: Map<string, MealWithMacros> = new Map(
  Object.values(mealFiles).map((raw) => {
    const meal = MealSchema.parse(raw);
    const m = mealMacros(meal.ingredients.map((i) => ({ foodId: i.food, grams: i.grams })), foodMacros);
    return [meal.slug, { ...meal, kcal: m.kcal, protein: m.protein }];
  }),
);

export function exerciseImage(ex: Exercise, frame: 0 | 1): string {
  return `/media/exercises/${ex.dbId}/${frame}.jpg`;
}

/** Muscle groups in display order, for lists of exercises. */
export const GROUP_LABEL: Record<string, string> = {
  chest: "Chest",
  back: "Back",
  "shoulder-press": "Shoulder press",
  "side-delts": "Side delts",
  "rear-delts": "Rear delts",
  biceps: "Biceps",
  triceps: "Triceps",
  quads: "Quads",
  hamstrings: "Hamstrings",
};

export type BodyPart = "chest" | "back" | "shoulders" | "arms" | "legs";

/** The five body parts lists group exercises by, in list order. */
export const BODY_PARTS: { id: BodyPart; label: string }[] = [
  { id: "chest", label: "Chest" },
  { id: "back", label: "Back" },
  { id: "shoulders", label: "Shoulders" },
  { id: "arms", label: "Arms" },
  { id: "legs", label: "Legs" },
];

/** The 9 muscle groups folded into the 5 body parts. */
export const BODY_PART: Record<Exercise["group"], BodyPart> = {
  chest: "chest",
  back: "back",
  "shoulder-press": "shoulders",
  "side-delts": "shoulders",
  "rear-delts": "shoulders",
  biceps: "arms",
  triceps: "arms",
  quads: "legs",
  hamstrings: "legs",
};
