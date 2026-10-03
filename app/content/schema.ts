import { z } from "zod";

export const SectionSchema = z.enum(["meat-seafood", "dairy-eggs", "produce", "pantry"]);

export const FoodSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string(),
  fdcId: z.number().int().nullable(),
  source: z.enum(["sr-legacy", "foundation", "label"]),
  state: z.enum(["raw", "cooked", "as-is"]),
  kcalPer100: z.number().nonnegative(),
  proteinPer100: z.number().nonnegative(),
  section: SectionSchema,
  eachG: z.number().positive().optional(),
  eachLabel: z.string().optional(),
});
export type Food = z.infer<typeof FoodSchema>;

export const MealSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string(),
  pool: z.enum(["breakfast", "main", "snack", "dessert"]),
  mode: z.enum(["any", "weekend"]),
  tags: z.array(z.string()),
  ingredients: z
    .array(z.object({ food: z.string(), grams: z.number().positive(), note: z.string().optional() }))
    .min(1),
  steps: z.array(z.string()).min(1),
  source: z.string(),
});
export type Meal = z.infer<typeof MealSchema>;

export const ExerciseSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string(),
  dbId: z.string(),
  group: z.enum(["chest", "back", "biceps", "triceps", "quads", "hamstrings", "shoulder-press", "side-delts", "rear-delts"]),
  equipment: z.enum(["machine", "cable", "dumbbell", "barbell", "body-weight"]),
  compound: z.boolean(),
  increment: z.union([z.literal(5), z.literal(10)]),
});
export type Exercise = z.infer<typeof ExerciseSchema>;

const TemplateSchema = z.object({
  name: z.string(),
  kind: z.enum(["gym", "optional", "plan-b"]),
  exercises: z.array(z.object({ exercise: z.string(), repMin: z.number().int(), repMax: z.number().int() })).min(1),
});
export type Template = z.infer<typeof TemplateSchema>;

const hhmm = z.string().regex(/^\d{2}:\d{2}$/);

export const PlanSchema = z.object({
  phaseStart: z.string(),
  weekTypes: z.record(z.string(), z.enum(["standard", "deload", "maintenance", "checkpoint"])),
  relaxedDays: z.array(z.string()),
  training: z.record(z.string(), z.string()),
  optional: z.record(z.string(), z.string()),
  planB: z.string(),
  startingTargets: z.object({ kcal: z.number(), proteinG: z.number(), stepGoal: z.number() }),
  maintenanceKcal: z.number(),
  slotTimes: z.object({ breakfast: hhmm, lunch: hhmm, snack: hhmm, dinner: hhmm, dessert: hhmm }),
  poolRanges: z.record(
    z.enum(["breakfast", "main", "snack", "dessert"]),
    z.object({ kcalMin: z.number(), kcalMax: z.number(), proteinMin: z.number() }),
  ),
  templates: z.record(z.string(), TemplateSchema),
});
export type Plan = z.infer<typeof PlanSchema>;

export const MessagesSchema = z.record(z.string(), z.array(z.string()).min(1));
