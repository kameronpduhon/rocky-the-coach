// Dev only. Resets the LOCAL D1 and writes the state the approved Today mockup shows:
// Monday 2026-10-12, Week 2, breakfast eaten, weighed in at 7:12am, 3,120 steps, a 7-day on-plan streak,
// and last Monday's session (pushdown hit the top of its range, so it goes up next time).
// Pair it with DEV_NOW="2026-10-12T11:00:00-05:00" in .dev.vars.
//
// With --workout it also starts today's session the way the Workout mockup shows it at 11:00: started at
// 10:41:18 (18:42 elapsed), incline press done at 60 x 10 twice, pec deck set 1 logged at 140 x 11 six seconds
// ago (1:24 of rest left). Today then reads "Continue workout", so leave the flag off for the Today mockup.
//
// With --sunday it plays the whole of week 2 out instead, for the Progress and Sunday check-in mockups at
// Sunday 2026-10-18 7:30pm (DEV_NOW="2026-10-18T19:30:00-05:00"): daily weigh-ins from 207 down to a 205.2
// average, waist 34.6 (down 0.4), every training day lifted plus a Thursday optional session, a few lifts gone
// up, 6 of 7 days on plan with one relaxed Saturday dinner, 7,640 average steps, and the chicken bowl eaten 4
// times and the yogurt bowl 3 times so both Rest toggles show. Next week's grocery list is the preview the
// check-in builds. Week 1's check-in is on record in every variant, so Monday morning never shows it as due.
//
// Usage: npm run seed:demo
//        npm run seed:demo -- --workout
//        npm run seed:demo -- --sunday
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

const WORKOUT = process.argv.includes("--workout");
const SUNDAY = process.argv.includes("--sunday");
if (WORKOUT && SUNDAY) {
  console.error("Pick one of --workout and --sunday.");
  process.exit(1);
}

const WEEK0 = "2026-09-28";
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

// Sunday variant: the week ran on a batch of chicken bowls and the yogurt bowl most mornings, so both cross
// the 3-a-week line the check-in watches for. Each target slot takes the pinned meal; whatever it displaced
// fills any other slot that already held it, so nothing else reaches 3.
if (SUNDAY) {
  const targets: [string, Slot, string][] = [
    ["2026-10-13", "lunch", "chicken-and-rice-bowl"],
    ["2026-10-14", "dinner", "chicken-and-rice-bowl"],
    ["2026-10-15", "lunch", "chicken-and-rice-bowl"],
    ["2026-10-14", "breakfast", "greek-yogurt-power-bowl"],
    ["2026-10-16", "breakfast", "greek-yogurt-power-bowl"],
  ];
  const isTarget = (p: PlannedMeal) => p.date === TODAY || targets.some(([d, sl]) => d === p.date && sl === p.slot);
  for (const [date, slot, slug] of targets) {
    const entry = week2.find((p) => p.date === date && p.slot === slot)!;
    const displaced = entry.slug;
    entry.slug = slug;
    const elsewhere = week2.find((p) => p.slug === slug && !isTarget(p) && slotPool(p.slot) === slotPool(slot));
    if (elsewhere) elsewhere.slug = displaced;
  }
  // Monday's pins can push a displaced meal to a third showing; spread those extras to the least used fits.
  const pinned = new Set(targets.map(([, , slug]) => slug));
  const tally = () => {
    const c = new Map<string, number>();
    for (const p of week2) c.set(p.slug, (c.get(p.slug) ?? 0) + 1);
    return c;
  };
  for (const p of week2) {
    const c = tally();
    if (isTarget(p) || pinned.has(p.slug) || (c.get(p.slug) ?? 0) < 3) continue;
    const weekend = ["2026-10-17", "2026-10-18"].includes(p.date);
    const sameDay = week2.filter((x) => x.date === p.date).map((x) => x.slug);
    const pick = meals
      .filter((m) => m.pool === slotPool(p.slot) && (weekend || m.mode !== "weekend") && !m.tags.includes("ground-beef") && !sameDay.includes(m.slug) && !pinned.has(m.slug))
      .sort((a, b) => (c.get(a.slug) ?? 0) - (c.get(b.slug) ?? 0))[0];
    if (pick && (c.get(pick.slug) ?? 0) < 2) p.slug = pick.slug;
  }
  for (const day of new Set(week2.map((p) => p.date))) {
    const lunch = week2.find((p) => p.date === day && p.slot === "lunch")!.slug;
    if (lunch === week2.find((p) => p.date === day && p.slot === "dinner")!.slug) throw new Error(`Lunch and dinner match on ${day}`);
  }
  const counts = new Map<string, number>();
  for (const p of week2) counts.set(p.slug, (counts.get(p.slug) ?? 0) + 1);
  const heavy = [...counts].filter(([, n]) => n >= 3).map(([slug, n]) => `${slug} ${n}`).sort();
  if (heavy.join() !== "chicken-and-rice-bowl 4,greek-yogurt-power-bowl 3") throw new Error(`Unexpected repeats: ${heavy.join(", ")}`);
}

for (const p of [...week1, ...week2] as PlannedMeal[]) insert("planned_meals", { date: p.date, slot: p.slot, meal_slug: p.slug, swapped: 0 });

// Week 1: every planned meal eaten, enough protein, steps over goal, no off-plan dessert. Seven days on plan.
const STEPS = [8240, 7610, 9130, 7420, 8870, 10210, 7820];
const WEIGHTS = [207.0, 206.3, 206.6, 205.7, 206.0, 205.4, 205.7];
// The week before the phase started, so the first check-ins have a week-on-week change to judge.
const WEEK0_WEIGHTS = [207.6, 207.2, 207.5, 207.0, 207.4, 207.1, 207.3];
WEEK0_WEIGHTS.forEach((w, d) => insert("weigh_ins", { date: addDays(WEEK0, d), weight_lb: w, logged_at: at(addDays(WEEK0, d), "07:20") }));
insert("waist_logs", { date: "2026-10-04", inches: 35.0 });
insert("waist_logs", { date: "2026-10-11", inches: 34.8 });
insert("check_ins", {
  week_start: WEEK1, avg_weight: 206.1, change: -1.2, adherence: 7,
  outcome: JSON.stringify({ kind: "too-early", choice: "calories", kcal: 2400, stepGoal: 7500 }), completed_at: at("2026-10-11", "19:40"),
});
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

if (SUNDAY) {
  // Week 2 played out. Tuesday came up short on steps, Saturday dinner was a relaxed restaurant meal, and
  // Sunday is logged through dinner (dessert is still to come at 7:30pm).
  const W2_STEPS = [8120, 5900, 8340, 7710, 8030, 7560, 7820];
  const W2_WEIGHTS = [205.8, 205.3, 205.6, 204.9, 205.2, 204.7, 204.9];
  for (let d = 0; d < 7; d++) {
    const date = addDays(TODAY, d);
    let protein = 0;
    for (const p of week2.filter((x) => x.date === date)) {
      if (date === "2026-10-17" && p.slot === "dinner") continue;
      if (date === "2026-10-18" && p.slot === "dessert") continue;
      const m = macros(p.slug);
      protein += m.protein;
      insert("meal_logs", {
        date, slot: p.slot, meal_slug: p.slug, name: bySlug.get(p.slug)!.name, category: "planned", kcal: m.kcal, protein_g: m.protein, relaxed: 0, portions: 1,
        logged_at: at(date, plan.slotTimes[p.slot]),
      });
    }
    if (date === "2026-10-17") {
      protein += 50;
      insert("meal_logs", {
        date, slot: null, meal_slug: null, name: "Restaurant meal", category: "meal", kcal: 900, protein_g: 50, relaxed: 1, portions: 1, logged_at: at(date, "19:10"),
      });
    }
    if (protein < 180) {
      insert("meal_logs", {
        date, slot: null, meal_slug: null, name: "Protein shake", category: "snack", kcal: 130, protein_g: 25, relaxed: 0, portions: 1, logged_at: at(date, "16:30"),
      });
    }
    insert("steps_daily", { date, steps: W2_STEPS[d], updated_at: at(date, d === 6 ? "19:15" : "21:00") });
    insert("weigh_ins", { date, weight_lb: W2_WEIGHTS[d], logged_at: at(date, "07:12") });
  }
  insert("waist_logs", { date: "2026-10-18", inches: 34.6 });
} else {
  const breakfast = macros(TODAY_MEALS.breakfast);
  insert("meal_logs", {
    date: TODAY, slot: "breakfast", meal_slug: TODAY_MEALS.breakfast, name: bySlug.get(TODAY_MEALS.breakfast)!.name, category: "planned",
    kcal: breakfast.kcal, protein_g: breakfast.protein, relaxed: 0, portions: 1, logged_at: at(TODAY, "08:05"),
  });
  insert("weigh_ins", { date: TODAY, weight_lb: 205.8, logged_at: at(TODAY, "07:12") });
  insert("steps_daily", { date: TODAY, steps: 3120, updated_at: at(TODAY, "10:45") });
}

// Week 1 sessions. On Monday only the pushdown hit the top of its range on both sets; Wednesday's leg press
// and Friday's flat press and lateral raise did too, so the Sunday variant shows them gone up. Monday's numbers are the ones the
// Workout mockup shows under "Last time".
const SESSIONS: { date: string; template: string; sets: Record<string, [number, number, number][]> }[] = [
  {
    date: WEEK1,
    template: "mon-chest-back-arms",
    sets: {
      "incline-dumbbell-press": [[60, 9, 1], [60, 8, 2]],
      "pec-deck": [[140, 12, 1], [140, 11, 2]],
      "lat-pulldown": [[130, 10, 1], [130, 9, 2]],
      "seated-cable-row": [[120, 12, 1], [120, 11, 2]],
      "preacher-curl": [[60, 10, 1], [60, 9, 2]],
      "cable-triceps-pushdown": [[70, 12, 1], [70, 12, 2]],
    },
  },
  {
    date: "2026-10-07",
    template: "wed-legs-shoulders",
    sets: {
      "leg-press": [[270, 12, 1], [270, 12, 2]],
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
      "flat-dumbbell-press": [[65, 10, 1], [65, 10, 2]],
      "low-to-high-cable-fly": [[30, 11, 1], [30, 10, 2]],
      "dumbbell-lateral-raise": [[20, 15, 1], [20, 15, 2]],
      "reverse-pec-deck": [[80, 13, 1], [80, 12, 2]],
      "incline-dumbbell-curl": [[30, 10, 1], [30, 9, 2]],
      "overhead-cable-triceps-extension": [[50, 11, 1], [50, 10, 2]],
    },
  },
];
if (SUNDAY) {
  SESSIONS.push(
    {
      date: TODAY,
      template: "mon-chest-back-arms",
      sets: {
        "incline-dumbbell-press": [[60, 10, 1], [60, 10, 2]],
        "pec-deck": [[140, 12, 1], [140, 12, 2]],
        "lat-pulldown": [[130, 11, 1], [130, 10, 2]],
        "seated-cable-row": [[120, 12, 1], [120, 11, 2]],
        "preacher-curl": [[60, 11, 1], [60, 10, 2]],
        "cable-triceps-pushdown": [[75, 11, 1], [75, 10, 2]],
      },
    },
    {
      date: "2026-10-14",
      template: "wed-legs-shoulders",
      sets: {
        "leg-press": [[280, 10, 1], [280, 9, 2]],
        "dumbbell-romanian-deadlift": [[55, 10, 1], [55, 9, 2]],
        "lying-leg-curl": [[90, 12, 1], [90, 11, 2]],
        "leg-extension": [[120, 14, 1], [120, 13, 2]],
        "seated-dumbbell-shoulder-press": [[45, 9, 1], [45, 8, 2]],
        "cable-lateral-raise": [[15, 14, 1], [15, 13, 2]],
      },
    },
    {
      date: "2026-10-15",
      template: "optional-arms-back",
      sets: {
        "pull-up": [[0, 8, 1], [0, 7, 2]],
        "cable-lateral-raise": [[15, 13, 1], [15, 12, 2]],
        "hammer-curl": [[35, 11, 1], [35, 10, 2]],
        "rope-pushdown": [[50, 12, 1], [50, 11, 2]],
      },
    },
    {
      date: "2026-10-16",
      template: "fri-chest-shoulders-arms",
      sets: {
        "flat-dumbbell-press": [[70, 8, 1], [70, 8, 2]],
        "low-to-high-cable-fly": [[30, 12, 1], [30, 11, 2]],
        "dumbbell-lateral-raise": [[25, 11, 1], [25, 10, 2]],
        "reverse-pec-deck": [[80, 14, 1], [80, 13, 2]],
        "incline-dumbbell-curl": [[30, 11, 1], [30, 10, 2]],
        "overhead-cable-triceps-extension": [[50, 12, 1], [50, 11, 2]],
      },
    },
  );
}

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

if (WORKOUT) {
  const id = SESSIONS.length + 1;
  const atSec = (hhmmss: string) => new Date(`${TODAY}T${hhmmss}-05:00`).toISOString();
  insert("workout_sessions", { id, date: TODAY, template_id: "mon-chest-back-arms", started_at: atSec("10:41:18"), ended_at: null });
  const today: [string, number, number, number, number, string][] = [
    ["incline-dumbbell-press", 0, 1, 60, 10, "10:47:05"],
    ["incline-dumbbell-press", 0, 2, 60, 10, "10:51:40"],
    // 140, not the mockup's 145: last time was 140 x 12, 140 x 11, so progression holds the weight.
    ["pec-deck", 1, 1, 140, 11, "10:59:54"],
  ];
  for (const [exerciseId, position, setNumber, weight, reps, time] of today) {
    insert("set_logs", { session_id: id, exercise_id: exerciseId, position, set_number: setNumber, weight_lb: weight, reps, logged_at: atSec(time), client_id: `demo-${exerciseId}-${setNumber}` });
  }
}

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
const templates = plan.templates as Record<string, { exercises: { exercise: string }[] }>;
const heroes = new Set<string>(Object.values(templates).map((t) => exercisesById.get(t.exercises[0].exercise)!.dbId));
// The mid-session Workout screen shows every Monday exercise as a thumbnail.
if (WORKOUT) for (const e of templates["mon-chest-back-arms"].exercises) heroes.add(exercisesById.get(e.exercise)!.dbId);
// Progress lists the lifts that went up with their photos.
if (SUNDAY) for (const s of SESSIONS) for (const id of Object.keys(s.sets)) heroes.add(exercisesById.get(id)!.dbId);
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
