# M3: Today and Meals Implementation Plan

> **For agentic workers:** implement this plan task-by-task with the `executing-plans` skill. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The daily loop works: the week's meal plan is generated, Today shows rings, Rocky's message, the workout card, meals, and the minimum viable day; meals open to the portion toggle and scale amounts, can be eaten, batch cooked, swapped, and photographed; off-plan food and the weigh-in are logged.

**Architecture:** Server modules under `app/server/` own all D1 access and return plain view data; routes stay thin (loader calls a module, action dispatches on an `intent` field). Domain rules from M2 do the math. Every server function takes `db` and an explicit date or `now` so tests control time.

**Tech Stack:** As M1. Tests in the `workers` project call server modules and route loaders/actions directly.

**Prerequisite:** M1 and M2 complete.

**Visual reference:** the approved mockups (https://claude.ai/artifact/WRiVyTVMD7GoJkGSqkoedQ), boards "Today" and "Meal". Kameron runs `/design-loop` on these screens after the build; match the mockups closely now.

---

## File map

| Path | Responsibility |
|---|---|
| `app/server/targets.server.ts` | Daily targets per date (base row + maintenance week) |
| `app/server/meal-plan.server.ts` | Week plan generation, planned slots, swaps, resting |
| `app/server/meals.server.ts` | Meal logs, off-plan logs, batches, main protein |
| `app/server/body.server.ts` | Weigh-ins, waist, steps |
| `app/server/history.server.ts` | Per-day results (on plan or not) over a date range |
| `app/server/day.server.ts` | Everything Today needs, in one call |
| `app/server/photos.server.ts` | Meal photo upload to R2 |
| `app/routes/media.tsx` | Authenticated R2 file route |
| `app/routes/today.tsx` | Today screen (replaces the placeholder) |
| `app/routes/meal.tsx` | Meal screen |
| `app/components/Rings.tsx`, `MealRow.tsx`, `Sheet.tsx`, `Segmented.tsx`, `MealPhoto.tsx` | UI pieces |
| `tests/workers/helpers.ts` | Shared test helpers |
| `tests/workers/*.test.ts` | Tests per module |

---

### Task 1: Targets and test helpers

**Files:**
- Create: `app/server/targets.server.ts`, `tests/workers/helpers.ts`
- Test: `tests/workers/targets.test.ts`

- [ ] **Step 1: Test helpers**

```ts
// tests/workers/helpers.ts
import { env } from "cloudflare:test";
import { getDb } from "~/db/client";

export const db = () => getDb(env.DB);

/** Build a Date for a Chicago wall-clock time (CDT, UTC-5, valid for Oct 2026 tests). */
export function chicago(date: string, hhmm: string): Date {
  return new Date(`${date}T${hhmm}:00-05:00`);
}

export const routeArgs = (request: Request, params: Record<string, string> = {}) => ({ request, params, context: {} }) as any;

export function post(url: string, fields: Record<string, string | Blob>): Request {
  const body = new FormData();
  for (const [k, v] of Object.entries(fields)) body.set(k, v);
  return new Request(url, { method: "POST", body });
}
```

- [ ] **Step 2: Write the failing test**

```ts
// tests/workers/targets.test.ts
import { describe, expect, it } from "vitest";
import { targets } from "~/db/schema";
import { targetsFor } from "~/server/targets.server";
import { db } from "./helpers";

describe("targetsFor", () => {
  it("starts from the plan's starting targets", async () => {
    expect(await targetsFor(db(), "2026-10-12")).toEqual({ kcal: 2400, proteinG: 180, stepGoal: 7000 });
  });

  it("uses the latest row effective on or before the date", async () => {
    await db().insert(targets).values([
      { effectiveFrom: "2026-10-19", kcal: 2400, proteinG: 180, stepGoal: 7500 },
      { effectiveFrom: "2026-11-02", kcal: 2250, proteinG: 180, stepGoal: 8000 },
    ]);
    expect(await targetsFor(db(), "2026-10-25")).toEqual({ kcal: 2400, proteinG: 180, stepGoal: 7500 });
    expect(await targetsFor(db(), "2026-11-05")).toEqual({ kcal: 2250, proteinG: 180, stepGoal: 8000 });
  });

  it("eats at maintenance in the maintenance week", async () => {
    expect((await targetsFor(db(), "2026-12-22")).kcal).toBe(2800);
  });
});
```

- [ ] **Step 3: Run it to make sure it fails**

Run: `npx vitest run --project workers tests/workers/targets.test.ts`
Expected: FAIL, cannot resolve `~/server/targets.server`.

- [ ] **Step 4: Implement**

```ts
// app/server/targets.server.ts
import { asc } from "drizzle-orm";
import { plan } from "~/content";
import type { Db } from "~/db/client";
import { targets } from "~/db/schema";
import { weekType } from "~/domain/calendar";
import type { ISODate } from "~/domain/types";

export interface Targets {
  kcal: number;
  proteinG: number;
  stepGoal: number;
}

export type TargetRow = typeof targets.$inferSelect;

export function allTargets(db: Db): Promise<TargetRow[]> {
  return db.select().from(targets).orderBy(asc(targets.effectiveFrom)).all();
}

/** rows must be sorted by effectiveFrom ascending. */
export function resolveTargets(rows: TargetRow[], date: ISODate): Targets {
  let base: Targets = { ...plan.startingTargets };
  for (const r of rows) {
    if (r.effectiveFrom > date) break;
    base = { kcal: r.kcal, proteinG: r.proteinG, stepGoal: r.stepGoal };
  }
  const kcal = weekType(plan, date) === "maintenance" ? plan.maintenanceKcal : base.kcal;
  return { ...base, kcal };
}

export async function targetsFor(db: Db, date: ISODate): Promise<Targets> {
  return resolveTargets(await allTargets(db), date);
}
```

- [ ] **Step 5: Run the test and make sure it passes**

Run: `npx vitest run --project workers tests/workers/targets.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Add daily targets resolution"
```

---

### Task 2: Week meal plan

**Files:**
- Create: `app/server/meal-plan.server.ts`
- Test: `tests/workers/meal-plan.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/workers/meal-plan.test.ts
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { mealState, plannedMeals } from "~/db/schema";
import { ensureWeekPlan, plannedForDate, restMeal, swapPlanned } from "~/server/meal-plan.server";
import { db } from "./helpers";

describe("meal plan", () => {
  it("generates the week once with 35 slots", async () => {
    await ensureWeekPlan(db(), "2026-10-12");
    await ensureWeekPlan(db(), "2026-10-12");
    const rows = await db().select().from(plannedMeals).all();
    expect(rows.filter((r) => r.date >= "2026-10-12" && r.date <= "2026-10-18")).toHaveLength(35);
  });

  it("returns a day's slots in order, generating the week on demand", async () => {
    const slots = await plannedForDate(db(), "2026-10-21");
    expect(slots.map((s) => s.slot)).toEqual(["breakfast", "lunch", "snack", "dinner", "dessert"]);
    expect(slots.every((s) => s.meal.name.length > 0)).toBe(true);
  });

  it("swaps one slot for today only", async () => {
    await swapPlanned(db(), "2026-10-21", "dessert", "baked-cinnamon-apple", false, "2026-10-21");
    const slots = await plannedForDate(db(), "2026-10-21");
    const dessert = slots.find((s) => s.slot === "dessert")!;
    expect(dessert.meal.slug).toBe("baked-cinnamon-apple");
    expect(dessert.swapped).toBe(true);
  });

  it("rests the original for 4 weeks on an always swap", async () => {
    const before = (await plannedForDate(db(), "2026-10-22")).find((s) => s.slot === "breakfast")!;
    const replacement = before.meal.slug === "steak-and-eggs" ? "greek-yogurt-power-bowl" : "steak-and-eggs";
    await swapPlanned(db(), "2026-10-22", "breakfast", replacement, true, "2026-10-22");
    const state = await db().select().from(mealState).where(eq(mealState.slug, before.meal.slug)).get();
    expect(state?.restedUntil).toBe("2026-11-19");
  });

  it("never plans a rested meal in a new week", async () => {
    await restMeal(db(), "chicken-and-rice-bowl", "2026-11-30");
    await ensureWeekPlan(db(), "2026-11-02");
    const rows = await db().select().from(plannedMeals).all();
    const week = rows.filter((r) => r.date >= "2026-11-02" && r.date <= "2026-11-08");
    expect(week.map((r) => r.mealSlug)).not.toContain("chicken-and-rice-bowl");
  });

  it("repicks a slot whose meal file no longer exists", async () => {
    await ensureWeekPlan(db(), "2026-11-09");
    await db().update(plannedMeals).set({ mealSlug: "deleted-meal" }).where(eq(plannedMeals.date, "2026-11-10"));
    const slots = await plannedForDate(db(), "2026-11-10");
    expect(slots.every((s) => s.meal.slug !== "deleted-meal")).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run --project workers tests/workers/meal-plan.test.ts`
Expected: FAIL, cannot resolve `~/server/meal-plan.server`.

- [ ] **Step 3: Implement**

```ts
// app/server/meal-plan.server.ts
import { and, between, eq, gte, isNotNull, lt, max } from "drizzle-orm";
import { meals, type MealWithMacros } from "~/content";
import type { Db } from "~/db/client";
import { mealLogs, mealState, plannedMeals } from "~/db/schema";
import { dayMode } from "~/domain/calendar";
import { addDays, weekStart } from "~/domain/dates";
import { generateWeek, type RotationMeal } from "~/domain/rotation";
import { SLOTS, slotPool, type ISODate, type Slot } from "~/domain/types";

export interface PlannedSlot {
  date: ISODate;
  slot: Slot;
  meal: MealWithMacros;
  swapped: boolean;
}

function rotationMeals(): RotationMeal[] {
  return [...meals.values()].map((m) => ({ slug: m.slug, pool: m.pool, mode: m.mode, tags: m.tags }));
}

export async function restedSlugs(db: Db, date: ISODate): Promise<string[]> {
  const rows = await db.select({ slug: mealState.slug }).from(mealState).where(gte(mealState.restedUntil, date)).all();
  return rows.map((r) => r.slug);
}

export async function lastEaten(db: Db, before: ISODate): Promise<Record<string, ISODate>> {
  const rows = await db
    .select({ slug: mealLogs.mealSlug, last: max(mealLogs.date) })
    .from(mealLogs)
    .where(and(isNotNull(mealLogs.mealSlug), lt(mealLogs.date, before)))
    .groupBy(mealLogs.mealSlug)
    .all();
  return Object.fromEntries(rows.filter((r) => r.slug && r.last).map((r) => [r.slug!, r.last!]));
}

export async function ensureWeekPlan(db: Db, start: ISODate): Promise<void> {
  const existing = await db
    .select({ date: plannedMeals.date })
    .from(plannedMeals)
    .where(between(plannedMeals.date, start, addDays(start, 6)))
    .limit(1)
    .all();
  if (existing.length > 0) return;

  const week = generateWeek({
    weekStart: start,
    meals: rotationMeals(),
    lastEaten: await lastEaten(db, start),
    rested: await restedSlugs(db, start),
  });
  // D1 caps bound parameters per statement, so insert one day (5 rows) at a time.
  for (let d = 0; d < 7; d++) {
    const day = week.slice(d * 5, d * 5 + 5).map((p) => ({ date: p.date, slot: p.slot, mealSlug: p.slug, swapped: false }));
    await db.insert(plannedMeals).values(day).onConflictDoNothing();
  }
}

function fallbackMeal(slot: Slot, date: ISODate, rested: string[]): MealWithMacros {
  const mode = dayMode(date);
  const pick = [...meals.values()].find(
    (m) => m.pool === slotPool(slot) && (m.mode === "any" || mode === "weekend") && !rested.includes(m.slug),
  );
  if (!pick) throw new Error(`No meal for ${slot}`);
  return pick;
}

export async function plannedForDate(db: Db, date: ISODate): Promise<PlannedSlot[]> {
  await ensureWeekPlan(db, weekStart(date));
  const rows = await db.select().from(plannedMeals).where(eq(plannedMeals.date, date)).all();
  const bySlot = new Map(rows.map((r) => [r.slot as Slot, r]));
  const out: PlannedSlot[] = [];
  for (const slot of SLOTS) {
    const row = bySlot.get(slot);
    let meal = row ? meals.get(row.mealSlug) : undefined;
    if (!meal) {
      meal = fallbackMeal(slot, date, await restedSlugs(db, date));
      await db
        .insert(plannedMeals)
        .values({ date, slot, mealSlug: meal.slug, swapped: false })
        .onConflictDoUpdate({ target: [plannedMeals.date, plannedMeals.slot], set: { mealSlug: meal.slug } });
    }
    out.push({ date, slot, meal, swapped: row?.swapped ?? false });
  }
  return out;
}

export async function restMeal(db: Db, slug: string, until: ISODate): Promise<void> {
  await db.insert(mealState).values({ slug, restedUntil: until }).onConflictDoUpdate({ target: mealState.slug, set: { restedUntil: until } });
}

export async function swapPlanned(db: Db, date: ISODate, slot: Slot, slug: string, always: boolean, today: ISODate): Promise<void> {
  const current = await db.select().from(plannedMeals).where(and(eq(plannedMeals.date, date), eq(plannedMeals.slot, slot))).get();
  await db
    .insert(plannedMeals)
    .values({ date, slot, mealSlug: slug, swapped: true })
    .onConflictDoUpdate({ target: [plannedMeals.date, plannedMeals.slot], set: { mealSlug: slug, swapped: true } });
  if (always && current && current.mealSlug !== slug) await restMeal(db, current.mealSlug, addDays(today, 28));
}
```

- [ ] **Step 4: Run the test and make sure it passes**

Run: `npx vitest run --project workers tests/workers/meal-plan.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add weekly meal plan generation and swaps"
```

---

### Task 3: Meal logs, off-plan, batches, body logs

**Files:**
- Create: `app/server/meals.server.ts`, `app/server/body.server.ts`
- Test: `tests/workers/meals.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/workers/meals.test.ts
import { describe, expect, it } from "vitest";
import { meals } from "~/content";
import { latestWeighIn, logWaist, logWeighIn, stepsFor, upsertSteps, weighInFor } from "~/server/body.server";
import { createBatch, logPlannedMeal, logOffPlan, logsForDate, mainProtein, openBatch, unlog } from "~/server/meals.server";
import { db } from "./helpers";

describe("meal logs", () => {
  it("logs a planned meal with its macros and unlogs it", async () => {
    const meal = meals.get("chicken-and-rice-bowl")!;
    const id = await logPlannedMeal(db(), "2026-10-12", "lunch", meal, new Date());
    let logs = await logsForDate(db(), "2026-10-12");
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ slot: "lunch", mealSlug: meal.slug, kcal: meal.kcal, proteinG: meal.protein, category: "planned" });
    await unlog(db(), id);
    logs = await logsForDate(db(), "2026-10-12");
    expect(logs).toHaveLength(0);
  });

  it("logs off-plan food with a category and relaxed flag", async () => {
    await logOffPlan(db(), "2026-10-17", { name: "Restaurant dinner", category: "meal", kcal: 900, proteinG: 50, relaxed: true }, new Date());
    const [log] = await logsForDate(db(), "2026-10-17");
    expect(log).toMatchObject({ slot: null, mealSlug: null, relaxed: true, category: "meal" });
  });
});

describe("batches", () => {
  it("picks the ingredient carrying the most protein as the main protein", () => {
    expect(mainProtein(meals.get("chicken-and-rice-bowl")!).food).toBe("chicken-breast-raw");
    expect(mainProtein(meals.get("egg-and-potato-hash")!).food).toBe("egg-white");
  });

  it("splits a cooked batch and finds it for the next 3 days", async () => {
    const batch = await createBatch(db(), "chicken-and-rice-bowl", 3, 492, "2026-10-12");
    expect(batch.portionG).toBe(165);
    expect((await openBatch(db(), "chicken-and-rice-bowl", "2026-10-14"))?.id).toBe(batch.id);
    expect(await openBatch(db(), "chicken-and-rice-bowl", "2026-10-16")).toBeNull();
  });

  it("uses up a portion when the meal is eaten and closes the batch when empty", async () => {
    const batch = await createBatch(db(), "steak-and-baked-potato", 2, 400, "2026-10-12");
    const meal = meals.get("steak-and-baked-potato")!;
    await logPlannedMeal(db(), "2026-10-12", "dinner", meal, new Date());
    expect((await openBatch(db(), meal.slug, "2026-10-12"))?.portionsLeft).toBe(1);
    await logPlannedMeal(db(), "2026-10-13", "dinner", meal, new Date());
    expect(await openBatch(db(), meal.slug, "2026-10-13")).toBeNull();
    expect(batch.portions).toBe(2);
  });
});

describe("body logs", () => {
  it("upserts weigh-ins, waist, and steps by date", async () => {
    await logWeighIn(db(), "2026-10-12", 206.0, new Date());
    await logWeighIn(db(), "2026-10-12", 205.8, new Date());
    expect(await weighInFor(db(), "2026-10-12")).toBe(205.8);
    expect(await latestWeighIn(db())).toEqual({ date: "2026-10-12", weightLb: 205.8 });
    await logWaist(db(), "2026-10-18", 34.6);
    await upsertSteps(db(), "2026-10-12", 3120, new Date());
    await upsertSteps(db(), "2026-10-12", 5400, new Date());
    expect(await stepsFor(db(), "2026-10-12")).toBe(5400);
    expect(await stepsFor(db(), "2026-10-13")).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run --project workers tests/workers/meals.test.ts`
Expected: FAIL, cannot resolve `~/server/body.server`.

- [ ] **Step 3: Implement meals**

```ts
// app/server/meals.server.ts
import { and, asc, desc, eq, gt, gte } from "drizzle-orm";
import { foods, type MealWithMacros } from "~/content";
import type { Db } from "~/db/client";
import { batches, mealLogs } from "~/db/schema";
import { addDays } from "~/domain/dates";
import { batchPortion } from "~/domain/macros";
import type { ISODate, Slot } from "~/domain/types";

export type MealLog = typeof mealLogs.$inferSelect;
export type OffPlanCategory = "meal" | "snack" | "dessert" | "drink";

export function logsForDate(db: Db, date: ISODate): Promise<MealLog[]> {
  return db.select().from(mealLogs).where(eq(mealLogs.date, date)).orderBy(asc(mealLogs.loggedAt)).all();
}

export async function logPlannedMeal(db: Db, date: ISODate, slot: Slot, meal: MealWithMacros, now: Date): Promise<number> {
  const [row] = await db
    .insert(mealLogs)
    .values({ date, slot, mealSlug: meal.slug, name: meal.name, category: "planned", kcal: meal.kcal, proteinG: meal.protein, loggedAt: now.toISOString() })
    .returning({ id: mealLogs.id });
  const batch = await openBatch(db, meal.slug, date);
  if (batch) await db.update(batches).set({ portionsLeft: batch.portionsLeft - 1 }).where(eq(batches.id, batch.id));
  return row.id;
}

export async function logOffPlan(
  db: Db,
  date: ISODate,
  entry: { name: string; category: OffPlanCategory; kcal: number; proteinG: number; relaxed: boolean },
  now: Date,
): Promise<void> {
  await db.insert(mealLogs).values({ date, slot: null, mealSlug: null, ...entry, loggedAt: now.toISOString() });
}

export async function unlog(db: Db, id: number): Promise<void> {
  await db.delete(mealLogs).where(eq(mealLogs.id, id));
}

export function mainProtein(meal: MealWithMacros) {
  let best = meal.ingredients[0];
  let bestProtein = -1;
  for (const ing of meal.ingredients) {
    const p = (ing.grams / 100) * (foods.get(ing.food)?.proteinPer100 ?? 0);
    if (p > bestProtein) {
      best = ing;
      bestProtein = p;
    }
  }
  return best;
}

export type Batch = typeof batches.$inferSelect;

export async function createBatch(db: Db, mealSlug: string, portions: number, cookedWeightG: number, date: ISODate): Promise<Batch> {
  const [row] = await db
    .insert(batches)
    .values({ mealSlug, portions, cookedWeightG, portionG: batchPortion(cookedWeightG, portions), createdOn: date, portionsLeft: portions })
    .returning();
  return row;
}

/** A batch stays usable for the day it was cooked plus 3 days. */
export async function openBatch(db: Db, mealSlug: string, date: ISODate): Promise<Batch | null> {
  const row = await db
    .select()
    .from(batches)
    .where(and(eq(batches.mealSlug, mealSlug), gt(batches.portionsLeft, 0), gte(batches.createdOn, addDays(date, -3))))
    .orderBy(desc(batches.id))
    .get();
  if (!row || row.createdOn > date) return null;
  return row;
}
```

- [ ] **Step 4: Implement body logs**

```ts
// app/server/body.server.ts
import { between, desc, eq } from "drizzle-orm";
import type { Db } from "~/db/client";
import { stepsDaily, waistLogs, weighIns } from "~/db/schema";
import type { ISODate } from "~/domain/types";

export async function logWeighIn(db: Db, date: ISODate, weightLb: number, now: Date): Promise<void> {
  await db
    .insert(weighIns)
    .values({ date, weightLb, loggedAt: now.toISOString() })
    .onConflictDoUpdate({ target: weighIns.date, set: { weightLb, loggedAt: now.toISOString() } });
}

export async function weighInFor(db: Db, date: ISODate): Promise<number | null> {
  return (await db.select().from(weighIns).where(eq(weighIns.date, date)).get())?.weightLb ?? null;
}

export async function latestWeighIn(db: Db): Promise<{ date: ISODate; weightLb: number } | null> {
  const row = await db.select().from(weighIns).orderBy(desc(weighIns.date)).get();
  return row ? { date: row.date, weightLb: row.weightLb } : null;
}

export function weighInsBetween(db: Db, from: ISODate, to: ISODate) {
  return db.select().from(weighIns).where(between(weighIns.date, from, to)).orderBy(weighIns.date).all();
}

export async function logWaist(db: Db, date: ISODate, inches: number): Promise<void> {
  await db.insert(waistLogs).values({ date, inches }).onConflictDoUpdate({ target: waistLogs.date, set: { inches } });
}

export function waistLogsAll(db: Db) {
  return db.select().from(waistLogs).orderBy(waistLogs.date).all();
}

export async function upsertSteps(db: Db, date: ISODate, steps: number, now: Date): Promise<void> {
  await db
    .insert(stepsDaily)
    .values({ date, steps, updatedAt: now.toISOString() })
    .onConflictDoUpdate({ target: stepsDaily.date, set: { steps, updatedAt: now.toISOString() } });
}

export async function stepsFor(db: Db, date: ISODate): Promise<number> {
  return (await db.select().from(stepsDaily).where(eq(stepsDaily.date, date)).get())?.steps ?? 0;
}

export function stepsBetween(db: Db, from: ISODate, to: ISODate) {
  return db.select().from(stepsDaily).where(between(stepsDaily.date, from, to)).all();
}
```

- [ ] **Step 5: Run the test and make sure it passes**

Run: `npx vitest run --project workers tests/workers/meals.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Add meal, off-plan, batch, and body logging"
```

---

### Task 4: Day history and the Today summary

**Files:**
- Create: `app/server/history.server.ts`, `app/server/day.server.ts`
- Test: `tests/workers/day.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/workers/day.test.ts
import { describe, expect, it } from "vitest";
import { meals } from "~/content";
import { setLogs, workoutSessions } from "~/db/schema";
import { upsertSteps } from "~/server/body.server";
import { loadDay } from "~/server/day.server";
import { dayResults } from "~/server/history.server";
import { logOffPlan, logPlannedMeal } from "~/server/meals.server";
import { chicago, db } from "./helpers";

async function onPlanDay(date: string) {
  await logOffPlan(db(), date, { name: "Protein day", category: "meal", kcal: 2000, proteinG: 185, relaxed: false }, new Date());
  await upsertSteps(db(), date, 8000, new Date());
}

describe("dayResults", () => {
  it("marks days on plan from protein, steps, and desserts", async () => {
    await onPlanDay("2026-10-06");
    await upsertSteps(db(), "2026-10-07", 9000, new Date());
    await onPlanDay("2026-10-08");
    await logOffPlan(db(), "2026-10-08", { name: "Cookies", category: "dessert", kcal: 400, proteinG: 4, relaxed: false }, new Date());
    const results = await dayResults(db(), "2026-10-06", "2026-10-08");
    expect(results.map((r) => [r.date, r.onPlan])).toEqual([
      ["2026-10-06", true],
      ["2026-10-07", false],
      ["2026-10-08", false],
    ]);
  });

  it("always counts relaxed days", async () => {
    const [r] = await dayResults(db(), "2026-11-26", "2026-11-26");
    expect(r.onPlan).toBe(true);
  });
});

describe("loadDay", () => {
  it("summarizes a training day morning", async () => {
    for (const d of ["2026-10-09", "2026-10-10", "2026-10-11"]) await onPlanDay(d);
    const lunchSlug = "chicken-and-rice-bowl";
    const day = await loadDay(db(), "2026-10-12", chicago("2026-10-12", "09:00"));
    expect(day.weekNumber).toBe(2);
    expect(day.mode).toBe("weekday");
    expect(day.training?.name).toBe("Chest, Back, Arms");
    expect(day.training?.exerciseCount).toBe(6);
    expect(day.training?.setCount).toBe(12);
    expect(day.slots).toHaveLength(5);
    expect(day.streak).toBe(3);
    expect(day.weighIn).toBeNull();
    expect(meals.has(lunchSlug)).toBe(true);
  });

  it("totals logged food and marks slots eaten", async () => {
    const day0 = await loadDay(db(), "2026-10-13", chicago("2026-10-13", "12:00"));
    const breakfast = day0.slots[0];
    await logPlannedMeal(db(), "2026-10-13", "breakfast", breakfast.meal, new Date());
    const day = await loadDay(db(), "2026-10-13", chicago("2026-10-13", "12:00"));
    expect(day.totals).toEqual({ kcal: breakfast.meal.kcal, proteinG: breakfast.meal.protein });
    expect(day.slots[0].logId).not.toBeNull();
    expect(day.nextSlot).toBe("lunch");
  });

  it("flags two missed training days in a row until a session happens", async () => {
    // Fri Oct 23 and Mon Oct 26 have no sets; Tue Oct 27 is today
    let day = await loadDay(db(), "2026-10-27", chicago("2026-10-27", "10:00"));
    expect(day.missedTwice).toBe(true);
    const [s] = await db().insert(workoutSessions).values({ date: "2026-10-27", templateId: "plan-b-home", startedAt: new Date().toISOString() }).returning();
    await db().insert(setLogs).values({ sessionId: s.id, exerciseId: "pull-up", position: 0, setNumber: 1, weightLb: 0, reps: 8, loggedAt: new Date().toISOString() });
    day = await loadDay(db(), "2026-10-27", chicago("2026-10-27", "18:00"));
    expect(day.missedTwice).toBe(false);
    expect(day.loggedSetToday).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run --project workers tests/workers/day.test.ts`
Expected: FAIL, cannot resolve `~/server/history.server`.

- [ ] **Step 3: Implement history**

```ts
// app/server/history.server.ts
import { and, between, eq, sql } from "drizzle-orm";
import { plan } from "~/content";
import type { Db } from "~/db/client";
import { mealLogs, setLogs, workoutSessions } from "~/db/schema";
import { isOnPlan } from "~/domain/adherence";
import { isRelaxedDay } from "~/domain/calendar";
import { addDays, daysBetween } from "~/domain/dates";
import type { ISODate } from "~/domain/types";
import { stepsBetween } from "./body.server";
import { allTargets, resolveTargets, type Targets } from "./targets.server";

export interface DayResult {
  date: ISODate;
  kcal: number;
  proteinG: number;
  steps: number;
  offPlanDessert: boolean;
  relaxed: boolean;
  targets: Targets;
  onPlan: boolean;
}

export async function dayResults(db: Db, from: ISODate, to: ISODate): Promise<DayResult[]> {
  const food = await db
    .select({
      date: mealLogs.date,
      kcal: sql<number>`coalesce(sum(${mealLogs.kcal}), 0)`,
      protein: sql<number>`coalesce(sum(${mealLogs.proteinG}), 0)`,
      dessert: sql<number>`max(case when ${mealLogs.category} = 'dessert' and ${mealLogs.relaxed} = 0 then 1 else 0 end)`,
    })
    .from(mealLogs)
    .where(between(mealLogs.date, from, to))
    .groupBy(mealLogs.date)
    .all();
  const foodByDate = new Map(food.map((f) => [f.date, f]));
  const stepsByDate = new Map((await stepsBetween(db, from, to)).map((s) => [s.date, s.steps]));
  const targetRows = await allTargets(db);

  const out: DayResult[] = [];
  for (let i = 0; i <= daysBetween(from, to); i++) {
    const date = addDays(from, i);
    const f = foodByDate.get(date);
    const t = resolveTargets(targetRows, date);
    const facts = {
      proteinG: f?.protein ?? 0,
      steps: stepsByDate.get(date) ?? 0,
      offPlanDessert: (f?.dessert ?? 0) === 1,
      relaxedDay: isRelaxedDay(plan, date),
      proteinTarget: t.proteinG,
      stepGoal: t.stepGoal,
    };
    out.push({
      date,
      kcal: f?.kcal ?? 0,
      proteinG: facts.proteinG,
      steps: facts.steps,
      offPlanDessert: facts.offPlanDessert,
      relaxed: facts.relaxedDay,
      targets: t,
      onPlan: isOnPlan(facts),
    });
  }
  return out;
}

/** Dates in [from, to] that have at least one logged set. */
export async function datesWithSets(db: Db, from: ISODate, to: ISODate): Promise<Set<ISODate>> {
  const rows = await db
    .selectDistinct({ date: workoutSessions.date })
    .from(workoutSessions)
    .innerJoin(setLogs, eq(setLogs.sessionId, workoutSessions.id))
    .where(and(between(workoutSessions.date, from, to)))
    .all();
  return new Set(rows.map((r) => r.date));
}
```

- [ ] **Step 4: Implement the day summary**

```ts
// app/server/day.server.ts
import { eq } from "drizzle-orm";
import { exerciseImage, exercises, plan, type MealWithMacros } from "~/content";
import type { Db } from "~/db/client";
import { mealState, workoutSessions } from "~/db/schema";
import { isOnPlan, streak as streakFrom } from "~/domain/adherence";
import { dayMode, isRelaxedDay, isTrainingDay, optionalTemplateFor, setsFor, templateFor, weekNumber, weekType } from "~/domain/calendar";
import { addDays, formatTime, localMinutes, parseTime } from "~/domain/dates";
import type { DayMode, ISODate, Slot, WeekType } from "~/domain/types";
import { stepsFor, weighInFor } from "./body.server";
import { datesWithSets, dayResults } from "./history.server";
import { plannedForDate } from "./meal-plan.server";
import { logsForDate, type MealLog } from "./meals.server";
import { targetsFor, type Targets } from "./targets.server";

export interface SlotView {
  slot: Slot;
  time: string;
  minutes: number;
  meal: MealWithMacros;
  swapped: boolean;
  logId: number | null;
  photoKey: string | null;
}

export interface TrainingView {
  templateId: string;
  name: string;
  exerciseCount: number;
  setCount: number;
  heroImage: string;
}

export interface DaySummary {
  date: ISODate;
  minutes: number;
  weekNumber: number;
  weekType: WeekType;
  relaxed: boolean;
  mode: DayMode;
  targets: Targets;
  totals: { kcal: number; proteinG: number };
  steps: number;
  weighIn: number | null;
  slots: SlotView[];
  offPlan: MealLog[];
  offPlanDessert: boolean;
  training: TrainingView | null;
  optional: { templateId: string; name: string } | null;
  sessionStarted: boolean;
  loggedSetToday: boolean;
  onPlan: boolean;
  streak: number;
  missedTwice: boolean;
  nextSlot: Slot | null;
}

export async function loadDay(db: Db, date: ISODate, now: Date): Promise<DaySummary> {
  const [targets, slots, logs, steps, weighIn, photos] = await Promise.all([
    targetsFor(db, date),
    plannedForDate(db, date),
    logsForDate(db, date),
    stepsFor(db, date),
    weighInFor(db, date),
    db.select().from(mealState).all(),
  ]);
  const photoBySlug = new Map(photos.map((p) => [p.slug, p.photoKey]));

  const slotViews: SlotView[] = slots.map((s) => {
    const minutes = parseTime(plan.slotTimes[s.slot]);
    const log = logs.find((l) => l.slot === s.slot && l.category === "planned");
    return { slot: s.slot, time: formatTime(minutes), minutes, meal: s.meal, swapped: s.swapped, logId: log?.id ?? null, photoKey: photoBySlug.get(s.meal.slug) ?? null };
  });

  const offPlan = logs.filter((l) => l.category !== "planned");
  const totals = logs.reduce((t, l) => ({ kcal: t.kcal + l.kcal, proteinG: t.proteinG + l.proteinG }), { kcal: 0, proteinG: 0 });
  const offPlanDessert = offPlan.some((l) => l.category === "dessert" && !l.relaxed);
  const relaxed = isRelaxedDay(plan, date);

  const templateId = templateFor(plan, date);
  const training: TrainingView | null = templateId
    ? (() => {
        const t = plan.templates[templateId]!;
        const first = exercises.get(t.exercises[0].exercise)!;
        return { templateId, name: t.name, exerciseCount: t.exercises.length, setCount: t.exercises.length * setsFor(plan, date), heroImage: exerciseImage(first, 0) };
      })()
    : null;
  const optionalId = optionalTemplateFor(plan, date);

  const sessions = await db.select().from(workoutSessions).where(eq(workoutSessions.date, date)).all();
  const setDates = await datesWithSets(db, addDays(date, -14), date);

  const history = await dayResults(db, addDays(date, -60), addDays(date, -1));
  const onPlan = isOnPlan({ proteinG: totals.proteinG, steps, offPlanDessert, relaxedDay: relaxed, proteinTarget: targets.proteinG, stepGoal: targets.stepGoal });

  return {
    date,
    minutes: localMinutes(now),
    weekNumber: weekNumber(plan, date),
    weekType: weekType(plan, date),
    relaxed,
    mode: dayMode(date),
    targets,
    totals,
    steps,
    weighIn,
    slots: slotViews,
    offPlan,
    offPlanDessert,
    training,
    optional: optionalId ? { templateId: optionalId, name: plan.templates[optionalId]!.name } : null,
    sessionStarted: sessions.length > 0,
    loggedSetToday: setDates.has(date),
    onPlan,
    streak: streakFrom(history, date, onPlan),
    missedTwice: missedTwoInARow(date, setDates),
    nextSlot: slotViews.find((s) => s.logId === null)?.slot ?? null,
  };
}

/** The last two training days before today both had no sets, and nothing was logged since the first of them. */
function missedTwoInARow(today: ISODate, setDates: Set<ISODate>): boolean {
  const missed: ISODate[] = [];
  for (let d = addDays(today, -1); missed.length < 2 && d >= addDays(today, -14); d = addDays(d, -1)) {
    if (!isTrainingDay(plan, d)) continue;
    if (setDates.has(d)) return false;
    missed.push(d);
  }
  if (missed.length < 2) return false;
  for (const d of setDates) if (d > missed[1]) return false;
  return true;
}
```

- [ ] **Step 5: Run the test and make sure it passes**

Run: `npx vitest run --project workers tests/workers/day.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Add day history and Today summary"
```

---

### Task 5: Media route and meal photos

**Files:**
- Create: `app/routes/media.tsx`, `app/server/photos.server.ts`
- Modify: `app/routes.ts`
- Test: `tests/workers/media.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/workers/media.test.ts
import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { mealState } from "~/db/schema";
import { loader } from "~/routes/media";
import { saveMealPhoto } from "~/server/photos.server";
import { db, routeArgs } from "./helpers";

describe("media", () => {
  it("serves an R2 object with its content type and a long cache", async () => {
    await env.MEDIA.put("exercises/Butterfly/0.jpg", new Uint8Array([1, 2, 3]), { httpMetadata: { contentType: "image/jpeg" } });
    const res = (await loader(routeArgs(new Request("http://localhost/media/exercises/Butterfly/0.jpg"), { "*": "exercises/Butterfly/0.jpg" }))) as Response;
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/jpeg");
    expect(res.headers.get("Cache-Control")).toContain("max-age=31536000");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("404s for a missing key", async () => {
    const res = await loader(routeArgs(new Request("http://localhost/media/nope.jpg"), { "*": "nope.jpg" })).catch((e: Response) => e);
    expect((res as Response).status).toBe(404);
  });

  it("stores a meal photo and replaces the old one", async () => {
    const jpeg = new File([new Uint8Array([9, 9])], "a.jpg", { type: "image/jpeg" });
    const first = await saveMealPhoto(db(), "salmon-and-rice", jpeg);
    const second = await saveMealPhoto(db(), "salmon-and-rice", jpeg);
    expect(await env.MEDIA.get(first)).toBeNull();
    expect(await env.MEDIA.get(second)).not.toBeNull();
    const row = await db().select().from(mealState).where(eq(mealState.slug, "salmon-and-rice")).get();
    expect(row?.photoKey).toBe(second);
  });

  it("rejects non-images", async () => {
    const txt = new File(["hi"], "a.txt", { type: "text/plain" });
    await expect(saveMealPhoto(db(), "salmon-and-rice", txt)).rejects.toThrow(/image/);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run --project workers tests/workers/media.test.ts`
Expected: FAIL, cannot resolve `~/routes/media`.

- [ ] **Step 3: Implement the media route**

```ts
// app/routes/media.tsx
import { env } from "cloudflare:workers";
import type { Route } from "./+types/media";

export async function loader({ params }: Route.LoaderArgs) {
  const key = params["*"];
  const obj = key ? await env.MEDIA.get(key) : null;
  if (!obj) throw new Response("Not found", { status: 404 });
  return new Response(obj.body, {
    headers: {
      "Content-Type": obj.httpMetadata?.contentType ?? "application/octet-stream",
      "Cache-Control": "private, max-age=31536000, immutable",
      ETag: obj.httpEtag,
    },
  });
}
```

- [ ] **Step 4: Implement photo storage**

```ts
// app/server/photos.server.ts
import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import type { Db } from "~/db/client";
import { mealState } from "~/db/schema";

const MAX_BYTES = 8 * 1024 * 1024;

export async function saveMealPhoto(db: Db, slug: string, file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Upload an image");
  if (file.size > MAX_BYTES) throw new Error("Image is too large");
  const key = `meals/${slug}/${crypto.randomUUID()}.jpg`;
  await env.MEDIA.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: "image/jpeg" } });
  const old = await db.select().from(mealState).where(eq(mealState.slug, slug)).get();
  await db.insert(mealState).values({ slug, photoKey: key }).onConflictDoUpdate({ target: mealState.slug, set: { photoKey: key } });
  if (old?.photoKey) await env.MEDIA.delete(old.photoKey);
  return key;
}
```

- [ ] **Step 5: Register the route** (add above the `layout(...)` entry in `app/routes.ts`)

```ts
  route("media/*", "routes/media.tsx"),
```

- [ ] **Step 6: Run the test and make sure it passes**

Run: `npx vitest run --project workers tests/workers/media.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Add authenticated media route and meal photo storage"
```

---

### Task 6: UI pieces

**Files:**
- Create: `app/components/Rings.tsx`, `app/components/MealPhoto.tsx`, `app/components/MealRow.tsx`, `app/components/Sheet.tsx`, `app/components/Segmented.tsx`

- [ ] **Step 1: Rings** (three concentric Apple Fitness style rings)

```tsx
// app/components/Rings.tsx
const RINGS = [
  { r: 56, color: "var(--calories)" },
  { r: 42, color: "var(--protein)" },
  { r: 28, color: "var(--steps)" },
];

export function Rings({ values }: { values: [number, number, number] }) {
  return (
    <svg width="132" height="132" viewBox="0 0 132 132" aria-hidden="true" className="flex-none">
      {RINGS.map(({ r, color }, i) => {
        const c = 2 * Math.PI * r;
        const p = Math.max(0, Math.min(1, values[i]));
        return (
          <g key={r}>
            <circle cx="66" cy="66" r={r} fill="none" stroke={color} strokeOpacity="0.22" strokeWidth="12" />
            <circle cx="66" cy="66" r={r} fill="none" stroke={color} strokeWidth="12" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - p)} transform="rotate(-90 66 66)" />
          </g>
        );
      })}
    </svg>
  );
}
```

- [ ] **Step 2: Meal photo with placeholder**

```tsx
// app/components/MealPhoto.tsx
import { Icon } from "./ui";

export function MealPhoto({ photoKey, alt, className }: { photoKey: string | null; alt: string; className: string }) {
  if (photoKey) return <img src={`/media/${photoKey}`} alt={alt} className={`${className} object-cover`} />;
  return (
    <div aria-hidden="true" className={`${className} flex items-center justify-center bg-fill text-label-3`}>
      <Icon name="plate" size={22} strokeWidth={1.6} />
    </div>
  );
}
```

- [ ] **Step 3: Meal row**

```tsx
// app/components/MealRow.tsx
import { Link } from "react-router";
import type { SlotView } from "~/server/day.server";
import { MealPhoto } from "./MealPhoto";
import { Icon } from "./ui";

const LABEL: Record<string, string> = { breakfast: "Breakfast", lunch: "Lunch", snack: "Snack", dinner: "Dinner", dessert: "Dessert" };

export function MealRow({ s, upNext }: { s: SlotView; upNext: boolean }) {
  const eaten = s.logId !== null;
  return (
    <Link to={`/meal/${s.meal.slug}?slot=${s.slot}`} className="flex items-center gap-3 border-b-[0.5px] border-separator px-3.5 py-3 last:border-b-0">
      <MealPhoto photoKey={s.photoKey} alt="" className="size-[54px] flex-none rounded-[14px]" />
      <div className="min-w-0 flex-1">
        <div className={`text-[13px] ${upNext ? "font-semibold text-label" : "text-label-3"}`}>
          {LABEL[s.slot]} · {s.time}
          {upNext && " · Up next"}
          {s.slot === "dessert" && " · kitchen closes after"}
        </div>
        <div className={`mt-px truncate text-[16px] font-semibold ${eaten ? "text-label-2" : ""}`}>{s.meal.name}</div>
        <div className="tabular mt-px text-[13px] text-label-2">
          {s.meal.kcal} cal · {s.meal.protein} g protein
        </div>
      </div>
      {eaten ? (
        <span aria-label="Eaten" className="flex size-7 flex-none items-center justify-center rounded-full bg-steps text-black">
          <Icon name="check" size={15} strokeWidth={3.2} />
        </span>
      ) : (
        <span className="text-label-3">
          <Icon name="chevron" size={18} strokeWidth={2.4} />
        </span>
      )}
    </Link>
  );
}
```

- [ ] **Step 4: Bottom sheet** (glass panel over a dimmed backdrop)

```tsx
// app/components/Sheet.tsx
import { useEffect, type ReactNode } from "react";

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center min-[900px]:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/50" />
      <div className="glass-bar relative max-h-[85dvh] w-full max-w-[520px] overflow-y-auto rounded-t-[30px] p-5 pb-[max(20px,env(safe-area-inset-bottom))] min-[900px]:rounded-[30px]">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[20px] font-bold">{title}</h2>
          <button type="button" onClick={onClose} className="glass h-9 rounded-full px-4 text-[15px] font-semibold">
            Done
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Glass segmented control**

```tsx
// app/components/Segmented.tsx
export function Segmented<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="glass grid gap-0.5 rounded-[26px] p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.value)}
            className={`h-11 rounded-[22px] text-[15px] ${on ? "bg-[var(--glass-selected)] font-semibold text-label shadow-[inset_0_1px_0_var(--glass-highlight)]" : "font-medium text-label-2"}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Add rings, meal row, sheet, and segmented control"
```

---

### Task 7: Today screen

**Files:**
- Modify: `app/routes/today.tsx` (replace the placeholder)
- Test: `tests/workers/today-route.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/workers/today-route.test.ts
import { describe, expect, it } from "vitest";
import { action, loader } from "~/routes/today";
import { weighInFor, latestWeighIn } from "~/server/body.server";
import { logsForDate } from "~/server/meals.server";
import { localDate, mealDate } from "~/domain/dates";
import { db, post, routeArgs } from "./helpers";

describe("today route", () => {
  it("loads a summary and a Rocky message", async () => {
    const data = await loader(routeArgs(new Request("http://localhost/")));
    expect(data.day.slots).toHaveLength(5);
    expect(typeof data.message).toBe("string");
    expect(data.message.length).toBeGreaterThan(5);
  });

  it("logs a weigh-in for today", async () => {
    await action(routeArgs(post("http://localhost/?index", { intent: "weigh-in", weight: "205.8" })));
    expect(await weighInFor(db(), localDate())).toBe(205.8);
    expect((await latestWeighIn(db()))?.weightLb).toBe(205.8);
  });

  it("rejects a nonsense weigh-in", async () => {
    const res = await action(routeArgs(post("http://localhost/?index", { intent: "weigh-in", weight: "abc" })));
    expect(res).toEqual({ error: "Enter your weight in pounds." });
  });

  it("logs off-plan food", async () => {
    await action(routeArgs(post("http://localhost/?index", { intent: "off-plan", name: "Ranch Water", category: "drink", kcal: "100", protein: "0" })));
    const logs = await logsForDate(db(), mealDate());
    expect(logs.some((l) => l.name === "Ranch Water" && l.category === "drink")).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run --project workers tests/workers/today-route.test.ts`
Expected: FAIL, `loader` is not exported from `~/routes/today`.

- [ ] **Step 3: Implement the Today route**

```tsx
// app/routes/today.tsx
import { env } from "cloudflare:workers";
import { useState } from "react";
import { Form, Link, useFetcher } from "react-router";
import type { Route } from "./+types/today";
import { MealRow } from "~/components/MealRow";
import { Rings } from "~/components/Rings";
import { Sheet } from "~/components/Sheet";
import { Card, Icon, LargeTitle, Screen, SectionTitle } from "~/components/ui";
import { messages } from "~/content";
import { getDb } from "~/db/client";
import { localDate, mealDate } from "~/domain/dates";
import { pickSituation, renderMessage } from "~/domain/messages";
import { logWeighIn } from "~/server/body.server";
import { loadDay } from "~/server/day.server";
import { logOffPlan, type OffPlanCategory } from "~/server/meals.server";

export function meta() {
  return [{ title: "Today · Rocky" }];
}

export async function loader(_args: Route.LoaderArgs) {
  const now = new Date();
  const db = getDb(env.DB);
  const day = await loadDay(db, mealDate(now), now);
  const lunch = day.slots.find((s) => s.slot === "lunch")?.meal.name ?? "lunch";
  const next = day.slots.find((s) => s.slot === day.nextSlot)?.meal.name ?? "breakfast tomorrow";
  const situation = pickSituation({
    minutes: day.minutes,
    relaxedDay: day.relaxed,
    trainingDay: day.training !== null,
    sessionStarted: day.sessionStarted,
    loggedSetToday: day.loggedSetToday,
    missedTwice: day.missedTwice,
    weighedIn: day.weighIn !== null,
    proteinG: day.totals.proteinG,
    proteinTarget: day.targets.proteinG,
    steps: day.steps,
    stepGoal: day.targets.stepGoal,
    onPlan: day.onPlan,
  });
  const message = renderMessage(messages, situation, day.date, {
    protein: day.totals.proteinG,
    lunch: lunch.toLowerCase(),
    workout: day.training?.name ?? "",
    left: situation === "steps-behind" ? (day.targets.stepGoal - day.steps).toLocaleString() : Math.max(0, day.targets.proteinG - day.totals.proteinG),
    streak: day.streak,
    nextMeal: next.toLowerCase(),
  });
  return { day, message };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const db = getDb(env.DB);
  const now = new Date();
  switch (form.get("intent")) {
    case "weigh-in": {
      const weight = Number(form.get("weight"));
      if (!Number.isFinite(weight) || weight < 80 || weight > 500) return { error: "Enter your weight in pounds." };
      await logWeighIn(db, localDate(now), Math.round(weight * 10) / 10, now);
      return { ok: true };
    }
    case "off-plan": {
      const name = String(form.get("name") ?? "").trim();
      const kcal = Number(form.get("kcal"));
      const protein = Number(form.get("protein") ?? 0);
      const category = String(form.get("category")) as OffPlanCategory;
      if (!name || !Number.isFinite(kcal) || kcal < 0 || !["meal", "snack", "dessert", "drink"].includes(category)) {
        return { error: "Add a name, a category, and calories." };
      }
      await logOffPlan(db, mealDate(now), { name, category, kcal: Math.round(kcal), proteinG: Math.round(protein || 0), relaxed: form.get("relaxed") === "on" }, now);
      return { ok: true };
    }
    default:
      return { error: "Unknown action" };
  }
}

const DATE_FMT = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });

export default function Today({ loaderData }: Route.ComponentProps) {
  const { day, message } = loaderData;
  const [offPlanOpen, setOffPlanOpen] = useState(false);
  const pct = (a: number, b: number) => (b > 0 ? a / b : 0);
  const dateLabel = DATE_FMT.format(new Date(`${day.date}T12:00:00Z`));

  return (
    <Screen>
      <LargeTitle
        eyebrow={`${dateLabel} · Week ${day.weekNumber}`}
        title="Today"
        right={
          <div className="flex items-center gap-2">
            <span className="glass flex h-9 items-center rounded-full px-3.5 text-[14px] font-semibold">{day.streak} day streak</span>
            <Link to="/settings" aria-label="Settings" className="glass flex size-11 items-center justify-center rounded-full">
              <Icon name="gear" />
            </Link>
          </div>
        }
      />

      {day.weighIn === null && <WeighInCard />}

      <div className="flex flex-col gap-[18px] min-[900px]:grid min-[900px]:grid-cols-2 min-[900px]:items-start">
        <div className="flex flex-col gap-[18px]">
          <Card className="flex items-center gap-5 p-5">
            <Rings values={[pct(day.totals.kcal, day.targets.kcal), pct(day.totals.proteinG, day.targets.proteinG), pct(day.steps, day.targets.stepGoal)]} />
            <div className="tabular flex flex-col gap-2.5">
              <Stat label="Calories" color="text-calories" value={day.totals.kcal.toLocaleString()} of={`/${day.targets.kcal.toLocaleString()}`} />
              <Stat label="Protein" color="text-protein" value={String(day.totals.proteinG)} of={`/${day.targets.proteinG} g`} />
              <Stat label="Steps" color="text-steps" value={day.steps.toLocaleString()} of={`/${day.targets.stepGoal.toLocaleString()}`} />
            </div>
          </Card>

          <Card className="flex items-start gap-3 px-[18px] py-4">
            <div aria-hidden="true" className="flex size-[34px] flex-none items-center justify-center rounded-full bg-fill text-[15px] font-bold">
              R
            </div>
            <div>
              <div className="text-[13px] font-semibold text-label-2">Rocky</div>
              <p className="mt-0.5 text-[16px] leading-snug">{message}</p>
            </div>
          </Card>

          {day.training ? (
            <Card className="overflow-hidden">
              <div className="relative h-[180px] bg-fill">
                <img src={day.training.heroImage} alt="" className="h-full w-full object-cover" />
                <span className="glass-on-image absolute left-3 top-3 flex h-[30px] items-center rounded-full px-3 text-[13px] font-semibold">12 to 2pm · ~45 min</span>
              </div>
              <div className="flex flex-col gap-1 px-[18px] pb-[18px] pt-4">
                <div className="text-[22px] font-bold">{day.training.name}</div>
                <div className="text-[15px] text-label-2">
                  {day.training.exerciseCount} exercises · {day.training.setCount} sets{day.weekType === "deload" ? " · deload week" : ""}
                </div>
                <div className="mt-3 flex gap-2.5">
                  <Link to="/workout" className="btn-prominent flex h-[50px] flex-1 items-center justify-center rounded-full text-[17px] font-semibold">
                    {day.loggedSetToday ? "Continue workout" : "Start workout"}
                  </Link>
                  <Link to="/workout?plan=b" className="glass flex h-[50px] items-center justify-center rounded-full px-[18px] text-[16px] font-semibold">
                    Plan B
                  </Link>
                </div>
              </div>
            </Card>
          ) : (
            <Card className="flex items-center justify-between px-[18px] py-4">
              <div>
                <div className="text-[17px] font-semibold">Rest day</div>
                <div className="text-[14px] text-label-2">{day.optional ? `Optional: ${day.optional.name}, 30 min` : "Walk, recover, eat on plan."}</div>
              </div>
              {day.optional && (
                <Link to={`/workout?template=${day.optional.templateId}`} className="glass flex h-10 items-center rounded-full px-4 text-[15px] font-semibold">
                  Start
                </Link>
              )}
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-[18px]">
          <section aria-label="Meals" className="flex flex-col gap-2">
            <SectionTitle right={day.relaxed ? "Holiday" : day.mode === "weekday" ? "Weekday" : "Weekend"}>Meals</SectionTitle>
            <Card className="overflow-hidden">
              {day.slots.map((s) => (
                <MealRow key={s.slot} s={s} upNext={s.slot === day.nextSlot} />
              ))}
            </Card>
            {day.offPlan.length > 0 && (
              <Card className="px-[18px] py-3">
                {day.offPlan.map((l) => (
                  <div key={l.id} className="tabular flex justify-between py-1 text-[15px]">
                    <span>
                      {l.name}
                      {l.relaxed && <span className="text-label-2"> · relaxed</span>}
                    </span>
                    <span className="text-label-2">{l.kcal} cal</span>
                  </div>
                ))}
              </Card>
            )}
            <button type="button" onClick={() => setOffPlanOpen(true)} className="glass ml-0.5 h-10 self-start rounded-full px-4 text-[15px] font-semibold">
              + Log off-plan
            </button>
          </section>

          <Card className="flex flex-col gap-3.5 p-[18px]">
            <div>
              <h2 className="text-[17px] font-semibold">Minimum viable day</h2>
              <p className="mt-0.5 text-[14px] leading-snug text-label-2">Hit these three and today counts, even if the rest goes sideways.</p>
            </div>
            <Bar label={`${day.targets.proteinG} g protein`} value={day.totals.proteinG} target={day.targets.proteinG} color="var(--protein)" />
            <Bar label={`${day.targets.stepGoal.toLocaleString()} steps`} value={day.steps} target={day.targets.stepGoal} color="var(--steps)" />
            <div className="flex justify-between text-[15px]">
              <span>No off-plan dessert</span>
              <span className="text-label-2">{day.offPlanDessert ? "Missed" : day.minutes >= 21 * 60 ? "Done" : "Tonight"}</span>
            </div>
            <div className="tabular flex justify-between border-t-[0.5px] border-separator pt-3 text-[15px]">
              <span className="text-label-2">Weigh-in</span>
              <span className="font-semibold">{day.weighIn !== null ? `${day.weighIn} lb` : "Not yet"}</span>
            </div>
          </Card>
        </div>
      </div>

      <OffPlanSheet open={offPlanOpen} onClose={() => setOffPlanOpen(false)} />
    </Screen>
  );
}

function Stat({ label, color, value, of }: { label: string; color: string; value: string; of: string }) {
  return (
    <div>
      <div className="text-[13px] font-semibold">{label}</div>
      <div className={`text-[22px] font-bold ${color}`}>
        {value}
        <span className="text-[15px]">{of}</span>
      </div>
    </div>
  );
}

function Bar({ label, value, target, color }: { label: string; value: number; target: number; color: string }) {
  const p = Math.min(100, Math.round((value / target) * 100));
  return (
    <div className="flex flex-col gap-1.5">
      <div className="tabular flex justify-between text-[15px]">
        <span>{label}</span>
        <span className="text-label-2">
          {value.toLocaleString()} / {target.toLocaleString()}
        </span>
      </div>
      <div className="h-1.5 rounded-full" style={{ background: `color-mix(in srgb, ${color} 20%, transparent)` }}>
        <div className="h-1.5 rounded-full" style={{ width: `${p}%`, background: color }} />
      </div>
    </div>
  );
}

function WeighInCard() {
  const fetcher = useFetcher<typeof action>();
  return (
    <Card className="p-4">
      <fetcher.Form method="post" className="flex items-center gap-3">
        <input type="hidden" name="intent" value="weigh-in" />
        <label htmlFor="weight" className="flex-1 text-[16px] font-semibold">
          Log weigh-in
        </label>
        <div className="flex h-11 w-[120px] items-center gap-1.5 rounded-xl bg-fill px-3">
          <input id="weight" name="weight" inputMode="decimal" placeholder="0.0" required className="tabular w-full min-w-0 bg-transparent text-right text-[18px] font-semibold outline-none" />
          <span className="font-semibold text-label-2">lb</span>
        </div>
        <button type="submit" className="btn-prominent h-11 rounded-full px-4 text-[15px] font-semibold">
          Save
        </button>
      </fetcher.Form>
      {fetcher.data && "error" in fetcher.data && <p className="mt-2 text-[14px] text-calories">{fetcher.data.error}</p>}
    </Card>
  );
}

const PRESETS = [
  { name: "Restaurant meal", category: "meal", kcal: 900, protein: 50, relaxed: true },
  { name: "Ranch Water", category: "drink", kcal: 100, protein: 0, relaxed: false },
];

function OffPlanSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const fetcher = useFetcher<typeof action>();
  const submit = (fields: Record<string, string>) => {
    fetcher.submit({ intent: "off-plan", ...fields }, { method: "post" });
    onClose();
  };
  return (
    <Sheet open={open} onClose={onClose} title="Log off-plan">
      <div className="mb-4 flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.name}
            type="button"
            onClick={() => submit({ name: p.name, category: p.category, kcal: String(p.kcal), protein: String(p.protein), ...(p.relaxed ? { relaxed: "on" } : {}) })}
            className="glass h-9 rounded-full px-3.5 text-[14px] font-semibold"
          >
            {p.name}
            {p.relaxed ? " (relaxed)" : ""}
          </button>
        ))}
      </div>
      <Form
        method="post"
        onSubmit={(e) => {
          e.preventDefault();
          submit(Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>);
        }}
        className="flex flex-col gap-3"
      >
        <label className="flex flex-col gap-1 text-[13px] font-semibold text-label-2">
          What was it
          <input name="name" required className="h-11 rounded-xl bg-fill px-3 text-[17px] font-normal text-label outline-none" />
        </label>
        <label className="flex flex-col gap-1 text-[13px] font-semibold text-label-2">
          Category
          <select name="category" defaultValue="meal" className="h-11 rounded-xl bg-fill px-3 text-[17px] font-normal text-label outline-none">
            <option value="meal">Meal</option>
            <option value="snack">Snack</option>
            <option value="dessert">Dessert</option>
            <option value="drink">Drink</option>
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-[13px] font-semibold text-label-2">
            Calories
            <input name="kcal" inputMode="numeric" required className="tabular h-11 rounded-xl bg-fill px-3 text-[17px] font-normal text-label outline-none" />
          </label>
          <label className="flex flex-col gap-1 text-[13px] font-semibold text-label-2">
            Protein (g)
            <input name="protein" inputMode="numeric" defaultValue="0" className="tabular h-11 rounded-xl bg-fill px-3 text-[17px] font-normal text-label outline-none" />
          </label>
        </div>
        <label className="flex items-center justify-between text-[16px]">
          Relaxed meal (weekend restaurant)
          <input type="checkbox" name="relaxed" className="size-6 accent-[var(--steps)]" />
        </label>
        <button type="submit" className="btn-prominent mt-1 h-[52px] rounded-full text-[17px] font-semibold">
          Log it
        </button>
      </Form>
    </Sheet>
  );
}
```

- [ ] **Step 4: Run the test and make sure it passes**

Run: `npx vitest run --project workers tests/workers/today-route.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Look at it**

Run: `npm run dev`, sign in, open Today.
Expected: matches the "Today" mockup: rings with numbers, Rocky card, workout card on Mon/Wed/Fri (photo is broken until M4 copies exercise images; that is expected), meals list with times and "Up next", the off-plan sheet opens and logs, the weigh-in card disappears after saving.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Build the Today screen"
```

---

### Task 8: Meal screen

**Files:**
- Create: `app/routes/meal.tsx`
- Modify: `app/routes.ts`
- Test: `tests/workers/meal-route.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/workers/meal-route.test.ts
import { describe, expect, it } from "vitest";
import { mealDate } from "~/domain/dates";
import { action, loader } from "~/routes/meal";
import { plannedForDate } from "~/server/meal-plan.server";
import { logsForDate, openBatch } from "~/server/meals.server";
import { db, post, routeArgs } from "./helpers";

describe("meal route", () => {
  it("loads a meal with ingredients, today's slot, and swap options", async () => {
    const today = mealDate();
    const lunch = (await plannedForDate(db(), today)).find((s) => s.slot === "lunch")!;
    const data = await loader(routeArgs(new Request(`http://localhost/meal/${lunch.meal.slug}?slot=lunch`), { slug: lunch.meal.slug }));
    expect(data.meal.slug).toBe(lunch.meal.slug);
    expect(data.ingredients.length).toBeGreaterThan(0);
    expect(data.ingredients[0]).toHaveProperty("state");
    expect(data.slot).toBe("lunch");
    expect(data.swapOptions.every((m) => m.pool === "main" && m.slug !== lunch.meal.slug)).toBe(true);
  });

  it("404s an unknown meal", async () => {
    const res = await loader(routeArgs(new Request("http://localhost/meal/nope"), { slug: "nope" })).catch((e: Response) => e);
    expect((res as Response).status).toBe(404);
  });

  it("logs the meal for its slot", async () => {
    const today = mealDate();
    const snack = (await plannedForDate(db(), today)).find((s) => s.slot === "snack")!;
    await action(routeArgs(post(`http://localhost/meal/${snack.meal.slug}`, { intent: "ate", slot: "snack" }), { slug: snack.meal.slug }));
    const logs = await logsForDate(db(), today);
    expect(logs.some((l) => l.slot === "snack" && l.mealSlug === snack.meal.slug)).toBe(true);
  });

  it("creates a batch from the cooked weight", async () => {
    await action(routeArgs(post("http://localhost/meal/chicken-and-rice-bowl", { intent: "batch", portions: "3", cookedWeight: "492" }), { slug: "chicken-and-rice-bowl" }));
    expect((await openBatch(db(), "chicken-and-rice-bowl", mealDate()))?.portionG).toBe(165);
  });

  it("swaps the planned meal", async () => {
    const today = mealDate();
    const dinner = (await plannedForDate(db(), today)).find((s) => s.slot === "dinner")!;
    const target = dinner.meal.slug === "salmon-and-rice" ? "burger-bowl" : "salmon-and-rice";
    const res = (await action(routeArgs(post(`http://localhost/meal/${dinner.meal.slug}`, { intent: "swap", slot: "dinner", to: target, always: "false" }), { slug: dinner.meal.slug }))) as Response;
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe(`/meal/${target}?slot=dinner`);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run --project workers tests/workers/meal-route.test.ts`
Expected: FAIL, cannot resolve `~/routes/meal`.

- [ ] **Step 3: Implement the Meal route**

```tsx
// app/routes/meal.tsx
import { env } from "cloudflare:workers";
import { useState } from "react";
import { redirect, useFetcher } from "react-router";
import type { Route } from "./+types/meal";
import { MealPhoto } from "~/components/MealPhoto";
import { Segmented } from "~/components/Segmented";
import { Sheet } from "~/components/Sheet";
import { BackButton, Card, Icon } from "~/components/ui";
import { foods, meals, plan } from "~/content";
import { getDb } from "~/db/client";
import { dayMode } from "~/domain/calendar";
import { formatTime, mealDate, parseTime } from "~/domain/dates";
import { scaleGrams } from "~/domain/macros";
import { SLOTS, slotPool, type Slot } from "~/domain/types";
import { mealState } from "~/db/schema";
import { eq } from "drizzle-orm";
import { loadDay } from "~/server/day.server";
import { restedSlugs, swapPlanned } from "~/server/meal-plan.server";
import { createBatch, logPlannedMeal, mainProtein, openBatch } from "~/server/meals.server";
import { saveMealPhoto } from "~/server/photos.server";

export const handle = { hideTabBar: true };

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData?.meal.name ?? "Meal"} · Rocky` }];
}

const STATE_LABEL = { raw: "Raw", cooked: "Cooked", "as-is": "" } as const;

export async function loader({ request, params }: Route.LoaderArgs) {
  const meal = meals.get(params.slug);
  if (!meal) throw new Response("Not found", { status: 404 });
  const db = getDb(env.DB);
  const now = new Date();
  const date = mealDate(now);
  const day = await loadDay(db, date, now);
  const requested = new URL(request.url).searchParams.get("slot") as Slot | null;
  const plannedSlot = day.slots.find((s) => s.meal.slug === meal.slug && (!requested || s.slot === requested));
  const slot = plannedSlot?.slot ?? (requested && SLOTS.includes(requested) ? requested : null);

  const rested = await restedSlugs(db, date);
  const mode = dayMode(date);
  const unlogged = day.slots.filter((s) => s.logId === null).length || 1;
  const perSlot = (day.targets.kcal - day.totals.kcal) / unlogged;
  const swapOptions = [...meals.values()]
    .filter((m) => m.pool === meal.pool && m.slug !== meal.slug && (m.mode === "any" || mode === "weekend") && !rested.includes(m.slug))
    .sort((a, b) => Math.abs(a.kcal - perSlot) - 2 * a.protein - (Math.abs(b.kcal - perSlot) - 2 * b.protein));

  const main = mainProtein(meal);
  const photo = await db.select().from(mealState).where(eq(mealState.slug, meal.slug)).get();
  return {
    meal,
    slot,
    slotTime: slot ? formatTime(parseTime(plan.slotTimes[slot])) : null,
    logged: plannedSlot ? plannedSlot.logId !== null : false,
    ingredients: meal.ingredients.map((i) => {
      const f = foods.get(i.food)!;
      return { food: i.food, name: f.name, state: STATE_LABEL[f.state], grams: i.grams, note: i.note ?? null, eachG: f.eachG ?? null, eachLabel: f.eachLabel ?? null };
    }),
    mainProtein: { food: main.food, name: foods.get(main.food)!.name },
    batch: await openBatch(db, meal.slug, date),
    photoKey: photo?.photoKey ?? null,
    swapOptions,
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  const meal = meals.get(params.slug);
  if (!meal) throw new Response("Not found", { status: 404 });
  const db = getDb(env.DB);
  const now = new Date();
  const date = mealDate(now);
  const form = await request.formData();
  switch (form.get("intent")) {
    case "ate": {
      const slot = String(form.get("slot")) as Slot;
      if (!SLOTS.includes(slot)) return { error: "Pick a slot" };
      await logPlannedMeal(db, date, slot, meal, now);
      return redirect("/");
    }
    case "batch": {
      const portions = Number(form.get("portions"));
      const cooked = Number(form.get("cookedWeight"));
      if (![2, 3].includes(portions) || !Number.isFinite(cooked) || cooked <= 0) return { error: "Enter the cooked weight in grams." };
      await createBatch(db, meal.slug, portions, Math.round(cooked), date);
      return { ok: true };
    }
    case "swap": {
      const slot = String(form.get("slot")) as Slot;
      const to = meals.get(String(form.get("to")));
      if (!to || !SLOTS.includes(slot) || slotPool(slot) !== to.pool) return { error: "That meal doesn't fit this slot." };
      await swapPlanned(db, date, slot, to.slug, form.get("always") === "true", date);
      return redirect(`/meal/${to.slug}?slot=${slot}`);
    }
    case "photo": {
      const file = form.get("photo");
      if (!(file instanceof File)) return { error: "Choose a photo." };
      await saveMealPhoto(db, meal.slug, file);
      return { ok: true };
    }
    default:
      return { error: "Unknown action" };
  }
}

const PORTIONS = [
  { value: 1, label: "1 portion" },
  { value: 2, label: "2 days" },
  { value: 3, label: "3 days" },
];

export default function MealScreen({ loaderData }: Route.ComponentProps) {
  const { meal, slot, slotTime, logged, ingredients, mainProtein, batch, photoKey, swapOptions } = loaderData;
  const [portions, setPortions] = useState(1);
  const [swapOpen, setSwapOpen] = useState(false);
  const ate = useFetcher<typeof action>();
  const batchFetcher = useFetcher<typeof action>();

  return (
    <div className="relative mx-auto min-h-dvh max-w-[760px] pb-36">
      <div className="relative h-[320px]">
        <MealPhoto photoKey={photoKey} alt={meal.name} className="h-full w-full" />
        <div className="absolute left-4 top-[max(54px,env(safe-area-inset-top))]">
          <BackButton to="/" label="Back to Today" />
        </div>
        {slot && (
          <button type="button" onClick={() => setSwapOpen(true)} className="glass-on-image absolute right-4 top-[max(54px,env(safe-area-inset-top))] flex h-11 items-center gap-1.5 rounded-full px-4 text-[15px] font-semibold">
            <Icon name="swap" size={16} />
            Swap
          </button>
        )}
        {!photoKey && <PhotoButton />}
      </div>

      <main className="flex flex-col gap-5 px-4 pt-[22px]">
        <header className="px-1">
          {slot && (
            <div className="text-[15px] font-semibold capitalize text-label-2">
              {slot} · {slotTime}
            </div>
          )}
          <h1 className="mt-0.5 text-[30px] font-bold leading-tight">{meal.name}</h1>
          <div className="tabular mt-3 flex gap-2">
            <span className="flex h-[30px] items-center rounded-full px-3 text-[14px] font-semibold text-calories" style={{ background: "color-mix(in srgb, var(--calories) 16%, transparent)" }}>
              {meal.kcal} cal
            </span>
            <span className="flex h-[30px] items-center rounded-full px-3 text-[14px] font-semibold text-protein" style={{ background: "color-mix(in srgb, var(--protein) 16%, transparent)" }}>
              {meal.protein} g protein
            </span>
            <span className="flex h-[30px] items-center rounded-full bg-card px-3 text-[14px] font-semibold text-label-2">per portion</span>
          </div>
        </header>

        {batch && (
          <Card className="p-[18px]">
            <div className="text-[13px] font-semibold text-label-2">From your batch</div>
            <div className="tabular mt-1 text-[17px]">
              Put <strong className="text-[22px]">{batch.portionG} g</strong> cooked {mainProtein.name.toLowerCase()} on the scale
            </div>
            <div className="mt-1 text-[14px] text-label-2">{batch.portionsLeft} portion{batch.portionsLeft === 1 ? "" : "s"} left</div>
          </Card>
        )}

        <section className="flex flex-col gap-2">
          <div className="px-1 text-[13px] font-semibold text-label-2">COOKING FOR</div>
          <Segmented label="Cooking for" options={PORTIONS} value={portions} onChange={setPortions} />
        </section>

        <Card className="px-[18px] py-1">
          <div className="flex items-center justify-between pb-2 pt-3.5">
            <h2 className="text-[17px] font-semibold">Put on the scale</h2>
            <span className="text-[14px] text-label-2">{portions === 1 ? "1 portion" : `${portions} portions total`}</span>
          </div>
          {ingredients.map((i) => {
            const grams = scaleGrams(i.grams, portions);
            const each = i.eachG ? Math.round(grams / i.eachG) : null;
            return (
              <div key={i.food} className="flex items-center justify-between border-t-[0.5px] border-separator py-[13px]">
                <div>
                  <div className="text-[16px] font-medium">{i.name}</div>
                  <div className="text-[13px] text-label-3">{[i.state, i.note, each && i.eachLabel ? `about ${each} ${i.eachLabel}${each === 1 ? "" : "s"}` : null].filter(Boolean).join(" · ")}</div>
                </div>
                <div className="tabular text-[26px] font-bold">
                  {grams.toLocaleString()}
                  <span className="ml-0.5 text-[15px] font-semibold text-label-2">g</span>
                </div>
              </div>
            );
          })}
        </Card>

        {portions > 1 && (
          <Card className="flex flex-col gap-3 p-[18px]">
            <h2 className="text-[17px] font-semibold">After cooking</h2>
            <p className="text-[15px] leading-snug text-label-2">
              Put all the cooked {mainProtein.name.toLowerCase()} on the scale and enter the number. Rocky splits it into {portions} equal portions.
            </p>
            <batchFetcher.Form method="post" className="flex items-center gap-2">
              <input type="hidden" name="intent" value="batch" />
              <input type="hidden" name="portions" value={portions} />
              <label htmlFor="cooked" className="sr-only">
                Cooked weight, whole batch
              </label>
              <div className="flex h-[52px] flex-1 items-center gap-2 rounded-[14px] bg-fill px-3.5">
                <input id="cooked" name="cookedWeight" inputMode="numeric" placeholder="0" required className="tabular w-full min-w-0 bg-transparent text-[20px] font-semibold outline-none" />
                <span className="font-semibold text-label-2">g</span>
              </div>
              <button type="submit" className="btn-prominent h-[52px] rounded-full px-5 text-[16px] font-semibold">
                Split
              </button>
            </batchFetcher.Form>
            {batchFetcher.data && "ok" in batchFetcher.data && <p className="text-[14px] text-steps">Saved. The next {portions - 1} days will show your portion.</p>}
          </Card>
        )}

        <Card className="flex flex-col gap-3 p-[18px]">
          <h2 className="text-[17px] font-semibold">Steps</h2>
          <ol className="flex list-decimal flex-col gap-2.5 pl-5 text-[16px] leading-snug text-label">
            {meal.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </Card>
      </main>

      {slot && (
        <div className="glass-bar fixed inset-x-4 bottom-[max(28px,env(safe-area-inset-bottom))] z-20 mx-auto flex max-w-[728px] gap-2.5 rounded-[34px] p-1.5">
          <ate.Form method="post" className="flex-1">
            <input type="hidden" name="intent" value="ate" />
            <input type="hidden" name="slot" value={slot} />
            <button type="submit" disabled={logged} className="btn-prominent h-[54px] w-full rounded-full text-[17px] font-semibold disabled:opacity-60">
              {logged ? "Eaten" : ate.state !== "idle" ? "Saving..." : "Ate it"}
            </button>
          </ate.Form>
        </div>
      )}

      {slot && <SwapSheet open={swapOpen} onClose={() => setSwapOpen(false)} slot={slot} options={swapOptions} />}
    </div>
  );
}

function PhotoButton() {
  const fetcher = useFetcher();
  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), "image/jpeg", 0.85));
    const body = new FormData();
    body.set("intent", "photo");
    body.set("photo", new File([blob], "photo.jpg", { type: "image/jpeg" }));
    fetcher.submit(body, { method: "post", encType: "multipart/form-data" });
  }
  return (
    <label className="glass-on-image absolute bottom-4 right-4 flex h-10 cursor-pointer items-center gap-1.5 rounded-full px-3.5 text-[14px] font-semibold">
      <Icon name="camera" size={16} />
      {fetcher.state !== "idle" ? "Uploading..." : "Add photo"}
      <input type="file" accept="image/*" capture="environment" onChange={onChange} className="sr-only" />
    </label>
  );
}

function SwapSheet({ open, onClose, slot, options }: { open: boolean; onClose: () => void; slot: Slot; options: { slug: string; name: string; kcal: number; protein: number }[] }) {
  const [always, setAlways] = useState(false);
  const fetcher = useFetcher();
  return (
    <Sheet open={open} onClose={onClose} title="Swap meal">
      <Segmented
        label="Swap for"
        options={[
          { value: "today", label: "Just today" },
          { value: "always", label: "Always" },
        ]}
        value={always ? "always" : "today"}
        onChange={(v) => setAlways(v === "always")}
      />
      <p className="mt-2 px-1 text-[13px] text-label-2">{always ? "The current meal rests for 4 weeks." : "Only today's plan changes."}</p>
      <div className="mt-3 overflow-hidden rounded-[20px] bg-card">
        {options.map((m) => (
          <button
            key={m.slug}
            type="button"
            onClick={() => fetcher.submit({ intent: "swap", slot, to: m.slug, always: String(always) }, { method: "post" })}
            className="flex w-full items-center justify-between border-b-[0.5px] border-separator px-4 py-3 text-left last:border-b-0"
          >
            <span className="text-[16px] font-semibold">{m.name}</span>
            <span className="tabular text-[14px] text-label-2">
              {m.kcal} cal · {m.protein} g
            </span>
          </button>
        ))}
      </div>
    </Sheet>
  );
}
```

- [ ] **Step 4: Register the route** (inside the `layout(...)` children in `app/routes.ts`)

```ts
    route("meal/:slug", "routes/meal.tsx"),
```

- [ ] **Step 5: Run the test and make sure it passes**

Run: `npx vitest run --project workers tests/workers/meal-route.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Look at it**

Run: `npm run dev`, open a meal from Today.
Expected: matches the "Meal" mockup. The portion toggle updates every amount in place (220 g chicken becomes 440 and 660); "2 days" shows the After cooking card; Split saves and the next day's visit shows "From your batch"; Swap opens the sheet and switching replaces the meal; Add photo uploads (try from the iPhone on the local network or after deploy); Ate it returns to Today with a green check.

- [ ] **Step 7: Typecheck, full test run, commit, deploy**

Run: `npm run typecheck && npm test`
Expected: both pass.

```bash
git add -A
git commit -m "Build the Meal screen with portions, batches, swaps, and photos"
git push origin main
```
