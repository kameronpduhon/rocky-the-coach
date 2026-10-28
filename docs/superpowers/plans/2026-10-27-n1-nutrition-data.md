# N1: Nutrition Data, Rules and Named Changes Implementation Plan

> **For agentic workers:** implement this plan task-by-task with the `executing-plans` skill. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build everything the meal screens (N2) and the engine's call (N3) need, while nothing on screen changes:
- **Food roles and gram rescaling.** Every food is protein, flex or fixed, and one factor scales the flex foods with the calorie target.
- **The engine's math:** trend weight, day completeness, the burn, and the call. All pure, and not wired to a screen yet.
- **The data:** batches made on the phone, usual orders, and the check-in's engine columns.
- **The meal named changes:** skip, close out, swap, batch, and usual orders, run on the phone and the server alike.
- **Every reader shows scaled meals.** At today's 2,400 target the factor is 1, so every number stays as it is.

**Architecture:**
- **Pure math lives in `app/domain/`** (`rescale.ts`, `trend.ts`, `completeness.ts`, `energy.ts`) and takes plain inputs.
- **`app/content/scaled.ts`** binds the rescale math to the real meals and foods, the way `app/content/targets.ts` binds targets to the plan.
- **Shared mutators** in `app/sync/mutators.ts` gain the meal changes. `logMeal` and v1's `logPlannedMeal` snapshot calories and protein at the scaled grams.
- **A full snapshot after the change.** `batches` changes its row key to `byClientId`, so `SYNC_SCHEMA` goes to 3 and every phone takes a fresh snapshot once (built in W1, Task 4).

**Tech Stack:** Drizzle + D1 migrations, the F2 sync layer, Zod 4, Vitest 4 with `@cloudflare/vitest-plugin`.

**Spec:** `docs/superpowers/specs/2026-10-27-nutrition-design.md` (sections 1 to 3, and rollout step 1). **Branch:** `v2/n1-nutrition-data` (already created from `v2/nutrition-spec`, so the spec and this plan are committed).

**Calls made in this plan (flag them in the PR):**
- **The burn's window slope.** The spec reads "trend the day before the window starts" over 21 days. This plan uses the trend on the window's first day, divided by the 20 days between the two ends. Otherwise the first window, which starts on the phase's first day, has no trend before it and would never update.
- **The ideal target rounds down to 50.** It then never exceeds the burn, so the spec's "no surplus" guardrail holds by construction and has no code of its own.
- **`skipMeal` and `closeOutDay` entries carry `mealSlug`,** like `logMeal`. The phone knows the meal it showed, and the skipped row's name comes from it.
- **`closeOutDay` takes dates up to 2 days back.** The 3am rule files a late dessert under the day before, so at 1am "yesterday" is 2 calendar days back.
- **`logOffPlan` takes an optional `usualId`** rather than a `saveAsUsual` boolean. The usual order needs its own phone-made key.
- **`startBatch` plans only days in the same Monday-to-Sunday week.** Writing a next-week row would stop `ensureWeekPlan` from generating that week, and the check-in rewrites next week anyway.
- **A skipped slot counts as logged for meal reminders.** `loggedSlots` already takes any row with a slot, so nobody gets a lunch nag after skipping lunch. Nothing changes in the reminder code.
- **Today shows the day's factor, even on a batch day.** `logMeal` logs at the batch's factor. The two differ only after a check-in changes the target mid-batch, which can't happen before N3. N2's leftover view shows the batch's factor.
- **The maintenance week scales up from N1.** `resolveTargets` already returns 2,800 in week 12, so its flex foods grow (the factor clamps at 1.5). N3 swaps 2,800 for the burn.

---

## Ground rules

- Everything from the earlier plans applies:
    - No em dashes.
    - No `Co-Authored-By`.
    - One full `npm run typecheck && npm test` at the end.
    - Kameron runs remote migrations.
- Browser-run modules (`app/sync/*.ts` except `*.server.ts`, `app/domain/*`, `app/content/*`, `app/today/*`) import nothing from `cloudflare:workers` or `*.server.ts`.
- Store rows are raw D1 rows: snake_case, booleans `0`/`1`, JSON columns as strings.

## Food roles

| Role | Foods | Grams |
|---|---|---|
| `protein` | `chicken-breast-raw`, `chicken-thigh-raw`, `sirloin-raw`, `ground-beef-90-raw`, `salmon-raw`, `cod-raw`, `shrimp-raw`, `egg-whole`, `egg-white`, `greek-yogurt-nonfat`, `cottage-cheese-2`, `whey-protein` | Never change |
| `flex` | `white-rice-cooked`, `potato-russet-raw`, `sweet-potato-raw`, `honey`, `butter`, `olive-oil`, `sesame-oil`, `cheddar`, `feta`, `heavy-cream`, `avocado` | Scale with the target |
| `fixed` | `milk-2`, `banana`, `strawberries`, `blueberries`, `pineapple`, `mango`, `apple`, `bell-pepper-red`, `onion`, `lettuce-green-leaf`, `grape-tomatoes`, `broccoli`, `coconut-aminos`, `salsa`, `cocktail-sauce` | Never change |

---

### Task 1: Food roles

**Files:**
- Modify: `content/foods.json`, `app/content/schema.ts`, `docs/runbooks/add-recipe.md`
- Test: `tests/unit/content.test.ts`

- [ ] **Step 1: Write the failing test.** Add to `tests/unit/content.test.ts`, inside the `describe`:

```ts
  it("gives every food a role, with protein foods never scaling", () => {
    expect(foods.get("chicken-breast-raw")?.role).toBe("protein");
    expect(foods.get("egg-whole")?.role).toBe("protein");
    expect(foods.get("white-rice-cooked")?.role).toBe("flex");
    expect(foods.get("butter")?.role).toBe("flex");
    expect(foods.get("banana")?.role).toBe("fixed");
    expect(foods.get("salsa")?.role).toBe("fixed");
    expect([...foods.values()].filter((f) => f.role === "flex")).toHaveLength(11);
    expect([...foods.values()].filter((f) => f.role === "protein")).toHaveLength(12);
  });
```

- [ ] **Step 2: Run it to make sure it fails.**

```bash
npx vitest run --project unit tests/unit/content.test.ts
```

Expected: FAIL. `role` is undefined, and TypeScript complains that `role` isn't on `Food` (Vitest still runs).

- [ ] **Step 3: Add `role` to the schema.** In `app/content/schema.ts`, add to `FoodSchema` after `section: SectionSchema,`:

```ts
  /** protein never changes, flex scales with the calorie target, fixed stays as written. */
  role: z.enum(["protein", "flex", "fixed"]),
```

- [ ] **Step 4: Write the roles into `content/foods.json`.** Each food is one line ending ` }`. This script adds `"role"` before that brace and refuses to write unless all 38 lines matched:

```bash
node -e '
const fs = require("fs");
const p = "content/foods.json";
const protein = ["chicken-breast-raw","chicken-thigh-raw","sirloin-raw","ground-beef-90-raw","salmon-raw","cod-raw","shrimp-raw","egg-whole","egg-white","greek-yogurt-nonfat","cottage-cheese-2","whey-protein"];
const flex = ["white-rice-cooked","potato-russet-raw","sweet-potato-raw","honey","butter","olive-oil","sesame-oil","cheddar","feta","heavy-cream","avocado"];
let n = 0;
const out = fs.readFileSync(p, "utf8").replace(/^(\s*\{ "id": "([a-z0-9-]+)".*?) \}(,?)$/gm, (_, body, id, comma) => {
  n++;
  const role = protein.includes(id) ? "protein" : flex.includes(id) ? "flex" : "fixed";
  return `${body}, "role": "${role}" }${comma}`;
});
if (n !== 38) { console.error(`matched ${n} foods, expected 38`); process.exit(1); }
fs.writeFileSync(p, out);
console.log("roles written:", n);
'
```

Expected: `roles written: 38`. Run `git diff --stat content/foods.json`. It should show 38 changed lines.

- [ ] **Step 5: Run the content tests.**

```bash
npx vitest run --project unit tests/unit/content.test.ts
```

Expected: PASS.

- [ ] **Step 6: Ask for a role in the recipe runbook.** In `docs/runbooks/add-recipe.md`, step 2's "Missing food" bullet, after "and a grocery `section` (`meat-seafood`, `dairy-eggs`, `produce`, `pantry`)." add:

```
Give it a `role`: `protein` for meat, fish, eggs, Greek yogurt, cottage cheese and whey (never rescaled); `flex` for rice, potatoes, honey, butter, oils, cheese, cream and avocado (scaled when the check-in moves calories); `fixed` for everything else.
```

- [ ] **Step 7: Commit.**

```bash
git add content/foods.json app/content/schema.ts docs/runbooks/add-recipe.md tests/unit/content.test.ts
git commit -m "Every food is protein, flex or fixed"
```

---

### Task 2: Gram rescaling

**Files:**
- Modify: `app/domain/macros.ts`
- Create: `app/domain/rescale.ts`, `app/content/scaled.ts`
- Test: `tests/unit/domain/rescale.test.ts`, `tests/unit/scaled.test.ts`

- [ ] **Step 1: Write the failing domain test.** Create `tests/unit/domain/rescale.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { flexKcalPerDay, halfPortionKcal, rescaleFactor, scaleIngredient } from "~/domain/rescale";

const rice = { grams: 200, kcalPer100: 130, role: "flex" as const };
const chicken = { grams: 220, kcalPer100: 120, role: "protein" as const };

describe("flexKcalPerDay", () => {
  it("averages each slot's pool at recipe grams and adds the five slots, so main counts twice", () => {
    const meals = [
      { pool: "main" as const, ingredients: [chicken, rice] },
      { pool: "main" as const, ingredients: [chicken] },
      { pool: "breakfast" as const, ingredients: [{ grams: 10, kcalPer100: 700, role: "flex" as const }] },
    ];
    // breakfast 70 + lunch 130 + snack 0 + dinner 130 + dessert 0
    expect(flexKcalPerDay(meals)).toBeCloseTo(330);
  });
});

describe("rescaleFactor", () => {
  it("is 1 at the target the meals were written for", () => {
    expect(rescaleFactor(2400, 2400, 750)).toBe(1);
  });

  it("moves flex foods by the calorie change over the flex calories", () => {
    expect(rescaleFactor(2300, 2400, 750)).toBeCloseTo(1 - 100 / 750);
    expect(rescaleFactor(2600, 2400, 750)).toBeCloseTo(1 + 200 / 750);
  });

  it("stops at half and one and a half portions", () => {
    expect(rescaleFactor(1500, 2400, 750)).toBe(0.5);
    expect(rescaleFactor(3500, 2400, 750)).toBe(1.5);
  });
});

describe("halfPortionKcal", () => {
  it("is the target at half portions, rounded up to 50", () => {
    expect(halfPortionKcal(2400, 750)).toBe(2050);
  });
});

describe("scaleIngredient", () => {
  it("scales flex grams with portion rounding and leaves the rest", () => {
    const f = 1 - 100 / 750;
    expect(scaleIngredient(200, "flex", f)).toBe(175);
    expect(scaleIngredient(10, "flex", f)).toBe(9);
    expect(scaleIngredient(220, "protein", f)).toBe(220);
    expect(scaleIngredient(100, "fixed", f)).toBe(100);
    expect(scaleIngredient(22, "flex", 1)).toBe(22);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails.**

```bash
npx vitest run --project unit tests/unit/domain/rescale.test.ts
```

Expected: FAIL, "Failed to load url ~/domain/rescale".

- [ ] **Step 3: Pull the portion rounding out of `scaleGrams`.** In `app/domain/macros.ts`, replace `scaleGrams` with:

```ts
/** Portion rounding: to the nearest gram under 20 g, else to the nearest 5 g. */
export function roundGrams(g: number): number {
  return g < 20 ? Math.round(g) : Math.round(g / 5) * 5;
}

export function scaleGrams(gramsPerPortion: number, portions: number): number {
  return roundGrams(gramsPerPortion * portions);
}
```

- [ ] **Step 4: Write the domain module.** Create `app/domain/rescale.ts`:

```ts
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
```

- [ ] **Step 5: Run the domain test.** Same command as Step 2. Expected: PASS.

- [ ] **Step 6: Write the failing content test.** Create `tests/unit/scaled.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { foods, meals } from "~/content";
import { FLEX_KCAL_PER_DAY, HALF_PORTION_KCAL, factorFor, scaledMeal } from "~/content/scaled";

describe("scaled meals", () => {
  it("leaves every meal as written at 2,400", () => {
    expect(factorFor(2400)).toBe(1);
    for (const meal of meals.values()) expect(scaledMeal(meal, factorFor(2400))).toBe(meal);
  });

  it("averages about 750 flex calories a day, so half portions sit at 2,050", () => {
    expect(FLEX_KCAL_PER_DAY).toBeGreaterThan(700);
    expect(FLEX_KCAL_PER_DAY).toBeLessThan(800);
    expect(HALF_PORTION_KCAL).toBe(2050);
  });

  it("trims rice and butter but not chicken at 2,300, and recounts the meal", () => {
    const m = scaledMeal(meals.get("chicken-and-rice-bowl")!, factorFor(2300));
    expect(m.ingredients.map((i) => [i.food, i.grams])).toEqual([
      ["chicken-breast-raw", 220],
      ["white-rice-cooked", 175],
      ["butter", 9],
      ["pineapple", 100],
    ]);
    expect(m).toMatchObject({ kcal: 605, protein: 55 });
  });

  it("never changes a protein or fixed food, at any factor", () => {
    for (const factor of [0.5, 0.87, 1.5]) {
      for (const meal of meals.values()) {
        scaledMeal(meal, factor).ingredients.forEach((i, n) => {
          if (foods.get(i.food)!.role !== "flex") expect(i.grams, `${meal.slug} ${i.food}`).toBe(meal.ingredients[n].grams);
        });
      }
    }
  });
});
```

- [ ] **Step 7: Run it to make sure it fails.**

```bash
npx vitest run --project unit tests/unit/scaled.test.ts
```

Expected: FAIL, "Failed to load url ~/content/scaled".

- [ ] **Step 8: Bind the math to the content.** Create `app/content/scaled.ts`:

```ts
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
```

- [ ] **Step 9: Run both tests, and the macros test.**

```bash
npx vitest run --project unit tests/unit/scaled.test.ts tests/unit/domain/rescale.test.ts tests/unit/domain/macros.test.ts
```

Expected: PASS. If the 2,300 bowl test shows rice at 170 or 180, `FLEX_KCAL_PER_DAY` came out far from 750. Print it and check that Task 1 put the roles on the right foods. Don't change the expected grams.

- [ ] **Step 10: Commit.**

```bash
git add app/domain/macros.ts app/domain/rescale.ts app/content/scaled.ts tests/unit/domain/rescale.test.ts tests/unit/scaled.test.ts
git commit -m "Scale flex foods with the calorie target, protein fixed"
```

---

### Task 3: Trend weight

**Files:**
- Create: `app/domain/trend.ts`
- Test: `tests/unit/domain/trend.test.ts`

- [ ] **Step 1: Write the failing test.** Create `tests/unit/domain/trend.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { trendSeries, weeklyTrendChange } from "~/domain/trend";

describe("trendSeries", () => {
  it("starts at the first weigh-in and moves a tenth of the way toward each one", () => {
    const s = trendSeries([{ date: "2026-10-05", weight: 200 }, { date: "2026-10-06", weight: 210 }], "2026-10-06");
    expect(s.get("2026-10-05")).toBe(200);
    expect(s.get("2026-10-06")).toBeCloseTo(201);
  });

  it("carries the trend over days without a weigh-in", () => {
    const s = trendSeries([{ date: "2026-10-05", weight: 200 }, { date: "2026-10-08", weight: 190 }], "2026-10-09");
    expect(s.get("2026-10-06")).toBe(200);
    expect(s.get("2026-10-07")).toBe(200);
    expect(s.get("2026-10-08")).toBeCloseTo(199);
    expect(s.get("2026-10-09")).toBeCloseTo(199);
  });

  it("has nothing before the first weigh-in", () => {
    expect(trendSeries([], "2026-10-05").size).toBe(0);
    expect(trendSeries([{ date: "2026-10-05", weight: 200 }], "2026-10-04").size).toBe(0);
    expect(trendSeries([{ date: "2026-10-07", weight: 200 }], "2026-10-08").has("2026-10-06")).toBe(false);
  });
});

describe("weeklyTrendChange", () => {
  it("is this Sunday's trend minus last Sunday's, or null without both", () => {
    const s = new Map([["2026-10-18", 205.0], ["2026-10-25", 204.6]]);
    expect(weeklyTrendChange(s, "2026-10-25")).toBeCloseTo(-0.4);
    expect(weeklyTrendChange(s, "2026-10-18")).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to make sure it fails.**

```bash
npx vitest run --project unit tests/unit/domain/trend.test.ts
```

Expected: FAIL, "Failed to load url ~/domain/trend".

- [ ] **Step 3: Implement it.** Create `app/domain/trend.ts`:

```ts
import { addDays } from "./dates";
import type { ISODate } from "./types";

export const TREND_SMOOTHING = 0.1;

/**
 * The trend weight for every day from the first weigh-in through `to`. Each weigh-in pulls the trend a tenth of the way
 * toward it, and a day without one carries the trend over, so a salty day or a skipped weigh-in barely moves it.
 * Unrounded: round only for display.
 */
export function trendSeries(weighIns: { date: ISODate; weight: number }[], to: ISODate): Map<ISODate, number> {
  const byDate = new Map(weighIns.map((w) => [w.date, w.weight]));
  const first = [...byDate.keys()].sort()[0];
  const out = new Map<ISODate, number>();
  if (!first || first > to) return out;
  let trend = byDate.get(first)!;
  for (let d = first; d <= to; d = addDays(d, 1)) {
    const w = byDate.get(d);
    if (w !== undefined) trend += TREND_SMOOTHING * (w - trend);
    out.set(d, trend);
  }
  return out;
}

/** This Sunday's trend minus last Sunday's. Negative is a loss. */
export function weeklyTrendChange(series: Map<ISODate, number>, sunday: ISODate): number | null {
  const now = series.get(sunday);
  const before = series.get(addDays(sunday, -7));
  return now === undefined || before === undefined ? null : now - before;
}
```

- [ ] **Step 4: Run it.** Same command. Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add app/domain/trend.ts tests/unit/domain/trend.test.ts
git commit -m "Trend weight: a smoothed average that shrugs off one-day swings"
```

---

### Task 4: Day completeness

**Files:**
- Create: `app/domain/completeness.ts`
- Test: `tests/unit/domain/completeness.test.ts`

- [ ] **Step 1: Write the failing test.** Create `tests/unit/domain/completeness.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { dayCompleteness, dayIntake, isTracked } from "~/domain/completeness";
import { SLOTS } from "~/domain/types";

const planned = (slot: string, kcal = 500) => ({ slot, category: "planned", kcal });
const skipped = (slot: string) => ({ slot, category: "skipped", kcal: 0 });
const offPlan = (kcal = 900) => ({ slot: null, category: "meal", kcal });

describe("dayCompleteness", () => {
  it("is not tracked with nothing logged", () => {
    expect(dayCompleteness([])).toBe("untracked");
  });

  it("is complete when every slot is eaten or skipped", () => {
    expect(dayCompleteness(SLOTS.map((s) => planned(s)))).toBe("complete");
    expect(dayCompleteness([...SLOTS.slice(0, 4).map((s) => planned(s)), skipped("dessert")])).toBe("complete");
  });

  it("has estimates when every slot is resolved and something off-plan was logged", () => {
    expect(dayCompleteness([...SLOTS.map((s) => planned(s)), offPlan()])).toBe("estimates");
  });

  it("is partial while any slot is unresolved", () => {
    expect(dayCompleteness([planned("breakfast"), planned("lunch")])).toBe("partial");
    expect(dayCompleteness([offPlan()])).toBe("partial");
  });
});

describe("dayIntake", () => {
  it("adds up a tracked day and gives null for any other", () => {
    expect(dayIntake([...SLOTS.slice(0, 4).map((s) => planned(s)), skipped("dessert"), offPlan(100)])).toBe(2100);
    expect(dayIntake([planned("breakfast")])).toBeNull();
    expect(isTracked("estimates")).toBe(true);
    expect(isTracked("partial")).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails.**

```bash
npx vitest run --project unit tests/unit/domain/completeness.test.ts
```

Expected: FAIL, "Failed to load url ~/domain/completeness".

- [ ] **Step 3: Implement it.** Create `app/domain/completeness.ts`:

```ts
import { SLOTS } from "./types";

/** How fully a day was logged. The engine reads intake only from complete days and days with estimates. */
export type Completeness = "complete" | "estimates" | "partial" | "untracked";

export interface LogFacts {
  slot: string | null;
  category: string;
}

const resolves = (category: string) => category === "planned" || category === "skipped";

export function dayCompleteness(logs: LogFacts[]): Completeness {
  if (logs.length === 0) return "untracked";
  const resolved = new Set(logs.filter((l) => resolves(l.category)).map((l) => l.slot));
  if (!SLOTS.every((s) => resolved.has(s))) return "partial";
  // Every off-plan entry is somebody's estimate, a saved usual order included.
  return logs.some((l) => !resolves(l.category)) ? "estimates" : "complete";
}

export function isTracked(c: Completeness): boolean {
  return c === "complete" || c === "estimates";
}

/** A day's calories, or null when the day wasn't tracked in full. A half-logged day would read as a fast. */
export function dayIntake(logs: (LogFacts & { kcal: number })[]): number | null {
  return isTracked(dayCompleteness(logs)) ? logs.reduce((sum, l) => sum + l.kcal, 0) : null;
}
```

- [ ] **Step 4: Run it.** Same command. Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add app/domain/completeness.ts tests/unit/domain/completeness.test.ts
git commit -m "Day completeness: complete, has estimates, partial, not tracked"
```

---

### Task 5: The burn

**Files:**
- Create: `app/domain/energy.ts`
- Test: `tests/unit/domain/energy.test.ts`

The test feeds a straight-line trend (210 lb on Oct 5, falling 0.05 lb a day) so the expected numbers can be worked out by hand. Week 3's window runs Oct 5 to Oct 25. The trend falls 1.0 lb over the 20 days between its ends, so:
- observed = 2,400 + 3,500 × 1.0 / 20 = 2,575
- burn = 2,800 + 0.5 × (2,575 − 2,800) = 2,687.5, which rounds to 2,690

- [ ] **Step 1: Write the failing test.** Create `tests/unit/domain/energy.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { daysBetween } from "~/domain/dates";
import { energyHistory, type EnergyInput } from "~/domain/energy";

const PHASE = "2026-10-05";
const line = (d: string) => (d >= PHASE ? 210 - 0.05 * daysBetween(PHASE, d) : null);

function input(over: Partial<EnergyInput> = {}): EnergyInput {
  return { phaseStart: PHASE, through: "2026-10-19", priorBurn: 2800, intake: () => 2400, trend: line, weighedIn: (d) => d >= PHASE, ...over };
}

describe("energyHistory", () => {
  it("holds at the starting estimate until a full 21-day window exists", () => {
    const weeks = energyHistory(input());
    expect(weeks.map((w) => [w.weekStart, w.state, w.burn])).toEqual([
      ["2026-10-05", "holding", 2800],
      ["2026-10-12", "holding", 2800],
      ["2026-10-19", "settling", 2690],
    ]);
  });

  it("reads the burn from intake and the trend, moving halfway there", () => {
    const week3 = energyHistory(input()).at(-1)!;
    expect(week3.observed).toBeCloseTo(2575);
    expect(week3).toMatchObject({ intakeAvg: 2400, trackedDays: 7, windowTrackedDays: 21, weighIns: 21, updates: 1 });
    expect(week3.trendStart).toBeCloseTo(210);
    expect(week3.trendEnd).toBeCloseTo(209);
  });

  it("holds without 10 tracked days in the window, 4 in the week, or 8 weigh-ins", () => {
    const fewWindow = energyHistory(input({ intake: (d) => (d >= "2026-10-17" ? 2400 : null) })).at(-1)!;
    expect(fewWindow).toMatchObject({ state: "holding", burn: 2800, windowTrackedDays: 9 });
    const fewWeek = energyHistory(input({ intake: (d) => (d < "2026-10-19" || d >= "2026-10-23" ? 2400 : null) })).at(-1)!;
    expect(fewWeek).toMatchObject({ state: "holding", trackedDays: 3 });
    const fewWeighIns = energyHistory(input({ weighedIn: (d) => d >= "2026-10-19" && d <= "2026-10-25" })).at(-1)!;
    expect(fewWeighIns).toMatchObject({ state: "holding", weighIns: 7 });
  });

  it("moves the burn at most 250 a week", () => {
    expect(energyHistory(input({ intake: () => 4000 })).at(-1)!.burn).toBe(3050);
  });

  it("settles for four updates, then updates", () => {
    const weeks = energyHistory(input({ through: "2026-11-16" }));
    expect(weeks.map((w) => w.state)).toEqual(["holding", "holding", "settling", "settling", "settling", "settling", "updating"]);
    expect(weeks.at(-1)!.updates).toBe(5);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails.**

```bash
npx vitest run --project unit tests/unit/domain/energy.test.ts
```

Expected: FAIL, "Failed to load url ~/domain/energy".

- [ ] **Step 3: Implement it.** Create `app/domain/energy.ts`:

```ts
import { addDays } from "./dates";
import type { ISODate } from "./types";

export type BurnState = "settling" | "updating" | "holding";

export const KCAL_PER_LB = 3500;
const WINDOW_DAYS = 21;
const MIN_TRACKED_IN_WINDOW = 10;
const MIN_TRACKED_IN_WEEK = 4;
const MIN_WEIGH_INS = 8;
const SMOOTHING = 0.5;
const MAX_BURN_MOVE = 250;
const SETTLING_UPDATES = 4;

export interface EnergyInput {
  /** The Monday the phase began. */
  phaseStart: ISODate;
  /** The Monday of the last week to work out: the week under review. */
  through: ISODate;
  /** The burn before any week updates: the plan's starting estimate. */
  priorBurn: number;
  /** A tracked day's calories, or null for a day that wasn't tracked in full. */
  intake: (d: ISODate) => number | null;
  trend: (d: ISODate) => number | null;
  weighedIn: (d: ISODate) => boolean;
}

export interface EnergyWeek {
  weekStart: ISODate;
  /** kcal a day, rounded to 10. */
  burn: number;
  state: BurnState;
  /** Weeks that have updated so far, this one included. The fourth is the last that settles. */
  updates: number;
  observed: number | null;
  /** Average calories over the window's tracked days, rounded. */
  intakeAvg: number | null;
  /** Tracked days in this Monday-to-Sunday week. */
  trackedDays: number;
  windowTrackedDays: number;
  weighIns: number;
  trendStart: number | null;
  trendEnd: number | null;
}

/**
 * The burn, week by week from the phase start. Eating minus the energy the trend says was stored or lost is what was
 * burned. Each week moves halfway toward that and at most 250, so one odd week can't swing the targets. Nothing is
 * stored: the whole history is worked out again each time.
 */
export function energyHistory(input: EnergyInput): EnergyWeek[] {
  const out: EnergyWeek[] = [];
  let burn = input.priorBurn;
  let updates = 0;
  for (let monday = input.phaseStart; monday <= input.through; monday = addDays(monday, 7)) {
    const sunday = addDays(monday, 6);
    const start = addDays(sunday, -(WINDOW_DAYS - 1));
    const days = Array.from({ length: WINDOW_DAYS }, (_, i) => addDays(start, i));
    const tracked = days.flatMap((d) => {
      const kcal = input.intake(d);
      return kcal === null ? [] : [{ d, kcal }];
    });
    const trackedDays = tracked.filter((t) => t.d >= monday).length;
    const weighIns = days.filter(input.weighedIn).length;
    const trendStart = input.trend(start);
    const trendEnd = input.trend(sunday);
    const intakeAvg = tracked.length ? tracked.reduce((sum, t) => sum + t.kcal, 0) / tracked.length : null;

    const enough =
      start >= input.phaseStart &&
      tracked.length >= MIN_TRACKED_IN_WINDOW &&
      trackedDays >= MIN_TRACKED_IN_WEEK &&
      weighIns >= MIN_WEIGH_INS &&
      intakeAvg !== null &&
      trendStart !== null &&
      trendEnd !== null;
    let observed: number | null = null;
    if (enough) {
      observed = intakeAvg - (KCAL_PER_LB * (trendEnd - trendStart)) / (WINDOW_DAYS - 1);
      const move = Math.max(-MAX_BURN_MOVE, Math.min(MAX_BURN_MOVE, SMOOTHING * (observed - burn)));
      burn = Math.round((burn + move) / 10) * 10;
      updates++;
    }
    out.push({
      weekStart: monday,
      burn,
      state: !enough ? "holding" : updates <= SETTLING_UPDATES ? "settling" : "updating",
      updates,
      observed,
      intakeAvg: intakeAvg === null ? null : Math.round(intakeAvg),
      trackedDays,
      windowTrackedDays: tracked.length,
      weighIns,
      trendStart,
      trendEnd,
    });
  }
  return out;
}
```

- [ ] **Step 4: Run it.** Same command. Expected: PASS. If TypeScript narrows `intakeAvg` and the trends badly inside `if (enough)`, assert them with `!`. Don't restructure the conditions.

- [ ] **Step 5: Commit.**

```bash
git add app/domain/energy.ts tests/unit/domain/energy.test.ts
git commit -m "The burn: intake and trend weight, week by week, moving slowly"
```

---

### Task 6: The call

**Files:**
- Modify: `app/domain/energy.ts`
- Test: `tests/unit/domain/call.test.ts`

Worked numbers for the main case:
- At a trend of 205.6 lb, the goal is 0.5% = 1.028 lb a week, a deficit of 514 a day.
- A burn of 2,690 gives an ideal of 2,176, which rounds down to 2,150.
- While settling the move is capped at 100, so 2,400 becomes 2,300.

- [ ] **Step 1: Write the failing test.** Create `tests/unit/domain/call.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { nextTarget, type BurnState, type CallInput, type EnergyWeek } from "~/domain/energy";

const week = (burn: number, state: BurnState): EnergyWeek => ({
  weekStart: "2026-10-19", burn, state, updates: 1, observed: null, intakeAvg: 2380, trackedDays: 7, windowTrackedDays: 21, weighIns: 21, trendStart: 206, trendEnd: 205.6,
});

function input(over: Partial<CallInput> = {}): CallInput {
  return { week: week(2690, "settling"), trendWeight: 205.6, currentKcal: 2400, stepGoal: 8500, changes: [-0.4, -0.5], maintenanceNext: false, halfPortionKcal: 2050, ...over };
}

describe("nextTarget", () => {
  it("cuts toward burn minus 0.5% a week, 100 at a time while settling, with walking as the other pick", () => {
    const call = nextTarget(input());
    expect(call).toMatchObject({ kind: "cut", ideal: 2150, pick: "calories", guardrail: null, calories: { kcal: 2300, stepGoal: 8500 }, steps: { kcal: 2400, stepGoal: 9500 } });
    expect(call.goalLbPerWeek).toBeCloseTo(1.028);
  });

  it("moves up to 150 once settled", () => {
    expect(nextTarget(input({ week: week(2690, "updating") })).calories.kcal).toBe(2250);
  });

  it("holds on pace, with no walking pick", () => {
    expect(nextTarget(input({ week: week(2914, "updating"), trendWeight: 200 }))).toMatchObject({ kind: "on-pace", calories: { kcal: 2400 }, steps: null });
  });

  it("raises toward the ideal when the burn is higher", () => {
    expect(nextTarget(input({ week: week(3100, "settling"), trendWeight: 200 }))).toMatchObject({ kind: "raise", calories: { kcal: 2500 }, steps: null });
  });

  it("never cuts after two weeks of losing more than 2 lb", () => {
    expect(nextTarget(input({ changes: [-2.2, -2.5] }))).toMatchObject({ kind: "hold", guardrail: "fast-loss", calories: { kcal: 2400 }, steps: null });
  });

  it("stops at the 2,000 floor", () => {
    const call = nextTarget(input({ week: week(2400, "updating"), trendWeight: 200, currentKcal: 2050, halfPortionKcal: 1500 }));
    expect(call).toMatchObject({ kind: "cut", guardrail: "floor", calories: { kcal: 2000 } });
  });

  it("turns a cut past half portions into steps, and makes steps Rocky's pick", () => {
    const call = nextTarget(input({ week: week(2400, "updating"), trendWeight: 200, currentKcal: 2100 }));
    expect(call).toMatchObject({ kind: "cut", guardrail: "half-portions", pick: "steps", calories: { kcal: 2050 }, steps: { kcal: 2100, stepGoal: 9500 } });
  });

  it("holds at half portions when steps are already at 10,000", () => {
    const call = nextTarget(input({ week: week(2400, "updating"), trendWeight: 200, currentKcal: 2050, stepGoal: 10000 }));
    expect(call).toMatchObject({ kind: "hold", guardrail: "half-portions", pick: "calories", calories: { kcal: 2050, stepGoal: 10000 }, steps: null });
  });

  it("holds while the burn is holding", () => {
    expect(nextTarget(input({ week: week(2800, "holding") }))).toMatchObject({ kind: "hold", ideal: null, calories: { kcal: 2400 }, steps: null });
  });

  it("eats at the burn in a maintenance week and keeps the base", () => {
    expect(nextTarget(input({ maintenanceNext: true }))).toMatchObject({ kind: "maintenance", maintenanceKcal: 2700, calories: { kcal: 2400 }, steps: null });
  });
});
```

- [ ] **Step 2: Run it to make sure it fails.**

```bash
npx vitest run --project unit tests/unit/domain/call.test.ts
```

Expected: FAIL, "nextTarget is not a function" or a missing export.

- [ ] **Step 3: Implement it.** Append to `app/domain/energy.ts`, and add `import { STEP_CAP } from "./steps";` to its imports:

```ts
export const KCAL_FLOOR = 2000;
/** The goal pace: 0.5% of trend weight a week. */
export const GOAL_RATE = 0.005;
const STEP_BUMP = 1000;

export interface CallInput {
  week: EnergyWeek;
  trendWeight: number;
  /** The base calorie target now. */
  currentKcal: number;
  /** Next week's step goal, after v1's ramp. */
  stepGoal: number;
  /** This week's and last week's trend change in lb. Negative is a loss. */
  changes: [number | null, number | null];
  maintenanceNext: boolean;
  /** The lowest target that keeps flex foods at half portions (HALF_PORTION_KCAL). */
  halfPortionKcal: number;
}

export type CallKind = "hold" | "cut" | "raise" | "on-pace" | "maintenance";
export type Guardrail = "fast-loss" | "floor" | "half-portions";

export interface CallOption {
  kcal: number;
  stepGoal: number;
}

export interface Call {
  kind: CallKind;
  /** Burn minus the goal deficit, rounded down to 50, so it never asks for a surplus. Null when holding. */
  ideal: number | null;
  goalLbPerWeek: number;
  guardrail: Guardrail | null;
  /** Rocky's calorie move. On a hold it keeps today's numbers. */
  calories: CallOption;
  /** Keep the calories and walk 1,000 more. Only offered with a cut, or at half portions, while steps are under 10,000. */
  steps: CallOption | null;
  pick: "calories" | "steps";
  /** What the maintenance week eats. The base target stays as it is. */
  maintenanceKcal: number | null;
}

const floor50 = (n: number) => Math.floor(n / 50) * 50;

export function nextTarget(input: CallInput): Call {
  const { week, currentKcal, stepGoal } = input;
  const goalLbPerWeek = GOAL_RATE * input.trendWeight;
  const keep: CallOption = { kcal: currentKcal, stepGoal };
  const base = { goalLbPerWeek, guardrail: null, calories: keep, steps: null, pick: "calories" as const, maintenanceKcal: null };
  if (input.maintenanceNext) return { ...base, kind: "maintenance", ideal: null, maintenanceKcal: Math.round(week.burn / 50) * 50 };
  if (week.state === "holding") return { ...base, kind: "hold", ideal: null };

  const ideal = floor50(week.burn - (goalLbPerWeek * KCAL_PER_LB) / 7);
  const cap = week.state === "settling" ? 100 : 150;
  let kcal = currentKcal + Math.max(-cap, Math.min(cap, ideal - currentKcal));
  let guardrail: Guardrail | null = null;

  const [thisWeek, lastWeek] = input.changes;
  if (kcal < currentKcal && thisWeek !== null && lastWeek !== null && thisWeek < -2 && lastWeek < -2) {
    kcal = currentKcal;
    guardrail = "fast-loss";
  }
  if (kcal < KCAL_FLOOR) {
    kcal = KCAL_FLOOR;
    guardrail = "floor";
  }
  const walkMore = stepGoal < STEP_CAP ? { kcal: currentKcal, stepGoal: Math.min(stepGoal + STEP_BUMP, STEP_CAP) } : null;
  let pick: Call["pick"] = "calories";
  if (kcal < input.halfPortionKcal) {
    // Past half portions the food can't give more, so the rest of the cut comes from walking.
    kcal = Math.min(currentKcal, input.halfPortionKcal);
    guardrail = "half-portions";
    if (walkMore) pick = "steps";
  }

  const kind: CallKind = kcal < currentKcal ? "cut" : kcal > currentKcal ? "raise" : guardrail ? "hold" : "on-pace";
  const steps = kcal < currentKcal || guardrail === "half-portions" ? walkMore : null;
  return { ...base, kind, ideal, guardrail, calories: { kcal, stepGoal }, steps, pick };
}
```

- [ ] **Step 4: Run it.** Same command. Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add app/domain/energy.ts tests/unit/domain/call.test.ts
git commit -m "The call: burn minus 0.5% a week, small moves, v1's guardrails"
```

---

### Task 7: Schema, registry and the migrations

**Files:**
- Modify: `app/db/schema.ts`, `app/sync/tables.ts`
- Create: `drizzle/0008_nutrition_data.sql` (generated), `drizzle/0009_nutrition_sync.sql` (custom)
- Modify: `tests/unit/sync/tables.test.ts`, `tests/workers/schema.test.ts`

- [ ] **Step 1: Change the schema.** In `app/db/schema.ts`:

1. In `batches`, add after `portionsLeft`:

```ts
  /** Made on the phone, so a batch can be started offline. v1 rows have none and sync as `id:<id>`. */
  clientId: text("client_id").unique(),
  /** The gram factor the batch was cooked at, so its portions keep their grams after a check-in. */
  factor: real("factor").notNull().default(1),
```

2. In `checkIns`, add after `completedAt`:

```ts
  /** The engine's burn estimate that week, and whether it was settling, updating or holding. Null on v1 rows. */
  burn: integer("burn"),
  burnState: text("burn_state"),
  intakeAvg: integer("intake_avg"),
  trackedDays: integer("tracked_days"),
```

3. Add a table at the end:

```ts
/** An off-plan order saved for one-tap logging, such as a usual restaurant meal. */
export const usualOrders = sqliteTable("usual_orders", {
  clientId: text("client_id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  kcal: integer("kcal").notNull(),
  proteinG: integer("protein_g").notNull(),
  relaxed: bool("relaxed").notNull().default(false),
  uses: integer("uses").notNull().default(0),
  lastUsedAt: text("last_used_at"),
  createdAt: text("created_at").notNull(),
});
```

- [ ] **Step 2: Generate the migration.**

```bash
npx drizzle-kit generate --name=nutrition_data
```

Expected: `drizzle/0008_nutrition_data.sql`, plus a snapshot and a journal entry. Read the SQL. It should hold only:
- `ALTER TABLE` adds: two on `batches`, four on `check_ins`.
- `CREATE TABLE usual_orders`.
- `CREATE UNIQUE INDEX batches_client_id_unique`.

If it rebuilds `batches` instead (`__new_batches`), delete any `PRAGMA foreign_keys` lines, as W1 did. The triggers for `batches` are recreated in 0009 either way.

- [ ] **Step 3: Update the sync registry** in `app/sync/tables.ts`:

1. Change `{ name: "batches", ...byId },` to `{ name: "batches", ...byClientId },`.
2. Add `{ name: "usual_orders", ...cols("client_id") },` after `exercise_notes`.
3. Change `export const SYNC_SCHEMA = 2;` to `export const SYNC_SCHEMA = 3;`.

- [ ] **Step 4: Create the custom migration** with the triggers and the seeded usual orders.

```bash
npx drizzle-kit generate --custom --name=nutrition_sync
npx tsx scripts/gen-sync-triggers.ts batches usual_orders > drizzle/0009_nutrition_sync.sql
cat >> drizzle/0009_nutrition_sync.sql <<'SQL'
--> statement-breakpoint
INSERT INTO usual_orders (client_id, name, category, kcal, protein_g, relaxed, uses, created_at) VALUES
  ('usual-restaurant-meal', 'Restaurant meal', 'meal', 900, 50, 1, 0, '2026-10-27T00:00:00.000Z'),
  ('usual-ranch-water', 'Ranch Water', 'drink', 100, 0, 0, 0, '2026-10-27T00:00:00.000Z')
ON CONFLICT (client_id) DO NOTHING;
SQL
```

Expected: the first command makes an empty `drizzle/0009_nutrition_sync.sql` and a journal entry, which the next two fill. The script drops and recreates the `batches` triggers with the new key, and adds `usual_orders`. The seeds come after the triggers, so they're logged too.

- [ ] **Step 5: Update the two table-list tests.**

1. In `tests/unit/sync/tables.test.ts`, change `toHaveLength(19)` to `toHaveLength(20)`, and the test name to "syncs the 20 personal tables and nothing server-only". Add to the first test:

```ts
    expect(keyOf("batches", { id: 4, client_id: null })).toBe("id:4");
    expect(keyOf("batches", { id: 4, client_id: "b-1" })).toBe("b-1");
    expect(keyOf("usual_orders", { client_id: "usual-ranch-water" })).toBe("usual-ranch-water");
```

2. In `tests/workers/schema.test.ts`, add `"usual_orders"` to the table list, between `"targets"` and `"vitals"`.

- [ ] **Step 6: Typecheck, and run the tests that touch the schema.**

```bash
npm run typecheck
npx vitest run --project unit tests/unit/sync/tables.test.ts tests/unit/sync/store.test.ts
npx vitest run --project workers tests/workers/schema.test.ts tests/workers/sync-triggers.test.ts tests/workers/meals.test.ts tests/workers/sync-pull.test.ts
```

Expected: all PASS. The store test uses `SYNC_SCHEMA - 1`, so it still covers the bump.

- [ ] **Step 7: Commit.**

```bash
git add app/db/schema.ts app/sync/tables.ts drizzle tests/unit/sync/tables.test.ts tests/workers/schema.test.ts
git commit -m "Batches can start on the phone; usual orders; the check-in's engine columns"
```

---

### Task 8: Prove the migration keeps v1 batches

**Files:**
- Test: `tests/workers/nutrition-migration.test.ts`, `tests/workers/sync-triggers.test.ts`

- [ ] **Step 1: Write the test.** Create `tests/workers/nutrition-migration.test.ts`:

```ts
import { applyD1Migrations, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("the N1 migration", () => {
  it("keeps every v1 batch at factor 1, and seeds the two usual orders", async () => {
    const d1 = env.MIGRATION_TEST;
    const split = env.TEST_MIGRATIONS.findIndex((m) => m.name.startsWith("0008"));
    await applyD1Migrations(d1, env.TEST_MIGRATIONS.slice(0, split));
    await d1
      .prepare("INSERT INTO batches (id, meal_slug, portions, cooked_weight_g, portion_g, created_on, portions_left) VALUES (7, 'chicken-and-rice-bowl', 3, 495, 165, '2026-10-26', 2)")
      .run();

    await applyD1Migrations(d1, env.TEST_MIGRATIONS);

    expect(await d1.prepare("SELECT id, client_id, factor, portions_left FROM batches").all().then((r) => r.results)).toEqual([{ id: 7, client_id: null, factor: 1, portions_left: 2 }]);
    expect(await d1.prepare("SELECT client_id, kcal, relaxed, uses FROM usual_orders ORDER BY client_id").all().then((r) => r.results)).toEqual([
      { client_id: "usual-ranch-water", kcal: 100, relaxed: 0, uses: 0 },
      { client_id: "usual-restaurant-meal", kcal: 900, relaxed: 1, uses: 0 },
    ]);
  });
});
```

- [ ] **Step 2: Run it.**

```bash
npx vitest run --project workers tests/workers/nutrition-migration.test.ts
```

Expected: PASS. If a statement fails, fix it in `0008` or `0009`. The test exists to run the real SQL against old data.

- [ ] **Step 3: Add a trigger test.** In `tests/workers/sync-triggers.test.ts`, add:

```ts
  it("keys batches by their phone id and logs usual orders", async () => {
    await env.DB.prepare("INSERT INTO batches (client_id, meal_slug, portions, cooked_weight_g, portion_g, created_on, portions_left, factor) VALUES ('b-t', 'chicken-and-rice-bowl', 2, 400, 200, '2026-10-27', 2, 1)").run();
    await env.DB.prepare("INSERT INTO usual_orders (client_id, name, category, kcal, protein_g, relaxed, uses, created_at) VALUES ('u-t', 'Quest bar', 'snack', 190, 21, 0, 0, '2026-10-27T00:00:00Z')").run();
    expect((await changes()).slice(-2)).toEqual([
      { table_name: "batches", row_key: "b-t", op: "put" },
      { table_name: "usual_orders", row_key: "u-t", op: "put" },
    ]);
  });
```

Run `npx vitest run --project workers tests/workers/sync-triggers.test.ts`. Expected: PASS.

- [ ] **Step 4: Commit.**

```bash
git add tests/workers/nutrition-migration.test.ts tests/workers/sync-triggers.test.ts
git commit -m "Prove the nutrition migration keeps v1 batches and the new triggers log"
```

---

### Task 9: The meal named changes

**Files:**
- Modify: `app/sync/mutators.ts`
- Test: `tests/unit/sync/meal-mutators.test.ts`

- [ ] **Step 1: Write the failing tests.** Create `tests/unit/sync/meal-mutators.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { meals } from "~/content";
import { factorFor, scaledMeal } from "~/content/scaled";
import { runMutation, type MutationContext } from "~/sync/mutators";
import { MemoryTx } from "~/sync/tx";

const ctx: MutationContext = { now: "2026-10-27T17:00:00.000Z", today: "2026-10-27" };
const run = (tx: MemoryTx, name: string, args: unknown, c = ctx) => runMutation(tx, name, args, c);
const BOWL = "chicken-and-rice-bowl";
const STEAK = "steak-and-baked-potato";
const THIGHS = "honey-glazed-chicken-thighs";
const ICE_CREAM = "protein-ice-cream";
const bowl = meals.get(BOWL)!;

/** A phone holding a 2,300 target from this Monday. */
function trimmed() {
  const tx = new MemoryTx(new Map());
  tx.put("targets", { effective_from: "2026-10-26", kcal: 2300, protein_g: 180, step_goal: 8500 });
  return tx;
}

const logs = async (tx: MemoryTx, date: string) => (await tx.scan("meal_logs")).filter((l) => l.date === date);

describe("meal mutators", () => {
  it("logs a meal at the day's grams", async () => {
    const tx = trimmed();
    await run(tx, "logMeal", { clientId: "m-1", date: "2026-10-27", slot: "lunch", mealSlug: BOWL });
    const want = scaledMeal(bowl, factorFor(2300));
    expect(want.kcal).toBeLessThan(bowl.kcal);
    expect(await tx.get("meal_logs", "m-1")).toMatchObject({ category: "planned", kcal: want.kcal, protein_g: want.protein });
  });

  it("logs a batch portion at the grams it was cooked at", async () => {
    const tx = trimmed();
    tx.put("batches", { client_id: "b-1", meal_slug: BOWL, portions: 3, cooked_weight_g: 495, portion_g: 165, created_on: "2026-10-26", portions_left: 2, factor: 1 });
    await run(tx, "logMeal", { clientId: "m-1", date: "2026-10-27", slot: "lunch", mealSlug: BOWL });
    expect(await tx.get("meal_logs", "m-1")).toMatchObject({ kcal: bowl.kcal, protein_g: bowl.protein });
    expect(await tx.get("batches", "b-1")).toMatchObject({ portions_left: 1 });
  });

  it("skips a meal once, and undoing removes the skip", async () => {
    const tx = trimmed();
    await run(tx, "skipMeal", { clientId: "s-1", date: "2026-10-27", slot: "lunch", mealSlug: BOWL });
    expect(await tx.get("meal_logs", "s-1")).toMatchObject({ slot: "lunch", meal_slug: null, name: bowl.name, category: "skipped", kcal: 0, protein_g: 0 });
    await expect(run(tx, "skipMeal", { clientId: "s-2", date: "2026-10-27", slot: "lunch", mealSlug: BOWL })).rejects.toThrow("already marked");
    await run(tx, "logMeal", { clientId: "m-1", date: "2026-10-27", slot: "lunch", mealSlug: BOWL });
    expect(await logs(tx, "2026-10-27")).toHaveLength(1);
    await run(tx, "unlogMeal", { key: "s-1" });
    expect(await logs(tx, "2026-10-27")).toHaveLength(0);
  });

  it("closes out a day, eating some and skipping others, and leaves marked slots alone", async () => {
    const tx = trimmed();
    await run(tx, "logMeal", { clientId: "m-1", date: "2026-10-27", slot: "lunch", mealSlug: BOWL });
    await run(tx, "closeOutDay", {
      date: "2026-10-27",
      eaten: [{ clientId: "c-1", slot: "lunch", mealSlug: BOWL }, { clientId: "c-2", slot: "dinner", mealSlug: THIGHS }],
      skipped: [{ clientId: "c-3", slot: "dessert", mealSlug: ICE_CREAM }],
    });
    const day = await logs(tx, "2026-10-27");
    expect(day.map((l) => [l.slot, l.category]).sort()).toEqual([["dessert", "skipped"], ["dinner", "planned"], ["lunch", "planned"]]);
    expect(await tx.get("meal_logs", "c-1")).toBeNull();
  });

  it("closes out up to 2 days back, and no further", async () => {
    const tx = trimmed();
    await run(tx, "closeOutDay", { date: "2026-10-25", eaten: [{ clientId: "c-1", slot: "dinner", mealSlug: THIGHS }], skipped: [] });
    await expect(run(tx, "closeOutDay", { date: "2026-10-24", eaten: [], skipped: [] })).rejects.toThrow("too long ago");
  });

  it("swaps a meal for today, and with always rests the old one for 4 weeks, keeping its photo", async () => {
    const tx = trimmed();
    tx.put("planned_meals", { date: "2026-10-27", slot: "lunch", meal_slug: BOWL, swapped: 0 });
    tx.put("meal_state", { slug: BOWL, photo_key: "meals/bowl.jpg", rested_until: null });
    await run(tx, "swapMeal", { date: "2026-10-27", slot: "lunch", mealSlug: STEAK, always: true });
    expect(await tx.get("planned_meals", "2026-10-27|lunch")).toMatchObject({ meal_slug: STEAK, swapped: 1 });
    expect(await tx.get("meal_state", BOWL)).toEqual({ slug: BOWL, photo_key: "meals/bowl.jpg", rested_until: "2026-11-24" });
  });

  it("refuses a swap that doesn't fit the slot, or a slot already eaten", async () => {
    const tx = trimmed();
    await expect(run(tx, "swapMeal", { date: "2026-10-27", slot: "lunch", mealSlug: ICE_CREAM, always: false })).rejects.toThrow("doesn't fit");
    await run(tx, "logMeal", { clientId: "m-1", date: "2026-10-27", slot: "lunch", mealSlug: BOWL });
    await expect(run(tx, "swapMeal", { date: "2026-10-27", slot: "lunch", mealSlug: STEAK, always: false })).rejects.toThrow("already eaten");
  });

  it("starts a batch at the day's factor and plans the same slot on the next days", async () => {
    const tx = trimmed();
    await run(tx, "startBatch", { clientId: "b-2", date: "2026-10-27", slot: "lunch", mealSlug: BOWL, portions: 3, cookedWeightG: 495 });
    expect(await tx.get("batches", "b-2")).toMatchObject({ meal_slug: BOWL, portions: 3, portion_g: 165, portions_left: 3, created_on: "2026-10-27", factor: factorFor(2300) });
    expect(await tx.get("planned_meals", "2026-10-28|lunch")).toMatchObject({ meal_slug: BOWL, swapped: 1 });
    expect(await tx.get("planned_meals", "2026-10-29|lunch")).toMatchObject({ meal_slug: BOWL, swapped: 1 });
  });

  it("leaves a marked slot and next week alone when batching", async () => {
    const sat = { now: "2026-10-31T17:00:00.000Z", today: "2026-10-31" };
    const tx = trimmed();
    await run(tx, "skipMeal", { clientId: "s-1", date: "2026-11-01", slot: "lunch", mealSlug: BOWL }, sat);
    await run(tx, "startBatch", { clientId: "b-3", date: "2026-10-31", slot: "lunch", mealSlug: BOWL, portions: 3, cookedWeightG: 495 }, sat);
    expect(await tx.get("planned_meals", "2026-11-01|lunch")).toBeNull();
    expect(await tx.get("planned_meals", "2026-11-02|lunch")).toBeNull();
  });
});
```

- [ ] **Step 2: Run them to make sure they fail.**

```bash
npx vitest run --project unit tests/unit/sync/meal-mutators.test.ts
```

Expected: the first test FAILS (kcal is the unscaled number), and the rest fail with "Unknown change".

- [ ] **Step 3: Add the shared pieces.** In `app/sync/mutators.ts`:

1. Extend the imports:

```ts
import { factorFor, scaledMeal } from "~/content/scaled";
import { resolveTargets } from "~/content/targets";
import { batchPortion } from "~/domain/macros";
import { swapFits } from "~/domain/next-week";
import type { RotationMeal } from "~/domain/rotation";
import { CUSTOM_WORKOUT, SLOTS, type Slot } from "~/domain/types";
import { keyOf, type Row } from "./tables";
```

Merge these with the existing `~/domain/types` and `./tables` imports. Don't duplicate them. `addDays`, `daysBetween` and `weekStart` are already imported from `~/domain/dates`.

2. Add these helpers above `const defs = {`:

```ts
const slot = z.enum(SLOTS as [string, ...string[]]);
const mealSlug = z.string().min(1);

const rotationMeals = (): RotationMeal[] => [...meals.values()].map((m) => ({ slug: m.slug, pool: m.pool, mode: m.mode, tags: m.tags }));

/** The gram factor for a date's calorie target, from the targets this copy holds. */
async function dayFactor(tx: Tx, date: string): Promise<number> {
  const rows = (await tx.scan("targets"))
    .map((r) => ({ effectiveFrom: r.effective_from as string, kcal: r.kcal as number, proteinG: r.protein_g as number, stepGoal: r.step_goal as number }))
    .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  return factorFor(resolveTargets(rows, date).kcal);
}

/** Same rule as openBatch in meals.server.ts: the newest batch of this meal with portions left, cooked up to 3 days ago. */
async function openBatchRow(tx: Tx, slug: string, date: string): Promise<Row | undefined> {
  // A batch started on this phone has no id until the server numbers it, so it sorts as the newest.
  const order = (b: Row) => (b.id as number | undefined) ?? Number.MAX_SAFE_INTEGER;
  return (await tx.scan("batches"))
    .filter((b) => b.meal_slug === slug && (b.portions_left as number) > 0 && (b.created_on as string) >= addDays(date, -3) && (b.created_on as string) <= date)
    .sort((x, y) => (y.created_on as string).localeCompare(x.created_on as string) || order(y) - order(x))[0];
}

/** A slot is resolved once it is eaten or skipped. */
async function slotResolved(tx: Tx, date: string, s: string): Promise<boolean> {
  return (await tx.scan("meal_logs")).some((l) => l.date === date && l.slot === s && (l.category === "planned" || l.category === "skipped"));
}

async function restedOn(tx: Tx, date: string): Promise<string[]> {
  return (await tx.scan("meal_state")).filter((r) => typeof r.rested_until === "string" && (r.rested_until as string) >= date).map((r) => r.slug as string);
}

/** "Ate it": logs the planned meal at the day's grams, or at its batch's, and uses up a batch portion. */
async function eatPlanned(tx: Tx, a: { clientId: string; date: string; slot: string; mealSlug: string }, ctx: MutationContext): Promise<void> {
  const raw = meals.get(a.mealSlug);
  if (!raw) throw new MutationRejected("That meal isn't in the library.");
  if (await slotResolved(tx, a.date, a.slot)) return;
  const batch = await openBatchRow(tx, raw.slug, a.date);
  const meal = scaledMeal(raw, batch ? ((batch.factor as number | undefined) ?? 1) : await dayFactor(tx, a.date));
  tx.put("meal_logs", {
    client_id: a.clientId,
    date: a.date,
    slot: a.slot,
    meal_slug: meal.slug,
    name: meal.name,
    category: "planned",
    kcal: meal.kcal,
    protein_g: meal.protein,
    relaxed: 0,
    portions: 1,
    logged_at: ctx.now,
  });
  if (batch) tx.put("batches", { ...batch, portions_left: (batch.portions_left as number) - 1 });
}

/** A skipped meal: nothing eaten, but the slot is answered, so the day can count as tracked. */
function putSkipped(tx: Tx, a: { clientId: string; date: string; slot: string; mealSlug: string }, ctx: MutationContext): void {
  tx.put("meal_logs", {
    client_id: a.clientId,
    date: a.date,
    slot: a.slot,
    // No slug, so the rotation and the check-in's repeat counts never take a skip for a meal eaten.
    meal_slug: null,
    name: meals.get(a.mealSlug)?.name ?? a.slot,
    category: "skipped",
    kcal: 0,
    protein_g: 0,
    relaxed: 0,
    portions: 1,
    logged_at: ctx.now,
  });
}

const closeOutEntry = z.object({ clientId, slot, mealSlug });
```

- [ ] **Step 4: Replace `logMeal` and add the four meal changes.** In `defs`, replace the whole `logMeal` entry with:

```ts
  logMeal: {
    args: z.object({ clientId, date, slot, mealSlug }),
    async run(tx: Tx, a: { clientId: string; date: string; slot: string; mealSlug: string }, ctx: MutationContext) {
      notFuture(a.date, ctx);
      await eatPlanned(tx, a, ctx);
    },
  },
  skipMeal: {
    args: z.object({ clientId, date, slot, mealSlug }),
    async run(tx: Tx, a: { clientId: string; date: string; slot: string; mealSlug: string }, ctx: MutationContext) {
      notFuture(a.date, ctx);
      if (await slotResolved(tx, a.date, a.slot)) throw new MutationRejected("That meal is already marked.");
      putSkipped(tx, a, ctx);
    },
  },
  closeOutDay: {
    args: z.object({ date, eaten: z.array(closeOutEntry).max(5), skipped: z.array(closeOutEntry).max(5) }),
    async run(tx: Tx, a: { date: string; eaten: z.infer<typeof closeOutEntry>[]; skipped: z.infer<typeof closeOutEntry>[] }, ctx: MutationContext) {
      notFuture(a.date, ctx);
      // Yesterday, or the day before it while the 3am rule still files late meals under it.
      if (daysBetween(a.date, ctx.today) > 2) throw new MutationRejected("That day is too long ago to close out.");
      for (const e of a.eaten) await eatPlanned(tx, { ...e, date: a.date }, ctx);
      for (const e of a.skipped) if (!(await slotResolved(tx, a.date, e.slot))) putSkipped(tx, { ...e, date: a.date }, ctx);
    },
  },
  swapMeal: {
    args: z.object({ date, slot, mealSlug, always: z.boolean() }),
    async run(tx: Tx, a: { date: string; slot: string; mealSlug: string; always: boolean }, ctx: MutationContext) {
      notFuture(a.date, ctx);
      if (!swapFits({ date: a.date, slot: a.slot as Slot, slug: a.mealSlug }, rotationMeals(), await restedOn(tx, a.date))) {
        throw new MutationRejected("That meal doesn't fit this slot.");
      }
      if ((await tx.scan("meal_logs")).some((l) => l.date === a.date && l.slot === a.slot && l.category === "planned")) {
        throw new MutationRejected("That meal is already eaten.");
      }
      const current = await tx.get("planned_meals", `${a.date}|${a.slot}`);
      tx.put("planned_meals", { date: a.date, slot: a.slot, meal_slug: a.mealSlug, swapped: 1 });
      if (a.always && current && current.meal_slug !== a.mealSlug) {
        const old = current.meal_slug as string;
        const state = await tx.get("meal_state", old);
        tx.put("meal_state", { slug: old, photo_key: (state?.photo_key as string | null | undefined) ?? null, rested_until: addDays(ctx.today, 28) });
      }
    },
  },
  startBatch: {
    args: z.object({ clientId, date, slot, mealSlug, portions: z.union([z.literal(2), z.literal(3)]), cookedWeightG: z.number().int().min(1).max(10_000) }),
    async run(tx: Tx, a: { clientId: string; date: string; slot: string; mealSlug: string; portions: number; cookedWeightG: number }, ctx: MutationContext) {
      notFuture(a.date, ctx);
      const meal = meals.get(a.mealSlug);
      if (!meal) throw new MutationRejected("That meal isn't in the library.");
      tx.put("batches", {
        client_id: a.clientId,
        meal_slug: meal.slug,
        portions: a.portions,
        cooked_weight_g: a.cookedWeightG,
        portion_g: batchPortion(a.cookedWeightG, a.portions),
        created_on: a.date,
        portions_left: a.portions,
        factor: await dayFactor(tx, a.date),
      });
      // The next days of the batch eat it too. Only this week: a row in next week would stop its plan being generated.
      const sunday = addDays(weekStart(a.date), 6);
      for (let i = 1; i < a.portions; i++) {
        const d = addDays(a.date, i);
        if (d > sunday || (await slotResolved(tx, d, a.slot))) continue;
        // Resting doesn't matter here: it's already cooked.
        if (!swapFits({ date: d, slot: a.slot as Slot, slug: meal.slug }, rotationMeals(), [])) continue;
        tx.put("planned_meals", { date: d, slot: a.slot, meal_slug: meal.slug, swapped: 1 });
      }
    },
  },
```

- [ ] **Step 5: Label them.** In `MUTATION_LABELS`, add after `unlogMeal`:

```ts
  skipMeal: "Skipped meal",
  closeOutDay: "Close-out",
  swapMeal: "Meal swap",
  startBatch: "Batch",
```

- [ ] **Step 6: Run the meal tests and the older mutator tests.**

```bash
npx vitest run --project unit tests/unit/sync/meal-mutators.test.ts tests/unit/sync/mutators.test.ts tests/unit/sync/workout-mutators.test.ts
```

Expected: PASS. The older `logMeal` test still passes: with no targets row the factor is 1, and its batch has no `factor`, which reads as 1.

- [ ] **Step 7: Commit.**

```bash
git add app/sync/mutators.ts tests/unit/sync/meal-mutators.test.ts
git commit -m "Meal changes on the phone: scaled logging, skip, close out, swap, batch"
```

---

### Task 10: Usual orders

**Files:**
- Modify: `app/sync/mutators.ts`
- Test: `tests/unit/sync/meal-mutators.test.ts`

- [ ] **Step 1: Write the failing tests.** Add a second `describe` to `tests/unit/sync/meal-mutators.test.ts`:

```ts
describe("usual orders", () => {
  const order = { date: "2026-10-27", name: "Chipotle bowl, double chicken", category: "meal", kcal: 1050, proteinG: 75, relaxed: true };

  it("saves an off-plan entry as a usual, then logs it in one tap", async () => {
    const tx = trimmed();
    await run(tx, "logOffPlan", { clientId: "o-1", ...order, usualId: "u-1" });
    expect(await tx.get("usual_orders", "u-1")).toEqual({
      client_id: "u-1", name: order.name, category: "meal", kcal: 1050, protein_g: 75, relaxed: 1, uses: 1, last_used_at: ctx.now, created_at: ctx.now,
    });
    const later = { now: "2026-10-28T01:00:00.000Z", today: "2026-10-27" };
    await run(tx, "logUsual", { clientId: "o-2", usual: "u-1", date: "2026-10-27" }, later);
    expect(await tx.get("meal_logs", "o-2")).toMatchObject({ slot: null, meal_slug: null, name: order.name, category: "meal", kcal: 1050, protein_g: 75, relaxed: 1 });
    expect(await tx.get("usual_orders", "u-1")).toMatchObject({ uses: 2, last_used_at: later.now });
  });

  it("logs off-plan without saving a usual by default", async () => {
    const tx = trimmed();
    await run(tx, "logOffPlan", { clientId: "o-1", ...order });
    expect(await tx.scan("usual_orders")).toEqual([]);
  });

  it("refuses an unknown usual, and removes one", async () => {
    const tx = trimmed();
    await expect(run(tx, "logUsual", { clientId: "o-1", usual: "nope", date: "2026-10-27" })).rejects.toThrow("isn't saved");
    await run(tx, "logOffPlan", { clientId: "o-1", ...order, usualId: "u-1" });
    await run(tx, "removeUsual", { key: "u-1" });
    expect(await tx.get("usual_orders", "u-1")).toBeNull();
  });
});
```

- [ ] **Step 2: Run them to make sure they fail.**

```bash
npx vitest run --project unit tests/unit/sync/meal-mutators.test.ts
```

Expected: the usual-order tests FAIL. `logOffPlan` refuses the unknown key `usualId`, or ignores it, and `logUsual` is an unknown change.

- [ ] **Step 3: Implement them.** In `app/sync/mutators.ts`:

1. Replace the whole `logOffPlan` entry with:

```ts
  logOffPlan: {
    args: z.object({
      clientId,
      date,
      name: z.string().trim().min(1).max(80),
      category: z.enum(["meal", "snack", "dessert", "drink"]),
      kcal: z.number().int().min(0).max(5000),
      proteinG: z.number().int().min(0).max(400),
      relaxed: z.boolean(),
      /** Also save it as a usual order under this phone-made key. */
      usualId: clientId.optional(),
    }),
    async run(
      tx: Tx,
      a: { clientId: string; date: string; name: string; category: string; kcal: number; proteinG: number; relaxed: boolean; usualId?: string },
      ctx: MutationContext,
    ) {
      notFuture(a.date, ctx);
      putOffPlan(tx, { clientId: a.clientId, date: a.date, name: a.name, category: a.category, kcal: a.kcal, protein_g: a.proteinG, relaxed: a.relaxed ? 1 : 0 }, ctx);
      if (a.usualId) {
        tx.put("usual_orders", {
          client_id: a.usualId,
          name: a.name,
          category: a.category,
          kcal: a.kcal,
          protein_g: a.proteinG,
          relaxed: a.relaxed ? 1 : 0,
          uses: 1,
          last_used_at: ctx.now,
          created_at: ctx.now,
        });
      }
    },
  },
  logUsual: {
    args: z.object({ clientId, usual: key, date }),
    async run(tx: Tx, a: { clientId: string; usual: string; date: string }, ctx: MutationContext) {
      notFuture(a.date, ctx);
      const u = await tx.get("usual_orders", a.usual);
      if (!u) throw new MutationRejected("That usual order isn't saved.");
      putOffPlan(tx, { clientId: a.clientId, date: a.date, name: u.name as string, category: u.category as string, kcal: u.kcal as number, protein_g: u.protein_g as number, relaxed: u.relaxed as number }, ctx);
      tx.put("usual_orders", { ...u, uses: ((u.uses as number | undefined) ?? 0) + 1, last_used_at: ctx.now });
    },
  },
  removeUsual: {
    args: z.object({ key }),
    async run(tx: Tx, a: { key: string }) {
      tx.delete("usual_orders", a.key);
    },
  },
```

2. Add this helper next to `putSkipped`:

```ts
function putOffPlan(
  tx: Tx,
  e: { clientId: string; date: string; name: string; category: string; kcal: number; protein_g: number; relaxed: number },
  ctx: MutationContext,
): void {
  tx.put("meal_logs", {
    client_id: e.clientId,
    date: e.date,
    slot: null,
    meal_slug: null,
    name: e.name,
    category: e.category,
    kcal: e.kcal,
    protein_g: e.protein_g,
    relaxed: e.relaxed,
    portions: 1,
    logged_at: ctx.now,
  });
}
```

3. Add to `MUTATION_LABELS`, after `deleteOffPlan`:

```ts
  logUsual: "Usual order",
  removeUsual: "Usual order removal",
```

- [ ] **Step 4: Run the mutator tests.**

```bash
npx vitest run --project unit tests/unit/sync/meal-mutators.test.ts tests/unit/sync/mutators.test.ts
```

Expected: PASS. The older off-plan test still matches `{ name, slot: null, relaxed: 0 }`.

- [ ] **Step 5: Commit.**

```bash
git add app/sync/mutators.ts tests/unit/sync/meal-mutators.test.ts
git commit -m "Usual orders: save any off-plan entry, log it again in one tap"
```

---

### Task 11: The server applies them

**Files:**
- Test: `tests/workers/sync-push.test.ts`

No server code should need to change. The `ServerTx` upsert already handles a `client_id` table and numbers a new row. This task proves it.

- [ ] **Step 1: Write the tests.** Add to `tests/workers/sync-push.test.ts`, inside the `describe`:

```ts
  // November dates, so nothing the other push tests logged in October is already in the way.
  it("starts a batch from the phone, numbers it, and eats from it the same day", async () => {
    const tue = new Date("2026-11-03T18:00:00Z");
    const res = await processPush(
      env.DB,
      {
        clientId: "phone-batch",
        mutations: [
          { id: 1, name: "startBatch", args: { clientId: "b-push", date: "2026-11-03", slot: "lunch", mealSlug: "chicken-and-rice-bowl", portions: 3, cookedWeightG: 495 } },
          { id: 2, name: "logMeal", args: { clientId: "m-push", date: "2026-11-03", slot: "lunch", mealSlug: "chicken-and-rice-bowl" } },
        ],
      },
      tue,
    );
    expect(res.rejected).toEqual([]);
    const batch = await env.DB.prepare("SELECT id, portion_g, portions_left, factor FROM batches WHERE client_id = 'b-push'").first<{ id: number }>();
    expect(batch).toMatchObject({ portion_g: 165, portions_left: 2, factor: 1 });
    expect(batch!.id).toBeGreaterThan(0);
    expect(await env.DB.prepare("SELECT meal_slug, swapped FROM planned_meals WHERE date = '2026-11-04' AND slot = 'lunch'").first()).toEqual({ meal_slug: "chicken-and-rice-bowl", swapped: 1 });
  });

  it("logs a seeded usual order and counts the use", async () => {
    const res = await processPush(env.DB, { clientId: "phone-usual", mutations: [{ id: 1, name: "logUsual", args: { clientId: "o-push", usual: "usual-ranch-water", date: "2026-10-27" } }] }, now);
    expect(res.rejected).toEqual([]);
    expect(await env.DB.prepare("SELECT name, kcal, category FROM meal_logs WHERE client_id = 'o-push'").first()).toEqual({ name: "Ranch Water", kcal: 100, category: "drink" });
    expect(await env.DB.prepare("SELECT uses FROM usual_orders WHERE client_id = 'usual-ranch-water'").first()).toEqual({ uses: 1 });
  });

  it("closes out a day on the server, skipping what the phone skipped", async () => {
    const res = await processPush(
      env.DB,
      {
        clientId: "phone-close",
        mutations: [{ id: 1, name: "closeOutDay", args: { date: "2026-11-09", eaten: [{ clientId: "c-push-1", slot: "dinner", mealSlug: "honey-glazed-chicken-thighs" }], skipped: [{ clientId: "c-push-2", slot: "dessert", mealSlug: "protein-ice-cream" }] } }],
      },
      new Date("2026-11-10T18:00:00Z"),
    );
    expect(res.rejected).toEqual([]);
    expect((await env.DB.prepare("SELECT slot, category, kcal FROM meal_logs WHERE client_id LIKE 'c-push-%' ORDER BY slot").all()).results).toEqual([
      { slot: "dessert", category: "skipped", kcal: 0 },
      { slot: "dinner", category: "planned", kcal: meals.get("honey-glazed-chicken-thighs")!.kcal },
    ]);
  });
```

- [ ] **Step 2: Run them.**

```bash
npx vitest run --project workers tests/workers/sync-push.test.ts
```

Expected: PASS. If the batch test is rejected with "It clashes with something already saved.", the `ServerTx` upsert is matching on `id` for a row that has none. Check that `startBatch` doesn't put an `id` key at all (not even `id: undefined`), and leave `server-tx.server.ts` as it is.

- [ ] **Step 3: Commit.**

```bash
git add tests/workers/sync-push.test.ts
git commit -m "Prove batches, usual orders and the close-out apply on the server"
```

---

### Task 12: The v1 writers log scaled meals

**Files:**
- Modify: `app/server/meals.server.ts`
- Test: `tests/workers/meals.test.ts`

- [ ] **Step 1: Write the failing test.** Add to the `batches` describe in `tests/workers/meals.test.ts`. Add these imports: `import { factorFor, scaledMeal } from "~/content/scaled";` and `import { setTargetsFrom } from "~/server/targets.server";`:

```ts
  it("logs at the day's grams, and a batch keeps the grams it was cooked at", async () => {
    const meal = meals.get("chicken-and-rice-bowl")!;
    const trimmed = scaledMeal(meal, factorFor(2300));
    await setTargetsFrom(db(), "2026-11-02", { kcal: 2300, proteinG: 180, stepGoal: 7000 });
    await logPlannedMeal(db(), "2026-11-02", "lunch", meal, new Date());
    expect((await logsForDate(db(), "2026-11-02"))[0]).toMatchObject({ kcal: trimmed.kcal, proteinG: trimmed.protein });

    const batch = await createBatch(db(), meal.slug, 3, 495, "2026-11-03");
    expect(batch.clientId).toMatch(/.+/);
    expect(batch.factor).toBeCloseTo(factorFor(2300));
    await setTargetsFrom(db(), "2026-11-04", { kcal: 2400, proteinG: 180, stepGoal: 7000 });
    await logPlannedMeal(db(), "2026-11-04", "lunch", meal, new Date());
    expect((await logsForDate(db(), "2026-11-04"))[0]).toMatchObject({ kcal: trimmed.kcal });
  });
```

- [ ] **Step 2: Run it to make sure it fails.**

```bash
npx vitest run --project workers tests/workers/meals.test.ts
```

Expected: FAIL, with the logged kcal equal to `meal.kcal`.

- [ ] **Step 3: Implement it.** In `app/server/meals.server.ts`:

1. Change the content import to `import { foods, meals, type MealWithMacros } from "~/content";`, and add:

```ts
import { factorFor, scaledMeal } from "~/content/scaled";
import { targetsFor } from "./targets.server";
```

2. Replace `logPlannedMeal` with:

```ts
export async function logPlannedMeal(db: Db, date: ISODate, slot: Slot, meal: MealWithMacros, now: Date, clientId?: string): Promise<number | null> {
  // Same snapshot as the logMeal change: the day's grams, or the grams its batch was cooked at.
  const batch = await openBatch(db, meal.slug, date);
  const factor = batch ? batch.factor : factorFor((await targetsFor(db, date)).kcal);
  const scaled = scaledMeal(meals.get(meal.slug) ?? meal, factor);
  const rows = await db
    .insert(mealLogs)
    .values({ date, slot, mealSlug: scaled.slug, name: scaled.name, category: "planned", kcal: scaled.kcal, proteinG: scaled.protein, loggedAt: now.toISOString(), clientId: clientId ?? null })
    .onConflictDoNothing()
    .returning({ id: mealLogs.id });
  if (rows.length === 0) return null;
  if (batch) await db.update(batches).set({ portionsLeft: batch.portionsLeft - 1 }).where(eq(batches.id, batch.id));
  return rows[0].id;
}
```

3. In `createBatch`, change the `.values({ ... })` to:

```ts
    .values({
      mealSlug,
      portions,
      cookedWeightG,
      portionG: batchPortion(cookedWeightG, portions),
      createdOn: date,
      portionsLeft: portions,
      clientId: crypto.randomUUID(),
      factor: factorFor((await targetsFor(db, date)).kcal),
    })
```

- [ ] **Step 4: Run the meal tests and the tests that log meals.**

```bash
npx vitest run --project workers tests/workers/meals.test.ts tests/workers/idempotency.test.ts tests/workers/day.test.ts tests/workers/checkin.test.ts tests/workers/meal-route.test.ts
```

Expected: PASS. The other tests run at 2,400, where the factor is 1.

- [ ] **Step 5: Commit.**

```bash
git add app/server/meals.server.ts tests/workers/meals.test.ts
git commit -m "The v1 meal screen logs and batches at the scaled grams too"
```

---

### Task 13: Every reader shows scaled meals and passes over skips

**Files:**
- Modify: `app/today/model.ts`, `app/server/day.server.ts`, `app/routes/meal.tsx`, `app/routes/library.tsx`, `app/server/groceries.server.ts`
- Test: `tests/unit/today/model.test.ts`, `tests/workers/day.test.ts`, `tests/workers/meal-route.test.ts`, `tests/workers/groceries.test.ts`

- [ ] **Step 1: Write the failing Today tests.** Add to `tests/unit/today/model.test.ts`, inside the `describe`. Add `import { factorFor, scaledMeal } from "~/content/scaled";`:

```ts
  it("shows the day's meals at the trimmed grams after a cut", () => {
    const targets: Row[] = [{ effective_from: "2026-10-26", kcal: 2300, protein_g: 180, step_goal: 8500 }];
    const m = asPlan(buildToday(rowsOf({ planned_meals: planned(WED), targets }), at(WED, "08:00"), true));
    for (const s of m.slots) expect(s.meal).toEqual(scaledMeal(meals.get(SLUGS[s.slot])!, factorFor(2300)));
  });

  it("leaves a skipped meal out of the off-plan list and the counted day", () => {
    const skip: Row = { id: 5, client_id: null, date: WED, slot: "lunch", meal_slug: null, name: "Lunch", category: "skipped", kcal: 0, protein_g: 0, relaxed: 0, portions: 1, logged_at: `${WED}T19:00:00Z` };
    const m = asPlan(buildToday(rowsOf({ planned_meals: planned(WED), meal_logs: [skip] }), at(WED, "20:00"), true));
    expect(m.offPlan).toEqual([]);
    expect(m.week.find((d) => d.today)!.counted).toBe(false);
  });
```

- [ ] **Step 2: Run them to make sure they fail.**

```bash
npx vitest run --project unit tests/unit/today/model.test.ts
```

Expected: both FAIL. The meals are unscaled, and the skip shows as off-plan and counts the day.

- [ ] **Step 3: Scale Today and pass over skips.** In `app/today/model.ts`:

1. Add `import { factorFor, scaledMeal } from "~/content/scaled";`.
2. Change `const mealDates = new Set(mealLogs.map((r) => s(r, "date")));` to:

```ts
  // A skip answers the slot but isn't a meal, so it doesn't make a day count.
  const mealDates = new Set(mealLogs.filter((r) => r.category !== "skipped").map((r) => s(r, "date")));
```

3. After the `const targets = resolveTargets(...)` statement, add `const factor = factorFor(targets.kcal);`.
4. In `base`, change the `meal:` property to `meal: scaledMeal(meals.get(plannedBySlot.get(slot) ?? "") ?? fallbackMeal(slot, date, rested), factor),`.
5. Change the `offPlan` filter to `.filter((l) => l.category !== "planned" && l.category !== "skipped")`.
6. In the returned object, change `countedLine`'s fourth argument:

```ts
    countedLine: countedLine(activity(date), weighIn?.time ?? null, firstMealName(todayLogs), relaxed),
```

and add this helper above `buildToday`:

```ts
const firstMealName = (logs: Row[]): string | null => {
  const first = logs.find((l) => l.category !== "skipped");
  return first ? s(first, "name") : null;
};
```

- [ ] **Step 4: Run the Today tests.** Same command as Step 2. Expected: PASS, the existing tests included.

- [ ] **Step 5: Write the failing server tests.**

1. Add to `tests/workers/day.test.ts`, as a new `describe` at the end. Add imports: `import { factorFor, scaledMeal } from "~/content/scaled";`, `import { mealLogs } from "~/db/schema";`, `import { setTargetsFrom } from "~/server/targets.server";`. Add `mealLogs` to the existing `~/db/schema` import rather than importing it twice:

```ts
describe("loadDay at a trimmed target", () => {
  it("shows trimmed grams and leaves skipped meals out of off-plan", async () => {
    await setTargetsFrom(db(), "2026-11-02", { kcal: 2300, proteinG: 180, stepGoal: 7000 });
    await db().insert(mealLogs).values({ date: "2026-11-03", slot: "dinner", mealSlug: null, name: "Dinner", category: "skipped", kcal: 0, proteinG: 0, loggedAt: "2026-11-04T01:00:00Z" });
    const day = await loadDay(db(), "2026-11-03", new Date("2026-11-03T18:00:00Z"));
    for (const s of day.slots) expect(s.meal).toEqual(scaledMeal(meals.get(s.meal.slug)!, factorFor(2300)));
    expect(day.offPlan).toEqual([]);
  });
});
```

2. Add to `tests/workers/meal-route.test.ts`, inside its `describe`. Add imports: `import { meals } from "~/content";`, `import { factorFor, scaledMeal } from "~/content/scaled";`, `import { setTargetsFrom } from "~/server/targets.server";`:

```ts
  it("shows the meal at today's trimmed grams", async () => {
    await setTargetsFrom(db(), mealDate(), { kcal: 2300, proteinG: 180, stepGoal: 7000 });
    const data = await loader(routeArgs(new Request("http://localhost/meal/chicken-and-rice-bowl"), { slug: "chicken-and-rice-bowl" }));
    const want = scaledMeal(meals.get("chicken-and-rice-bowl")!, factorFor(2300));
    expect(data.meal.kcal).toBe(want.kcal);
    expect(data.ingredients.find((i) => i.food === "white-rice-cooked")?.grams).toBe(175);
  });
```

3. Create `tests/workers/groceries.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { groceryList, type GroceryList } from "~/server/groceries.server";
import { setTargetsFrom } from "~/server/targets.server";
import { db } from "./helpers";

const grams = (l: GroceryList, foodId: string) => l.groups.flatMap((g) => g.items).find((i) => i.foodId === foodId)?.grams ?? 0;

describe("grocery list", () => {
  it("lists the week at the trimmed grams, with protein unchanged", async () => {
    const monday = "2026-11-09";
    const before = await groceryList(db(), monday, monday, { rest: null, swaps: [] });
    await setTargetsFrom(db(), monday, { kcal: 2300, proteinG: 180, stepGoal: 7000 });
    const after = await groceryList(db(), monday, monday, { rest: null, swaps: [] });
    expect(grams(before, "white-rice-cooked")).toBeGreaterThan(0);
    expect(grams(after, "white-rice-cooked")).toBeLessThan(grams(before, "white-rice-cooked"));
    for (const id of ["chicken-breast-raw", "sirloin-raw", "egg-whole"]) expect(grams(after, id), id).toBe(grams(before, id));
  });
});
```

- [ ] **Step 6: Run them to make sure they fail.**

```bash
npx vitest run --project workers tests/workers/day.test.ts tests/workers/meal-route.test.ts tests/workers/groceries.test.ts
```

Expected: the three new tests FAIL, with unscaled numbers. The day test also fails on the skip showing in `offPlan`.

- [ ] **Step 7: Scale the server readers.**

1. **`app/server/day.server.ts`**: add `import { factorFor, scaledMeal } from "~/content/scaled";`. In `loadDay`:
    - Add `const factor = factorFor(targets.kcal);` after the `Promise.all`.
    - In `slotViews`, change `meal: s.meal,` to `meal: scaledMeal(s.meal, factor),`.
    - Change `const offPlan = logs.filter((l) => l.category !== "planned");` to `const offPlan = logs.filter((l) => l.category !== "planned" && l.category !== "skipped");`.

2. **`app/routes/meal.tsx`** loader: add `import { factorFor, scaledMeal } from "~/content/scaled";`.
    - Rename the first line's variable: `const raw = meals.get(params.slug); if (!raw) throw new Response("Not found", { status: 404 });`.
    - After the `Promise.all`, add:

```ts
  const factor = factorFor(day.targets.kcal);
  // A portion from a batch shows the grams it was cooked at.
  const meal = scaledMeal(raw, batch?.factor ?? factor);
```

    - `openBatch` and `mealState` take `raw.slug` in the `Promise.all`; everything after keeps using `meal`.
    - In `swapOptions`, map each option through the factor: add `.map((m) => scaledMeal(m, factor))` before the `.filter(...)`.

3. **`app/routes/library.tsx`** loader: add `import { factorFor, scaledMeal } from "~/content/scaled";` and `import { targetsFor } from "~/server/targets.server";`.
    - Add `targetsFor(db, today)` to the `Promise.all`, making it `const [state, overrides, targets] = await Promise.all([..., targetsFor(db, today)]);`. Move `const today = localDate(serverNow());` above the `Promise.all`.
    - Add `const factor = factorFor(targets.kcal);`.
    - In the meals `.map((m) => {`, start with `const scaled = scaledMeal(m, factor);` and return `kcal: scaled.kcal, protein: scaled.protein`.

4. **`app/server/groceries.server.ts`**: add `import { factorFor, scaledMeal } from "~/content/scaled";` and `import { targetsFor } from "./targets.server";`. Replace the `const ingredients = ...` line with:

```ts
  // One factor for the week: targets change on Mondays.
  const factor = factorFor((await targetsFor(db, monday)).kcal);
  const ingredients = new Map([...meals.values()].map((m) => [m.slug, scaledMeal(m, factor).ingredients.map((i) => ({ foodId: i.food, grams: i.grams }))]));
```

- [ ] **Step 8: Run the server tests and the route tests that read meals.**

```bash
npm run typecheck
npx vitest run --project workers tests/workers/day.test.ts tests/workers/meal-route.test.ts tests/workers/groceries.test.ts tests/workers/checkin-route.test.ts tests/workers/progress-route.test.ts
```

Expected: PASS. If `meal-route.test.ts`'s new test sees 200 g rice, an open batch from an earlier test in that file is supplying factor 1. Use another meal with rice and no batch in the file, such as `honey-glazed-chicken-thighs` (rice 200 → 175).

- [ ] **Step 9: Commit.**

```bash
git add app/today/model.ts app/server/day.server.ts app/routes/meal.tsx app/routes/library.tsx app/server/groceries.server.ts tests/unit/today/model.test.ts tests/workers/day.test.ts tests/workers/meal-route.test.ts tests/workers/groceries.test.ts
git commit -m "Today, the meal screen, the Library and groceries show scaled meals; skips stay out of off-plan"
```

---

### Task 14: Full suite, PR, migrations, and the wire

- [ ] **Step 1: Run everything once.**

```bash
npm run typecheck && npm test
```

Expected: all PASS. If something fails, fix it and run only that file. Don't rerun the whole suite.

- [ ] **Step 2: Push and open the PR.**

```bash
git push -u origin v2/n1-nutrition-data
gh pr create --base main --title "Rocky v2 N1: nutrition data, rules and named changes" --body-file - <<'MD'
Project 3, rollout step N1 (`docs/superpowers/specs/2026-10-27-nutrition-design.md`). Nothing on screen changes: the target is still 2,400, so every gram factor is 1.

- Food roles, and gram rescaling (`app/domain/rescale.ts`, `app/content/scaled.ts`). Protein never moves.
- The engine's math, pure and not wired yet: trend weight, day completeness, the burn, the call.
- Batches can start on the phone (`client_id`, `factor`, new sync key, `SYNC_SCHEMA` 3); usual orders, seeded with v1's two presets; the check-in's engine columns.
- Meal changes: scaled `logMeal`, `skipMeal`, `closeOutDay`, `swapMeal`, `startBatch`, usual orders.
- Today, the v1 meal screen, the Library and groceries read scaled meals; skips stay out of off-plan and the counted day.

Calls made in the plan, for review: see "Calls made in this plan" in `docs/superpowers/plans/2026-10-27-n1-nutrition-data.md`.

After merge, Kameron runs `npm run db:migrate:remote` (0008 and 0009, both person databases).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
MD
```

- [ ] **Step 3: Hand over the remote migrations.** After review and merge, Kameron runs:

```bash
npm run db:migrate:remote
```

Expected: `0008_nutrition_data` and `0009_nutrition_sync` apply to `rocky-db` and `rocky-db-catherine`. Core has nothing new.

- [ ] **Step 4: On the wire (Kameron's iPhone, after the deploy and the migrations).**
- Open the app. It takes one full snapshot (`SYNC_SCHEMA` 3). Today's meals show the same grams and calories as before the deploy.
- Tap "Ate it" on a meal in airplane mode. Reconnect, and confirm in D1 that the `meal_logs` row's `kcal` matches the meal's v1 number:

```bash
npx wrangler d1 execute rocky-db --remote --command "SELECT date, slot, name, kcal, protein_g FROM meal_logs ORDER BY id DESC LIMIT 3"
```

- Confirm the two usual orders are in both person databases:

```bash
npx wrangler d1 execute rocky-db --remote --command "SELECT client_id, uses FROM usual_orders"
npx wrangler d1 execute rocky-db-catherine --remote --command "SELECT client_id, uses FROM usual_orders"
```
