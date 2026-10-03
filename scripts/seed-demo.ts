// Dev only. Resets the LOCAL D1 and writes the state the approved Today mockup shows:
// Monday 2026-10-12, Week 2, breakfast eaten, weighed in at 7:12am, 3,120 steps, a 7-day on-plan streak,
// and last Monday's session (pushdown hit the top of its range, so it goes up next time).
// Pair it with DEV_NOW="2026-10-12T11:00:00-05:00" in .dev.vars.
//
// Usage: npm run seed:demo
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { addDays } from "../app/domain/dates";
import { mealMacros } from "../app/domain/macros";
import { generateWeek, type PlannedMeal, type RotationMeal } from "../app/domain/rotation";
import { slotPool, type Slot } from "../app/domain/types";

if (process.argv.some((a) => a.includes("remote"))) {
  console.error("seed-demo only ever writes the local database.");
  process.exit(1);
}

const ROOT = path.resolve(import.meta.dirname, "..");
const read = (p: string) => JSON.parse(readFileSync(path.join(ROOT, p), "utf8"));

interface MealFile extends RotationMeal {
  name: string;
  ingredients: { food: string; grams: number }[];
}
const meals: MealFile[] = readdirSync(path.join(ROOT, "content/meals")).map((f) => read(`content/meals/${f}`));
const bySlug = new Map(meals.map((m) => [m.slug, m]));
const foods = new Map<string, { kcalPer100: number; proteinPer100: number }>(
  read("content/foods.json").map((f: { id: string; kcalPer100: number; proteinPer100: number }) => [f.id, f]),
);
const plan = read("content/plan.json");
const exercisesById = new Map<string, { dbId: string }>(read("content/exercises.json").map((e: { id: string; dbId: string }) => [e.id, e]));

const macros = (slug: string) => mealMacros(bySlug.get(slug)!.ingredients.map((i) => ({ foodId: i.food, grams: i.grams })), foods);

const WEEK1 = "2026-10-05";
const TODAY = "2026-10-12";
const TODAY_MEALS: Record<Slot, string> = {
  breakfast: "greek-yogurt-power-bowl",
  lunch: "chicken-and-rice-bowl",
  snack: "cottage-cheese-and-pineapple",
  dinner: "lemon-butter-cod-and-potatoes",
  dessert: "protein-ice-cream",
};
for (const slug of Object.values(TODAY_MEALS)) if (!bySlug.has(slug)) throw new Error(`Unknown meal ${slug}`);

/** A Chicago wall-clock time in October (CDT, UTC-5) as an ISO instant. */
const at = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00-05:00`).toISOString();
const q = (v: string | number | null) => (v === null ? "NULL" : typeof v === "number" ? String(v) : `'${v.replace(/'/g, "''")}'`);
const sql: string[] = [];
const insert = (table: string, row: Record<string, string | number | null>) =>
  sql.push(`INSERT INTO ${table} (${Object.keys(row).join(", ")}) VALUES (${Object.values(row).map(q).join(", ")});`);

for (const t of [
  "meal_state", "planned_meals", "meal_logs", "batches", "workout_sessions", "set_logs", "exercise_overrides", "exercise_swaps",
  "weigh_ins", "waist_logs", "steps_daily", "targets", "check_ins", "notifications_sent", "grocery_checks",
]) {
  sql.push(`DELETE FROM ${t};`);
}

// Week 1 met its 7,000 step goal, so the ramp moved week 2 to 7,500.
insert("targets", { effective_from: TODAY, kcal: 2400, protein_g: 180, step_goal: 7500 });

const rotation = meals.map(({ slug, pool, mode, tags }) => ({ slug, pool, mode, tags }));
const week1 = generateWeek({ weekStart: WEEK1, meals: rotation, lastEaten: {}, rested: [] });
const lastEaten: Record<string, string> = {};
for (const p of week1) if (!lastEaten[p.slug] || lastEaten[p.slug] < p.date) lastEaten[p.slug] = p.date;
const week2 = generateWeek({ weekStart: TODAY, meals: rotation, lastEaten, rested: [] });

// Pin Monday to the mockup's meals. Wherever a pinned meal also landed later in the week in the same pool,
// hand that slot the meal Monday gave up, so weekly counts stay what the rotation chose.
for (const slot of Object.keys(TODAY_MEALS) as Slot[]) {
  const monday = week2.find((p) => p.date === TODAY && p.slot === slot)!;
  const forced = TODAY_MEALS[slot];
  if (monday.slug === forced) continue;
  for (const p of week2) {
    if (p.date !== TODAY && slotPool(p.slot) === slotPool(slot) && p.slug === forced) p.slug = monday.slug;
  }
  monday.slug = forced;
}

for (const p of [...week1, ...week2] as PlannedMeal[]) insert("planned_meals", { date: p.date, slot: p.slot, meal_slug: p.slug, swapped: 0 });

// Week 1: every planned meal eaten, enough protein, steps over goal, no off-plan dessert. Seven days on plan.
const STEPS = [8240, 7610, 9130, 7420, 8870, 10210, 7980];
const WEIGHTS = [207.4, 207.0, 206.8, 206.9, 206.4, 206.2, 206.0];
for (let d = 0; d < 7; d++) {
  const date = addDays(WEEK1, d);
  let protein = 0;
  for (const p of week1.filter((x) => x.date === date)) {
    const m = macros(p.slug);
    protein += m.protein;
    const meal = bySlug.get(p.slug)!;
    insert("meal_logs", {
      date, slot: p.slot, meal_slug: p.slug, name: meal.name, category: "planned", kcal: m.kcal, protein_g: m.protein, relaxed: 0, portions: 1,
      logged_at: at(date, plan.slotTimes[p.slot]),
    });
  }
  if (protein < 180) {
    insert("meal_logs", {
      date, slot: null, meal_slug: null, name: "Protein shake", category: "snack", kcal: 130, protein_g: 25, relaxed: 0, portions: 1,
      logged_at: at(date, "16:30"),
    });
  }
  insert("steps_daily", { date, steps: STEPS[d], updated_at: at(date, "21:00") });
  insert("weigh_ins", { date, weight_lb: WEIGHTS[d], logged_at: at(date, "07:15") });
}

// Today so far.
const breakfast = macros(TODAY_MEALS.breakfast);
insert("meal_logs", {
  date: TODAY, slot: "breakfast", meal_slug: TODAY_MEALS.breakfast, name: bySlug.get(TODAY_MEALS.breakfast)!.name, category: "planned",
  kcal: breakfast.kcal, protein_g: breakfast.protein, relaxed: 0, portions: 1, logged_at: at(TODAY, "08:05"),
});
insert("weigh_ins", { date: TODAY, weight_lb: 205.8, logged_at: at(TODAY, "07:12") });
insert("steps_daily", { date: TODAY, steps: 3120, updated_at: at(TODAY, "10:45") });

// Week 1 sessions. Only the pushdown hit the top of its range on both sets.
const SESSIONS: { date: string; template: string; sets: Record<string, [number, number, number][]> }[] = [
  {
    date: WEEK1,
    template: "mon-chest-back-arms",
    sets: {
      "incline-dumbbell-press": [[60, 9, 1], [60, 8, 2]],
      "pec-deck": [[110, 11, 1], [110, 10, 2]],
      "lat-pulldown": [[130, 10, 1], [130, 9, 2]],
      "seated-cable-row": [[140, 11, 1], [140, 10, 2]],
      "preacher-curl": [[50, 10, 1], [50, 9, 2]],
      "cable-triceps-pushdown": [[70, 12, 1], [70, 12, 2]],
    },
  },
  {
    date: "2026-10-07",
    template: "wed-legs-shoulders",
    sets: {
      "leg-press": [[270, 11, 1], [270, 10, 2]],
      "dumbbell-romanian-deadlift": [[55, 9, 1], [55, 9, 2]],
      "lying-leg-curl": [[90, 11, 1], [90, 10, 2]],
      "leg-extension": [[120, 13, 1], [120, 12, 2]],
      "seated-dumbbell-shoulder-press": [[45, 8, 1], [45, 7, 2]],
      "cable-lateral-raise": [[15, 13, 1], [15, 12, 2]],
    },
  },
  {
    date: "2026-10-09",
    template: "fri-chest-shoulders-arms",
    sets: {
      "flat-dumbbell-press": [[65, 8, 1], [65, 8, 2]],
      "low-to-high-cable-fly": [[30, 11, 1], [30, 10, 2]],
      "dumbbell-lateral-raise": [[20, 13, 1], [20, 12, 2]],
      "reverse-pec-deck": [[80, 13, 1], [80, 12, 2]],
      "incline-dumbbell-curl": [[30, 10, 1], [30, 9, 2]],
      "overhead-cable-triceps-extension": [[50, 11, 1], [50, 10, 2]],
    },
  },
];
SESSIONS.forEach((s, i) => {
  const id = i + 1;
  insert("workout_sessions", { id, date: s.date, template_id: s.template, started_at: at(s.date, "12:05"), ended_at: at(s.date, "12:52") });
  const template = plan.templates[s.template].exercises.map((e: { exercise: string }) => e.exercise);
  let minute = 8;
  for (const [exerciseId, sets] of Object.entries(s.sets)) {
    const position = template.indexOf(exerciseId);
    if (position < 0) throw new Error(`${exerciseId} is not in ${s.template}`);
    for (const [weight, reps, setNumber] of sets) {
      insert("set_logs", {
        session_id: id, exercise_id: exerciseId, position, set_number: setNumber, weight_lb: weight, reps,
        logged_at: at(s.date, `12:${String(minute).padStart(2, "0")}`),
      });
      minute += 3;
    }
  }
});

const sqlFile = path.join(ROOT, ".wrangler", "seed-demo.sql");
mkdirSync(path.dirname(sqlFile), { recursive: true });
writeFileSync(sqlFile, sql.join("\n") + "\n");
const wrangler = (args: string[]) => execFileSync("npx", ["wrangler", ...args], { cwd: ROOT, stdio: ["ignore", "ignore", "inherit"] });
wrangler(["d1", "migrations", "apply", "rocky-db", "--local"]);
wrangler(["d1", "execute", "rocky-db", "--local", "--file", sqlFile]);
console.log(`Seeded local D1 with ${sql.length} statements.`);

// The Today workout card leads with each template's first exercise photo. Same source and cache as the
// M4 image import, so this only fetches what is missing.
const BASE = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises";
const CACHE = path.join(ROOT, ".exercise-images");
mkdirSync(CACHE, { recursive: true });
const heroes = new Set<string>(
  Object.values(plan.templates as Record<string, { exercises: { exercise: string }[] }>).map((t) => exercisesById.get(t.exercises[0].exercise)!.dbId),
);
for (const dbId of heroes) {
  for (const frame of [0, 1]) {
    const file = path.join(CACHE, `${dbId}__${frame}.jpg`);
    if (!existsSync(file)) {
      const res = await fetch(`${BASE}/${dbId}/${frame}.jpg`);
      if (!res.ok) {
        console.warn(`Skipped ${dbId}/${frame}.jpg (${res.status}); the workout photo will be blank.`);
        continue;
      }
      writeFileSync(file, Buffer.from(await res.arrayBuffer()));
    }
    wrangler(["r2", "object", "put", `rocky-media/exercises/${dbId}/${frame}.jpg`, "--file", file, "--content-type", "image/jpeg", "--local"]);
  }
}
console.log(`Put ${heroes.size * 2} workout photos in local R2.`);
