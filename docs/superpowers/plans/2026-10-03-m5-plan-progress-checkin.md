# M5: Plan, Progress, Check-in, Groceries, Library, Settings Implementation Plan

> **For agentic workers:** implement this plan task-by-task with the `executing-plans` skill. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The weekly loop and the browsing screens: the Plan tab shows the phase and the week, Progress shows the weight trend and gains, the Sunday check-in applies the adjustment rules and sets up next week's meals and groceries, Library browses meals and exercises, and Settings manages reminders and shows the Shortcut setup.

**Architecture:** Two new server modules, `checkin.server.ts` and `progress.server.ts`, compose the M3 and M4 modules with M2's rules. Screens stay thin. The check-in window and "skipped" state feed back into Today.

**Tech Stack:** As M1.

**Prerequisite:** M1 to M4 complete.

**Visual reference:** mockup boards "Plan", "Progress", "Sunday check-in".

---

## File map

| Path | Responsibility |
|---|---|
| `app/server/targets.server.ts` (modify) | Base targets without the maintenance override |
| `app/server/checkin.server.ts` | Check-in window, week review, outcome, completion |
| `app/server/progress.server.ts` | Weight series, body and adherence tiles, strength gains |
| `app/server/settings.server.ts` | Reminder settings |
| `app/components/WeightChart.tsx` | Daily dots plus 7-day average line |
| `app/components/Toggle.tsx` | iOS-style switch |
| `app/routes/plan.tsx`, `progress.tsx`, `library.tsx`, `settings.tsx` (replace) | Tab screens and settings |
| `app/routes/check-in.tsx`, `app/routes/groceries.tsx` | Pushed screens |
| `app/server/day.server.ts`, `app/routes/today.tsx` (modify) | Check-in due and skipped cards |

---

### Task 1: Base targets

**Files:**
- Modify: `app/server/targets.server.ts`
- Test: `tests/workers/targets.test.ts` (add a case)

- [ ] **Step 1: Add the failing test** (append inside the existing `describe`)

```ts
  it("reports base targets without the maintenance bump", async () => {
    const { baseTargetsFor } = await import("~/server/targets.server");
    expect((await baseTargetsFor(db(), "2026-12-22")).kcal).toBe(2250);
  });
```

(The `2026-11-02` row from the earlier test in this file sets 2,250.)

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run --project workers tests/workers/targets.test.ts`
Expected: FAIL, `baseTargetsFor` is not a function.

- [ ] **Step 3: Implement** (replace `resolveTargets` and add two functions in `app/server/targets.server.ts`)

```ts
export function resolveBaseTargets(rows: TargetRow[], date: ISODate): Targets {
  let base: Targets = { ...plan.startingTargets };
  for (const r of rows) {
    if (r.effectiveFrom > date) break;
    base = { kcal: r.kcal, proteinG: r.proteinG, stepGoal: r.stepGoal };
  }
  return base;
}

export function resolveTargets(rows: TargetRow[], date: ISODate): Targets {
  const base = resolveBaseTargets(rows, date);
  return weekType(plan, date) === "maintenance" ? { ...base, kcal: plan.maintenanceKcal } : base;
}

export async function baseTargetsFor(db: Db, date: ISODate): Promise<Targets> {
  return resolveBaseTargets(await allTargets(db), date);
}

export async function setTargetsFrom(db: Db, effectiveFrom: ISODate, t: Targets): Promise<void> {
  await db
    .insert(targets)
    .values({ effectiveFrom, kcal: t.kcal, proteinG: t.proteinG, stepGoal: t.stepGoal })
    .onConflictDoUpdate({ target: targets.effectiveFrom, set: { kcal: t.kcal, proteinG: t.proteinG, stepGoal: t.stepGoal } });
}
```

- [ ] **Step 4: Run the test and make sure it passes**

Run: `npx vitest run --project workers tests/workers/targets.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add base targets and target updates"
```

---

### Task 2: Check-in module

**Files:**
- Create: `app/server/checkin.server.ts`
- Test: `tests/workers/checkin.test.ts`

The check-in reviews Monday to Sunday. It opens Sunday at 5pm and stays open until Monday noon (reviewing the week that just ended).

- [ ] **Step 1: Write the failing test**

```ts
// tests/workers/checkin.test.ts
import { between } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { meals } from "~/content";
import { checkIns, plannedMeals } from "~/db/schema";
import { addDays } from "~/domain/dates";
import { upsertSteps, logWeighIn } from "~/server/body.server";
import { checkInData, checkInWindow, completeCheckIn } from "~/server/checkin.server";
import { restedSlugs } from "~/server/meal-plan.server";
import { logOffPlan, logPlannedMeal } from "~/server/meals.server";
import { targetsFor } from "~/server/targets.server";
import { chicago, db } from "./helpers";

async function seedWeek(monday: string, startWeight: number, dailyLoss: number, onPlanDays: number) {
  for (let i = 0; i < 7; i++) {
    const date = addDays(monday, i);
    await logWeighIn(db(), date, Math.round((startWeight - dailyLoss * i) * 10) / 10, new Date());
    if (i < onPlanDays) {
      await logOffPlan(db(), date, { name: "Seed", category: "meal", kcal: 2300, proteinG: 185, relaxed: false }, new Date());
      await upsertSteps(db(), date, 7700, new Date());
    }
  }
}

describe("check-in window", () => {
  it("opens Sunday at 5pm and closes Monday at noon", () => {
    expect(checkInWindow(chicago("2026-10-18", "16:59"))).toBeNull();
    expect(checkInWindow(chicago("2026-10-18", "17:00"))).toBe("2026-10-12");
    expect(checkInWindow(chicago("2026-10-19", "11:59"))).toBe("2026-10-12");
    expect(checkInWindow(chicago("2026-10-19", "12:00"))).toBeNull();
  });
});

describe("check-in", () => {
  it("is too early with only one week of weigh-ins", async () => {
    await seedWeek("2026-09-28", 208.0, 0.15, 7);
    const data = await checkInData(db(), "2026-09-28");
    expect(data.outcome).toEqual({ kind: "too-early" });
  });

  it("summarizes the week and holds on pace", async () => {
    // Three weeks of weigh-ins give two weekly changes of about -1.0 lb, both weeks on plan.
    await seedWeek("2026-10-05", 207.0, 0.15, 7);
    await seedWeek("2026-10-12", 206.0, 0.15, 6);
    const chicken = meals.get("chicken-and-rice-bowl")!;
    for (const d of ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15"]) await logPlannedMeal(db(), d, "lunch", chicken, new Date());
    const data = await checkInData(db(), "2026-10-12");
    expect(data.adherence).toBe(6);
    expect(data.change).toBeCloseTo(-1.0, 1);
    expect(data.outcome).toEqual({ kind: "on-pace" });
    expect(data.avgSteps).toBe(6600);
    expect(data.mealCounts[0]).toEqual({ slug: "chicken-and-rice-bowl", name: chicken.name, count: 4, defaultRest: true });
  });

  it("applies targets, rests meals, plans next week, and records the check-in", async () => {
    await completeCheckIn(db(), "2026-10-12", { waist: 34.6, choice: "calories", rest: ["chicken-and-rice-bowl"] }, new Date());
    expect(await targetsFor(db(), "2026-10-19")).toEqual({ kcal: 2400, proteinG: 180, stepGoal: 7000 });
    expect(await restedSlugs(db(), "2026-10-19")).toContain("chicken-and-rice-bowl");
    const next = await db().select().from(plannedMeals).where(between(plannedMeals.date, "2026-10-19", "2026-10-25")).all();
    expect(next).toHaveLength(35);
    expect(next.map((r) => r.mealSlug)).not.toContain("chicken-and-rice-bowl");
    expect(await db().select().from(checkIns).all()).toHaveLength(1);
    expect((await checkInData(db(), "2026-10-12")).done).toBe(true);
  });

  it("ramps the step goal when the week averaged above it", async () => {
    // Oct 19 week: 7 on-plan days at 7,700 steps against a 7,000 goal
    await seedWeek("2026-10-19", 205.0, 0.15, 7);
    const data = await checkInData(db(), "2026-10-19");
    expect(data.rampedStepGoal).toBe(7500);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run --project workers tests/workers/checkin.test.ts`
Expected: FAIL, cannot resolve `~/server/checkin.server`.

- [ ] **Step 3: Implement**

```ts
// app/server/checkin.server.ts
import { and, between, eq, sql } from "drizzle-orm";
import { meals, plan } from "~/content";
import type { Db } from "~/db/client";
import { checkIns, mealLogs, plannedMeals } from "~/db/schema";
import { weekAdherence, weekIsOnPlan } from "~/domain/adherence";
import { decideAdjustment, type Adjustment } from "~/domain/adjustments";
import { isTrainingDay } from "~/domain/calendar";
import { addDays, localDate, localMinutes, weekStart, weekday } from "~/domain/dates";
import { generateWeek } from "~/domain/rotation";
import { rampStepGoal } from "~/domain/steps";
import type { ISODate } from "~/domain/types";
import { sevenDayAverage, weeklyChange } from "~/domain/weight";
import { logWaist, waistLogsAll, weighInsBetween } from "./body.server";
import { datesWithSets, dayResults } from "./history.server";
import { ensureWeekPlan, lastEaten, restMeal, restedSlugs } from "./meal-plan.server";
import { baseTargetsFor, setTargetsFrom } from "./targets.server";

export function checkInWindow(now: Date): ISODate | null {
  const today = localDate(now);
  const minutes = localMinutes(now);
  const wd = weekday(today);
  if (wd === 0 && minutes >= 17 * 60) return weekStart(today);
  if (wd === 1 && minutes < 12 * 60) return addDays(weekStart(today), -7);
  return null;
}

export async function checkInDone(db: Db, monday: ISODate): Promise<boolean> {
  return (await db.select().from(checkIns).where(eq(checkIns.weekStart, monday)).get()) !== undefined;
}

export interface CheckInData {
  weekStart: ISODate;
  weekEnd: ISODate;
  avgWeight: number | null;
  change: number | null;
  adherence: number;
  onPlan: boolean;
  workoutsDone: number;
  workoutsPlanned: number;
  optionalDone: number;
  avgSteps: number;
  stepGoal: number;
  rampedStepGoal: number;
  kcal: number;
  waist: number | null;
  outcome: Adjustment;
  mealCounts: { slug: string; name: string; count: number; defaultRest: boolean }[];
  preview: string[];
  done: boolean;
}

export async function checkInData(db: Db, monday: ISODate): Promise<CheckInData> {
  const sunday = addDays(monday, 6);
  const prevMonday = addDays(monday, -7);
  const weighIns = (await weighInsBetween(db, addDays(sunday, -20), sunday)).map((w) => ({ date: w.date, weight: w.weightLb }));
  const avgNow = sevenDayAverage(weighIns, sunday);
  const avgPrev = sevenDayAverage(weighIns, addDays(sunday, -7));
  const avgPrev2 = sevenDayAverage(weighIns, addDays(sunday, -14));

  const thisWeek = await dayResults(db, monday, sunday);
  const lastWeek = await dayResults(db, prevMonday, addDays(prevMonday, 6));
  const adherence = weekAdherence(thisWeek.map((d) => d.onPlan));
  const base = await baseTargetsFor(db, sunday);
  const outcome = decideAdjustment(
    [
      { change: weeklyChange(avgPrev, avgPrev2), onPlan: weekIsOnPlan(weekAdherence(lastWeek.map((d) => d.onPlan))) },
      { change: weeklyChange(avgNow, avgPrev), onPlan: weekIsOnPlan(adherence) },
    ],
    { kcal: base.kcal, stepGoal: base.stepGoal },
  );

  const setDates = await datesWithSets(db, monday, sunday);
  let workoutsDone = 0;
  let workoutsPlanned = 0;
  let optionalDone = 0;
  for (let i = 0; i < 7; i++) {
    const d = addDays(monday, i);
    if (isTrainingDay(plan, d)) {
      workoutsPlanned++;
      if (setDates.has(d)) workoutsDone++;
    } else if (setDates.has(d)) optionalDone++;
  }
  const avgSteps = Math.round(thisWeek.reduce((s, d) => s + d.steps, 0) / 7);

  const counts = await db
    .select({ slug: mealLogs.mealSlug, n: sql<number>`count(*)` })
    .from(mealLogs)
    .where(and(between(mealLogs.date, monday, sunday), eq(mealLogs.category, "planned")))
    .groupBy(mealLogs.mealSlug)
    .all();
  const mealCounts = counts
    .filter((c) => c.slug && meals.has(c.slug) && c.n >= 2)
    .map((c) => ({ slug: c.slug!, name: meals.get(c.slug!)!.name, count: c.n, defaultRest: c.n >= 3 }))
    .sort((a, b) => b.count - a.count);

  const nextMonday = addDays(monday, 7);
  const rested = [...(await restedSlugs(db, nextMonday)), ...mealCounts.filter((m) => m.defaultRest).map((m) => m.slug)];
  const eatenThisWeek = new Set(counts.map((c) => c.slug));
  const previewPlan = generateWeek({
    weekStart: nextMonday,
    meals: [...meals.values()].map((m) => ({ slug: m.slug, pool: m.pool, mode: m.mode, tags: m.tags })),
    lastEaten: await lastEaten(db, nextMonday),
    rested,
  });
  const preview = [...new Set(previewPlan.filter((p) => !eatenThisWeek.has(p.slug) && meals.get(p.slug)!.pool === "main").map((p) => meals.get(p.slug)!.name))].slice(0, 3);

  const waists = await waistLogsAll(db);
  return {
    weekStart: monday,
    weekEnd: sunday,
    avgWeight: avgNow,
    change: weeklyChange(avgNow, avgPrev),
    adherence,
    onPlan: weekIsOnPlan(adherence),
    workoutsDone,
    workoutsPlanned,
    optionalDone,
    avgSteps,
    stepGoal: base.stepGoal,
    rampedStepGoal: rampStepGoal(base.stepGoal, avgSteps),
    kcal: base.kcal,
    waist: waists.at(-1)?.inches ?? null,
    outcome,
    mealCounts,
    preview,
    done: await checkInDone(db, monday),
  };
}

export interface CheckInInput {
  waist: number | null;
  choice: "calories" | "steps";
  rest: string[];
}

export async function completeCheckIn(db: Db, monday: ISODate, input: CheckInInput, now: Date): Promise<void> {
  const data = await checkInData(db, monday);
  const nextMonday = addDays(monday, 7);
  const base = await baseTargetsFor(db, data.weekEnd);

  let kcal = base.kcal;
  let stepGoal = data.rampedStepGoal;
  if (data.outcome.kind === "slow") {
    if (input.choice === "steps" && data.outcome.newStepGoal !== null) stepGoal = data.outcome.newStepGoal;
    else kcal = data.outcome.newKcal;
  } else if (data.outcome.kind === "fast") {
    kcal = data.outcome.newKcal;
  }
  await setTargetsFrom(db, nextMonday, { kcal, proteinG: base.proteinG, stepGoal });

  if (input.waist !== null) await logWaist(db, data.weekEnd, input.waist);
  for (const slug of input.rest) if (meals.has(slug)) await restMeal(db, slug, addDays(nextMonday, 13));

  await db.delete(plannedMeals).where(between(plannedMeals.date, nextMonday, addDays(nextMonday, 6)));
  await ensureWeekPlan(db, nextMonday);

  await db
    .insert(checkIns)
    .values({
      weekStart: monday,
      avgWeight: data.avgWeight,
      change: data.change,
      adherence: data.adherence,
      outcome: JSON.stringify({ ...data.outcome, choice: input.choice, kcal, stepGoal }),
      completedAt: now.toISOString(),
    })
    .onConflictDoNothing();
}
```

- [ ] **Step 4: Run the test and make sure it passes**

Run: `npx vitest run --project workers tests/workers/checkin.test.ts`
Expected: PASS (5 tests).

Notes on the seeded numbers: each week loses 0.15 lb a day from a start 1 lb lower than the week before, so the Sunday 7-day averages are 207.6, 206.6, and 205.6 (checked with node on 2026-10-03), giving two changes of -1.0 (on pace, both weeks on plan). Six of seven days have 7,700 steps, so the average is 6,600 (below the 7,000 goal, so no ramp). The Oct 19 week averages 7,700, so 7,000 ramps to 7,500.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add the Sunday check-in module"
```

---

### Task 3: Progress module

**Files:**
- Create: `app/server/progress.server.ts`
- Test: `tests/workers/progress.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/workers/progress.test.ts
import { describe, expect, it } from "vitest";
import { addDays } from "~/domain/dates";
import { logWaist, logWeighIn } from "~/server/body.server";
import { nextPhotoDate, progressData } from "~/server/progress.server";
import { logSet } from "~/server/workouts.server";
import { db } from "./helpers";

describe("progress", () => {
  it("schedules progress photos every 4 weeks from the phase start", () => {
    expect(nextPhotoDate("2026-10-12")).toBe("2026-11-01");
    expect(nextPhotoDate("2026-11-01")).toBe("2026-11-01");
    expect(nextPhotoDate("2026-11-02")).toBe("2026-11-29");
  });

  it("builds the weight series, waist change, and strength gains", async () => {
    for (let i = 0; i < 14; i++) await logWeighIn(db(), addDays("2026-10-05", i), Math.round((207 - 0.13 * i) * 10) / 10, new Date());
    await logWaist(db(), "2026-10-04", 35.0);
    await logWaist(db(), "2026-10-18", 34.6);
    for (const [date, w] of [["2026-10-05", 50], ["2026-10-12", 55], ["2026-10-16", 60]] as const) {
      await logSet(db(), { date, templateId: "mon-chest-back-arms", position: 4, exerciseId: "preacher-curl", setNumber: 1, weightLb: w, reps: 10, clientId: crypto.randomUUID() }, new Date());
    }
    const p = await progressData(db(), "2026-10-18");
    expect(p.series).toHaveLength(14);
    expect(p.series[0]).toEqual({ date: "2026-10-05", weight: 207, avg: null });
    expect(p.series[13].avg).not.toBeNull();
    expect(p.latestAvg).toBe(p.series[13].avg);
    expect(p.waist).toEqual({ latest: 34.6, change: -0.4 });
    expect(p.strength[0]).toMatchObject({ name: "Preacher curl", from: 50, to: 60 });
    expect(p.nextPhoto).toBe("2026-11-01");
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run --project workers tests/workers/progress.test.ts`
Expected: FAIL, cannot resolve `~/server/progress.server`.

- [ ] **Step 3: Implement**

```ts
// app/server/progress.server.ts
import { asc, eq } from "drizzle-orm";
import { exerciseImage, exercises, plan } from "~/content";
import type { Db } from "~/db/client";
import { setLogs, workoutSessions } from "~/db/schema";
import { streak as streakFrom } from "~/domain/adherence";
import { isTrainingDay } from "~/domain/calendar";
import { addDays, daysBetween } from "~/domain/dates";
import type { ISODate } from "~/domain/types";
import { sevenDayAverage } from "~/domain/weight";
import { waistLogsAll, weighInsBetween } from "./body.server";
import { datesWithSets, dayResults } from "./history.server";
import { targetsFor } from "./targets.server";

export function nextPhotoDate(today: ISODate): ISODate {
  const first = addDays(plan.phaseStart, 27);
  if (today <= first) return first;
  const cycles = Math.ceil(daysBetween(first, today) / 28);
  return addDays(first, cycles * 28);
}

export interface ProgressData {
  series: { date: ISODate; weight: number | null; avg: number | null }[];
  latestAvg: number | null;
  changeSinceStart: number | null;
  waist: { latest: number; change: number | null } | null;
  daysOnPlan: number;
  daysTracked: number;
  streak: number;
  workoutsDone: number;
  workoutsPlanned: number;
  optionalDone: number;
  avgSteps: number;
  stepGoal: number;
  strength: { id: string; name: string; image: string; from: number; to: number }[];
  nextPhoto: ISODate;
}

export async function progressData(db: Db, today: ISODate): Promise<ProgressData> {
  const start = plan.phaseStart;
  const weighIns = (await weighInsBetween(db, addDays(start, -7), today)).map((w) => ({ date: w.date, weight: w.weightLb }));
  const byDate = new Map(weighIns.map((w) => [w.date, w.weight]));
  const lastWeighIn = weighIns.at(-1)?.date ?? start;
  const end = lastWeighIn > today ? today : lastWeighIn;
  const series = [];
  for (let i = 0; i <= Math.max(0, daysBetween(start, end)); i++) {
    const date = addDays(start, i);
    series.push({ date, weight: byDate.get(date) ?? null, avg: sevenDayAverage(weighIns, date) });
  }
  const avgs = series.map((s) => s.avg).filter((a): a is number => a !== null);
  const firstWeight = weighIns.find((w) => w.date >= start)?.weight ?? null;
  const latestAvg = avgs.at(-1) ?? null;

  const waists = await waistLogsAll(db);
  const waist = waists.length
    ? { latest: waists.at(-1)!.inches, change: waists.length > 1 ? Math.round((waists.at(-1)!.inches - waists[0].inches) * 10) / 10 : null }
    : null;

  const results = today > start ? await dayResults(db, start, addDays(today, -1)) : [];
  const [todayResult] = await dayResults(db, today, today);
  const setDates = await datesWithSets(db, start, today);
  let workoutsDone = 0;
  let workoutsPlanned = 0;
  let optionalDone = 0;
  for (let i = 0; i <= daysBetween(start, today); i++) {
    const d = addDays(start, i);
    if (isTrainingDay(plan, d)) {
      if (d < today || setDates.has(d)) workoutsPlanned++;
      if (setDates.has(d)) workoutsDone++;
    } else if (setDates.has(d)) optionalDone++;
  }
  const last7 = await dayResults(db, addDays(today, -7), addDays(today, -1));

  const sets = await db
    .select({ exerciseId: setLogs.exerciseId, weight: setLogs.weightLb, date: workoutSessions.date })
    .from(setLogs)
    .innerJoin(workoutSessions, eq(setLogs.sessionId, workoutSessions.id))
    .orderBy(asc(workoutSessions.date))
    .all();
  const topByExercise = new Map<string, Map<ISODate, number>>();
  for (const s of sets) {
    const days = topByExercise.get(s.exerciseId) ?? new Map<ISODate, number>();
    days.set(s.date, Math.max(days.get(s.date) ?? 0, s.weight));
    topByExercise.set(s.exerciseId, days);
  }
  const strength = [...topByExercise.entries()]
    .filter(([id, days]) => exercises.has(id) && days.size >= 2)
    .map(([id, days]) => {
      const values = [...days.values()];
      const ex = exercises.get(id)!;
      return { id, name: ex.name, image: exerciseImage(ex, 0), from: values[0], to: values.at(-1)! };
    })
    .filter((s) => s.to > s.from)
    .sort((a, b) => b.to - b.from - (a.to - a.from))
    .slice(0, 3);

  return {
    series,
    latestAvg,
    changeSinceStart: latestAvg !== null && firstWeight !== null ? Math.round((latestAvg - firstWeight) * 10) / 10 : null,
    waist,
    daysOnPlan: results.filter((r) => r.onPlan).length,
    daysTracked: results.length,
    streak: streakFrom(results, today, todayResult.onPlan),
    workoutsDone,
    workoutsPlanned,
    optionalDone,
    avgSteps: Math.round(last7.reduce((s, d) => s + d.steps, 0) / 7),
    stepGoal: (await targetsFor(db, today)).stepGoal,
    strength,
    nextPhoto: nextPhotoDate(today),
  };
}
```

- [ ] **Step 4: Run the test and make sure it passes**

Run: `npx vitest run --project workers tests/workers/progress.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add the progress module"
```

---

### Task 4: Shared components (chart, toggle)

**Files:**
- Create: `app/components/WeightChart.tsx`, `app/components/Toggle.tsx`

- [ ] **Step 1: Weight chart**

```tsx
// app/components/WeightChart.tsx
type Point = { date: string; weight: number | null; avg: number | null };

const W = 350;
const H = 170;
const LEFT = 34;
const TOP = 10;
const PLOT_H = 130;

export function WeightChart({ series }: { series: Point[] }) {
  const values = series.flatMap((p) => [p.weight, p.avg]).filter((v): v is number => v !== null);
  if (values.length < 2) return <p className="py-8 text-center text-[15px] text-label-2">Weigh in a few days to see your trend.</p>;
  const lo = Math.floor(Math.min(...values) - 0.5);
  const hi = Math.ceil(Math.max(...values) + 0.5);
  const x = (i: number) => LEFT + 5 + (i * (W - LEFT - 10)) / Math.max(1, series.length - 1);
  const y = (v: number) => TOP + ((hi - v) / (hi - lo)) * PLOT_H;
  const ticks = [hi, (hi + lo) / 2, lo].map((v) => Math.round(v));
  const avgPoints = series.map((p, i) => (p.avg !== null ? `${x(i)},${y(p.avg)}` : null)).filter(Boolean).join(" ");
  const lastAvgIndex = series.findLastIndex((p) => p.avg !== null);
  const label = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const summary = `Weight from ${label(series[0].date)} to ${label(series.at(-1)!.date)}. Latest 7-day average ${series[lastAvgIndex]?.avg ?? "not available"} pounds.`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={summary}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={LEFT} x2={W} y1={y(t)} y2={y(t)} stroke="var(--fill)" />
          <text x="0" y={y(t) + 4} fill="var(--label-3)" fontSize="11">
            {t}
          </text>
        </g>
      ))}
      {series.map((p, i) => (p.weight !== null ? <circle key={p.date} cx={x(i)} cy={y(p.weight)} r="3" fill="var(--label-3)" opacity="0.6" /> : null))}
      <polyline fill="none" stroke="var(--protein)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" points={avgPoints} />
      {lastAvgIndex >= 0 && <circle cx={x(lastAvgIndex)} cy={y(series[lastAvgIndex].avg!)} r="5" fill="var(--protein)" stroke="var(--card)" strokeWidth="2" />}
      <text x={x(0)} y={H - 8} fill="var(--label-3)" fontSize="11">
        {label(series[0].date)}
      </text>
      <text x={x(series.length - 1)} y={H - 8} fill="var(--label-3)" fontSize="11" textAnchor="end">
        {label(series.at(-1)!.date)}
      </text>
    </svg>
  );
}
```

`findLastIndex` needs ES2023 types. In `tsconfig.cloudflare.json`, change `"lib"` to `["DOM", "DOM.Iterable", "ES2023"]` (Safari has supported it since 15.4).

- [ ] **Step 2: Toggle**

```tsx
// app/components/Toggle.tsx
export function Toggle({ on, label, onChange, name }: { on: boolean; label: string; onChange?: (on: boolean) => void; name?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      name={name}
      onClick={() => onChange?.(!on)}
      className={`flex h-8 w-[52px] flex-none rounded-full p-0.5 transition-colors ${on ? "justify-end bg-steps" : "justify-start bg-fill"}`}
    >
      <span className="size-7 rounded-full bg-white shadow-[0_2px_6px_rgba(0,0,0,0.3)]" />
    </button>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "Add weight chart and toggle components"
```

---

### Task 5: Progress screen

**Files:**
- Modify: `app/routes/progress.tsx` (replace)

- [ ] **Step 1: Implement**

```tsx
// app/routes/progress.tsx
import { env } from "cloudflare:workers";
import type { Route } from "./+types/progress";
import { WeightChart } from "~/components/WeightChart";
import { Card, Icon, LargeTitle, Screen, SectionTitle } from "~/components/ui";
import { getDb } from "~/db/client";
import { localDate } from "~/domain/dates";
import { progressData } from "~/server/progress.server";

export function meta() {
  return [{ title: "Progress · Rocky" }];
}

export async function loader(_args: Route.LoaderArgs) {
  return { p: await progressData(getDb(env.DB), localDate()) };
}

const fmtDate = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });
const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "0");

export default function Progress({ loaderData }: Route.ComponentProps) {
  const { p } = loaderData;
  return (
    <Screen>
      <LargeTitle eyebrow="Since Oct 5" title="Progress" />

      <Card className="flex flex-col gap-2.5 p-[18px]">
        <div className="text-[13px] font-semibold">Weight · 7-day average</div>
        <div className="flex items-baseline gap-2.5">
          <div className="tabular text-[40px] font-bold">
            {p.latestAvg ?? "--"}
            <span className="ml-1 text-[18px] font-semibold text-label-2">lb</span>
          </div>
          {p.changeSinceStart !== null && <div className={`tabular text-[16px] font-semibold ${p.changeSinceStart <= 0 ? "text-steps" : "text-warn"}`}>{signed(p.changeSinceStart)} lb</div>}
        </div>
        <WeightChart series={p.series} />
        <div className="flex gap-[18px] text-[13px] text-label-2">
          <span className="flex items-center gap-1.5">
            <span aria-hidden="true" className="h-[3px] w-3.5 rounded-full bg-protein" />
            7-day average
          </span>
          <span className="flex items-center gap-1.5">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-label-3" />
            Daily weigh-in
          </span>
        </div>
        <p className="text-[14px] leading-snug text-label-2">Daily numbers bounce with water and salt. The blue line is the one that counts.</p>
      </Card>

      <div className="grid grid-cols-2 gap-2.5">
        <Tile label="Waist" value={p.waist ? `${p.waist.latest} in` : "--"} sub={p.waist?.change != null ? `${signed(p.waist.change)} in` : "Measure at check-in"} good={(p.waist?.change ?? 0) < 0} />
        <Tile label="Days on plan" value={`${p.daysOnPlan} of ${p.daysTracked}`} sub={`${p.streak} day streak`} />
        <Tile label="Workouts" value={`${p.workoutsDone} of ${p.workoutsPlanned}`} sub={p.optionalDone ? `+${p.optionalDone} optional` : "Mon, Wed, Fri"} />
        <Tile label="Avg steps" value={p.avgSteps.toLocaleString()} sub={`goal ${p.stepGoal.toLocaleString()}`} good={p.avgSteps >= p.stepGoal} />
      </div>

      {p.strength.length > 0 && (
        <section className="flex flex-col gap-2">
          <SectionTitle>Getting stronger</SectionTitle>
          <Card className="overflow-hidden">
            {p.strength.map((s) => (
              <div key={s.id} className="flex items-center gap-3 border-b-[0.5px] border-separator px-3.5 py-3 last:border-b-0">
                <img src={s.image} alt="" className="size-12 flex-none rounded-xl object-cover" />
                <div className="flex-1 text-[16px] font-medium">{s.name}</div>
                <div className="tabular text-[16px] font-semibold">
                  <span className="font-medium text-label-3">{s.from} →</span> {s.to} lb
                </div>
              </div>
            ))}
          </Card>
        </section>
      )}

      <Card className="flex items-center justify-between px-[18px] py-4">
        <div>
          <div className="text-[16px] font-semibold">Progress photos</div>
          <div className="mt-px text-[14px] text-label-2">Next round: {fmtDate(p.nextPhoto)}</div>
        </div>
        <span className="text-label-2">
          <Icon name="camera" size={22} strokeWidth={1.8} />
        </span>
      </Card>
    </Screen>
  );
}

function Tile({ label, value, sub, good }: { label: string; value: string; sub: string; good?: boolean }) {
  return (
    <div className="rounded-[20px] bg-card p-4">
      <div className="text-[13px] font-semibold">{label}</div>
      <div className="tabular mt-1 text-[24px] font-bold">{value}</div>
      <div className={`mt-px text-[14px] ${good ? "font-semibold text-steps" : "text-label-2"}`}>{sub}</div>
    </div>
  );
}
```

- [ ] **Step 2: Look at it, then commit**

Run: `npm run dev`, open Progress. Expected: matches the "Progress" mockup (with real data, or the empty-state message before 2 weigh-ins).

```bash
git add -A
git commit -m "Build the Progress screen"
```

---

### Task 6: Plan screen

**Files:**
- Modify: `app/routes/plan.tsx` (replace)

- [ ] **Step 1: Implement**

```tsx
// app/routes/plan.tsx
import { env } from "cloudflare:workers";
import { useState } from "react";
import { Link } from "react-router";
import type { Route } from "./+types/plan";
import { Card, Icon, LargeTitle, Screen, SectionTitle } from "~/components/ui";
import { plan } from "~/content";
import { getDb } from "~/db/client";
import { dayMode, optionalTemplateFor, templateFor, weekNumber, weekType } from "~/domain/calendar";
import { addDays, localDate, weekStart } from "~/domain/dates";
import { resolveTemplate } from "~/server/workouts.server";
import { targetsFor } from "~/server/targets.server";

export function meta() {
  return [{ title: "Plan · Rocky" }];
}

export async function loader(_args: Route.LoaderArgs) {
  const db = getDb(env.DB);
  const today = localDate();
  const monday = weekStart(today);
  const days = await Promise.all(
    Array.from({ length: 7 }, async (_, i) => {
      const date = addDays(monday, i);
      const templateId = templateFor(plan, date);
      const optionalId = optionalTemplateFor(plan, date);
      return {
        date,
        today: date === today,
        templateId,
        name: templateId ? plan.templates[templateId]!.name : null,
        optional: optionalId ? plan.templates[optionalId]!.name : null,
        mode: dayMode(date),
        exercises: templateId ? (await resolveTemplate(db, templateId, date)).map((s) => s.exercise.name) : [],
      };
    }),
  );
  const current = weekNumber(plan, today);
  return {
    current,
    weeks: Array.from({ length: 13 }, (_, i) => ({ n: i + 1, type: weekType(plan, addDays(plan.phaseStart, i * 7)) })),
    targets: await targetsFor(db, today),
    days,
    monday,
  };
}

const DOW = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const short = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export default function Plan({ loaderData }: Route.ComponentProps) {
  const { current, weeks, targets, days, monday } = loaderData;
  const [open, setOpen] = useState<string | null>(null);
  const left = Math.max(0, 13 - current);
  return (
    <Screen>
      <LargeTitle eyebrow="Phase 1 · Oct 5 to Jan 1" title="Plan" />

      <Card className="flex flex-col gap-3.5 p-[18px]">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[17px] font-semibold">{current >= 1 ? `Week ${Math.min(current, 13)} of 13` : "Starts Oct 5"}</h2>
          <span className="text-[14px] text-label-2">{left > 0 ? `${left} weeks to Jan 1` : "Checkpoint"}</span>
        </div>
        <div className="grid gap-[3px]" style={{ gridTemplateColumns: "repeat(13, minmax(0, 1fr))" }} aria-hidden="true">
          {weeks.map((w) => (
            <div
              key={w.n}
              className="h-[30px] rounded-md"
              style={{
                background:
                  w.n === current ? "var(--label)" : w.n < current ? "var(--label-3)" : w.type === "deload" ? "color-mix(in srgb, var(--protein) 35%, transparent)" : w.type === "maintenance" ? "color-mix(in srgb, var(--steps) 35%, transparent)" : "var(--fill)",
                boxShadow: w.type === "checkpoint" ? "inset 0 0 0 1.5px var(--label)" : undefined,
              }}
            />
          ))}
        </div>
        <ul className="flex flex-col gap-2 text-[14px] text-label-2">
          <li className="flex items-center gap-2.5">
            <span aria-hidden="true" className="size-3 rounded" style={{ background: "color-mix(in srgb, var(--protein) 60%, transparent)" }} />
            Week 8 · Deload, Thanksgiving Nov 26
          </li>
          <li className="flex items-center gap-2.5">
            <span aria-hidden="true" className="size-3 rounded" style={{ background: "color-mix(in srgb, var(--steps) 60%, transparent)" }} />
            Week 12 · Maintenance, Christmas Dec 25
          </li>
          <li className="flex items-center gap-2.5">
            <span aria-hidden="true" className="size-3 rounded shadow-[inset_0_0_0_1.5px_var(--label)]" />
            Week 13 · Jan 1 checkpoint
          </li>
        </ul>
      </Card>

      <div className="grid grid-cols-3 gap-2.5">
        <Target label="Calories" value={targets.kcal.toLocaleString()} color="text-calories" />
        <Target label="Protein" value={`${targets.proteinG} g`} color="text-protein" />
        <Target label="Steps" value={targets.stepGoal.toLocaleString()} color="text-steps" />
      </div>

      <section className="flex flex-col gap-2">
        <SectionTitle right={`${short(monday)} to ${short(addDays(monday, 6))}`}>This week</SectionTitle>
        <Card className="overflow-hidden">
          {days.map((d) => {
            const dow = new Date(`${d.date}T12:00:00Z`).getUTCDay();
            const isSunday = dow === 0;
            const body = (
              <>
                <div className={`flex size-11 flex-none flex-col items-center justify-center rounded-full leading-none ${d.today ? "bg-label text-bg" : "bg-fill"}`}>
                  <span className={`text-[10px] font-bold ${d.today ? "" : "text-label-2"}`}>{DOW[dow]}</span>
                  <span className="text-[17px] font-bold">{Number(d.date.slice(8))}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className={`text-[16px] font-semibold ${d.name ? "" : "text-label-2"}`}>{d.name ?? (d.optional ? "Rest or optional" : "Rest")}</div>
                  <div className={`mt-px text-[14px] ${isSunday ? "font-semibold text-label" : "text-label-2"}`}>
                    {d.name ? `${d.today ? "Today · " : ""}${d.exercises.length} exercises` : d.optional ? `${d.optional}, 30 min` : isSunday ? "Check-in tonight" : d.mode === "weekend" ? "Weekend mode · meat-first whole foods" : ""}
                  </div>
                  {open === d.date && d.exercises.length > 0 && (
                    <ul className="mt-2 flex flex-col gap-1 text-[14px] text-label-2">
                      {d.exercises.map((e) => (
                        <li key={e}>{e}</li>
                      ))}
                    </ul>
                  )}
                </div>
                {isSunday && (
                  <span className="text-label-3">
                    <Icon name="chevron" size={18} strokeWidth={2.4} />
                  </span>
                )}
              </>
            );
            const cls = "flex w-full items-center gap-3.5 border-b-[0.5px] border-separator px-4 py-3 text-left last:border-b-0";
            return isSunday ? (
              <Link key={d.date} to="/check-in" className={cls}>
                {body}
              </Link>
            ) : (
              <button key={d.date} type="button" onClick={() => setOpen(open === d.date ? null : d.date)} className={cls} aria-expanded={open === d.date}>
                {body}
              </button>
            );
          })}
        </Card>
      </section>
    </Screen>
  );
}

function Target({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-[20px] bg-card p-3.5">
      <div className="text-[13px] font-semibold">{label}</div>
      <div className={`tabular mt-0.5 text-[22px] font-bold ${color}`}>{value}</div>
    </div>
  );
}
```

- [ ] **Step 2: Look at it, then commit**

Run: `npm run dev`, open Plan. Expected: matches the "Plan" mockup; tapping a training day expands its exercise list; Sunday links to the check-in.

```bash
git add -A
git commit -m "Build the Plan screen"
```

---

### Task 7: Check-in and groceries screens

**Files:**
- Create: `app/routes/check-in.tsx`, `app/routes/groceries.tsx`
- Modify: `app/routes.ts`
- Test: `tests/workers/checkin-route.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/workers/checkin-route.test.ts
import { describe, expect, it } from "vitest";
import { action as checkInAction, loader as checkInLoader } from "~/routes/check-in";
import { action as groceryAction, loader as groceryLoader } from "~/routes/groceries";
import { post, routeArgs } from "./helpers";

describe("check-in route", () => {
  it("loads a given week", async () => {
    const data = await checkInLoader(routeArgs(new Request("http://localhost/check-in?week=2026-10-12")));
    expect(data.data.weekStart).toBe("2026-10-12");
  });

  it("completes and redirects to groceries for next week", async () => {
    const res = (await checkInAction(routeArgs(post("http://localhost/check-in", { week: "2026-10-12", waist: "34.6", choice: "calories" })))) as Response;
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/groceries?week=2026-10-19");
  });
});

describe("groceries route", () => {
  it("builds the list for a week and checks items off", async () => {
    const data = await groceryLoader(routeArgs(new Request("http://localhost/groceries?week=2026-10-19")));
    expect(data.groups.length).toBeGreaterThan(0);
    const first = data.groups[0].items[0];
    await groceryAction(routeArgs(post("http://localhost/groceries", { week: "2026-10-19", food: first.foodId, checked: "true" })));
    const again = await groceryLoader(routeArgs(new Request("http://localhost/groceries?week=2026-10-19")));
    expect(again.checked).toContain(first.foodId);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run --project workers tests/workers/checkin-route.test.ts`
Expected: FAIL, cannot resolve `~/routes/check-in`.

- [ ] **Step 3: Check-in route**

```tsx
// app/routes/check-in.tsx
import { env } from "cloudflare:workers";
import { useState } from "react";
import { Form, redirect } from "react-router";
import type { Route } from "./+types/check-in";
import { Segmented } from "~/components/Segmented";
import { Toggle } from "~/components/Toggle";
import { BackButton, Card, LargeTitle, Screen, SectionTitle } from "~/components/ui";
import { getDb } from "~/db/client";
import { addDays, localDate, weekStart } from "~/domain/dates";
import { checkInData, checkInWindow, completeCheckIn } from "~/server/checkin.server";

export const handle = { hideTabBar: true };

export function meta() {
  return [{ title: "Sunday check-in · Rocky" }];
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export async function loader({ request }: Route.LoaderArgs) {
  const param = new URL(request.url).searchParams.get("week");
  const monday = param && ISO.test(param) ? weekStart(param) : (checkInWindow(new Date()) ?? weekStart(localDate()));
  return { data: await checkInData(getDb(env.DB), monday) };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const week = String(form.get("week"));
  if (!ISO.test(week)) return { error: "Bad week" };
  const waist = form.get("waist") ? Number(form.get("waist")) : null;
  await completeCheckIn(
    getDb(env.DB),
    week,
    {
      waist: waist !== null && Number.isFinite(waist) && waist > 20 && waist < 60 ? Math.round(waist * 10) / 10 : null,
      choice: form.get("choice") === "steps" ? "steps" : "calories",
      rest: form.getAll("rest").map(String),
    },
    new Date(),
  );
  return redirect(`/groceries?week=${addDays(week, 7)}`);
}

const short = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "0");

function callText(d: Route.ComponentProps["loaderData"]["data"], choice: "calories" | "steps") {
  const lost = d.change !== null ? `${d.change <= 0 ? "Down" : "Up"} ${Math.abs(d.change)} lb with ${d.adherence} of 7 days on plan.` : "";
  const steps = d.rampedStepGoal > d.stepGoal ? ` Steps go to ${d.rampedStepGoal.toLocaleString()} next week.` : "";
  switch (d.outcome.kind) {
    case "too-early":
      return "Too early to adjust. Keep going, we need two weeks of weigh-ins." + steps;
    case "tighten-up":
      return `${lost} Numbers stay put. Tighten up the plan first.`;
    case "slow":
      return choice === "steps" && d.outcome.newStepGoal
        ? `${lost} Two slow weeks. Steps go to ${d.outcome.newStepGoal.toLocaleString()}, calories stay at ${d.kcal.toLocaleString()}.`
        : `${lost} Two slow weeks. Calories go to ${d.outcome.newKcal.toLocaleString()}.` + steps;
    case "fast":
      return `${lost} Losing faster than 2 lb a week. Calories go up to ${d.outcome.newKcal.toLocaleString()} to protect muscle.` + steps;
    case "on-pace":
      return `On pace. ${lost} Numbers stay put: ${d.kcal.toLocaleString()} cal and 180 g protein.` + steps;
  }
}

export default function CheckIn({ loaderData }: Route.ComponentProps) {
  const d = loaderData.data;
  const [choice, setChoice] = useState<"calories" | "steps">("calories");
  const [rest, setRest] = useState<string[]>(d.mealCounts.filter((m) => m.defaultRest).map((m) => m.slug));

  return (
    <Screen>
      <BackButton to="/plan" label="Back to Plan" />
      <LargeTitle eyebrow={`Week of ${short(d.weekStart)} to ${short(d.weekEnd)}`} title="Sunday check-in" />
      {d.done && <Card className="px-[18px] py-3.5 text-[15px] font-semibold text-steps">Done for this week. Changes start Monday.</Card>}

      <Form method="post" className="flex flex-col gap-5">
        <input type="hidden" name="week" value={d.weekStart} />
        <input type="hidden" name="choice" value={choice} />
        {rest.map((slug) => (
          <input key={slug} type="hidden" name="rest" value={slug} />
        ))}

        <section className="flex flex-col gap-2">
          <SectionTitle>How the week went</SectionTitle>
          <div className="grid grid-cols-2 gap-2.5">
            <Tile label="7-day average" value={d.avgWeight !== null ? `${d.avgWeight} lb` : "--"} sub={d.change !== null ? `${signed(d.change)} vs last week` : "Not enough weigh-ins"} good={(d.change ?? 0) < 0} />
            <Tile label="Days on plan" value={`${d.adherence} of 7`} sub={d.onPlan ? "On plan" : "Below 6 of 7"} good={d.onPlan} />
            <Tile label="Workouts" value={`${d.workoutsDone} of ${d.workoutsPlanned}`} sub={d.optionalDone ? `+${d.optionalDone} optional` : "Mon, Wed, Fri"} good={d.workoutsDone >= d.workoutsPlanned} />
            <Tile label="Avg steps" value={d.avgSteps.toLocaleString()} sub={`goal ${d.stepGoal.toLocaleString()}`} good={d.avgSteps >= d.stepGoal} />
          </div>
          <Card className="flex items-center justify-between gap-3 px-4 py-3.5">
            <label htmlFor="waist" className="text-[16px] font-medium">
              Waist, at the belly button
            </label>
            <div className="flex h-11 w-[120px] items-center gap-1.5 rounded-xl bg-fill px-3">
              <input id="waist" name="waist" inputMode="decimal" defaultValue={d.waist ?? ""} className="tabular w-full min-w-0 bg-transparent text-right text-[18px] font-semibold outline-none" />
              <span className="font-semibold text-label-2">in</span>
            </div>
          </Card>
        </section>

        <Card className="flex items-start gap-3 px-[18px] py-4">
          <div aria-hidden="true" className="flex size-[34px] flex-none items-center justify-center rounded-full bg-fill text-[15px] font-bold">
            R
          </div>
          <div className="flex-1">
            <div className="text-[13px] font-semibold text-label-2">Rocky's call</div>
            <p className="mt-0.5 text-[16px] leading-snug">{callText(d, choice)}</p>
            {d.outcome.kind === "slow" && d.outcome.newStepGoal !== null && (
              <div className="mt-3">
                <Segmented
                  label="Adjustment"
                  options={[
                    { value: "calories", label: "Cut 150 cal" },
                    { value: "steps", label: "Add 1,000 steps" },
                  ]}
                  value={choice}
                  onChange={setChoice}
                />
              </div>
            )}
          </div>
        </Card>

        <section className="flex flex-col gap-2">
          <SectionTitle>Next week's meals</SectionTitle>
          <p className="px-1 text-[14px] leading-snug text-label-2">Tired of something? Rest it and Rocky keeps it off the menu for two weeks.</p>
          {d.mealCounts.length > 0 ? (
            <Card className="overflow-hidden">
              {d.mealCounts.map((m) => (
                <div key={m.slug} className="flex items-center gap-3 border-b-[0.5px] border-separator px-4 py-3 last:border-b-0">
                  <div className="min-w-0 flex-1">
                    <div className="text-[16px] font-semibold">{m.name}</div>
                    <div className={`mt-px text-[14px] ${m.count >= 3 ? "font-semibold text-warn" : "text-label-2"}`}>Eaten {m.count} times this week</div>
                  </div>
                  <Toggle on={rest.includes(m.slug)} label={`Rest ${m.name}`} onChange={(on) => setRest((r) => (on ? [...r, m.slug] : r.filter((s) => s !== m.slug)))} />
                </div>
              ))}
            </Card>
          ) : (
            <Card className="px-4 py-3.5 text-[15px] text-label-2">No repeats this week. Nice variety.</Card>
          )}
          {d.preview.length > 0 && (
            <>
              <div className="px-1 pt-2 text-[15px] font-semibold">New this week</div>
              <div className="flex flex-wrap gap-2">
                {d.preview.map((name) => (
                  <span key={name} className="flex h-9 items-center rounded-full bg-card px-3.5 text-[14px] font-semibold">
                    {name}
                  </span>
                ))}
              </div>
            </>
          )}
        </section>

        <div className="glass-bar fixed inset-x-4 bottom-[max(28px,env(safe-area-inset-bottom))] z-20 mx-auto max-w-[728px] rounded-[34px] p-1.5">
          <button type="submit" className="btn-prominent h-[54px] w-full rounded-full text-[17px] font-semibold">
            {d.done ? "Redo check-in" : "Finish check-in"}
          </button>
        </div>
      </Form>
    </Screen>
  );
}

function Tile({ label, value, sub, good }: { label: string; value: string; sub: string; good?: boolean }) {
  return (
    <div className="rounded-[20px] bg-card p-4">
      <div className="text-[13px] font-semibold">{label}</div>
      <div className="tabular mt-1 text-[24px] font-bold">{value}</div>
      <div className={`mt-px text-[14px] ${good ? "font-semibold text-steps" : "text-label-2"}`}>{sub}</div>
    </div>
  );
}
```

- [ ] **Step 4: Groceries route**

```tsx
// app/routes/groceries.tsx
import { env } from "cloudflare:workers";
import { and, between, eq } from "drizzle-orm";
import { useFetcher } from "react-router";
import type { Route } from "./+types/groceries";
import { BackButton, Card, LargeTitle, Screen, SectionTitle } from "~/components/ui";
import { foods, meals } from "~/content";
import { getDb } from "~/db/client";
import { groceryChecks, plannedMeals } from "~/db/schema";
import { addDays, localDate, weekStart } from "~/domain/dates";
import { buildGroceryList, SECTION_LABEL } from "~/domain/groceries";
import { ensureWeekPlan } from "~/server/meal-plan.server";

export const handle = { hideTabBar: true };

export function meta() {
  return [{ title: "Groceries · Rocky" }];
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export async function loader({ request }: Route.LoaderArgs) {
  const db = getDb(env.DB);
  const param = new URL(request.url).searchParams.get("week");
  const monday = param && ISO.test(param) ? weekStart(param) : weekStart(localDate());
  await ensureWeekPlan(db, monday);
  const planned = await db.select().from(plannedMeals).where(between(plannedMeals.date, monday, addDays(monday, 6))).all();
  const ingredients = new Map([...meals.values()].map((m) => [m.slug, m.ingredients.map((i) => ({ foodId: i.food, grams: i.grams }))]));
  const groups = buildGroceryList(planned.map((p) => p.mealSlug), ingredients, new Map([...foods].map(([id, f]) => [id, { name: f.name, section: f.section }])));
  const checked = (await db.select().from(groceryChecks).where(eq(groceryChecks.weekStart, monday)).all()).map((c) => c.foodId);
  return { monday, groups: groups.map((g) => ({ ...g, label: SECTION_LABEL[g.section] })), checked };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const week = String(form.get("week"));
  const food = String(form.get("food"));
  if (!ISO.test(week) || !foods.has(food)) return { error: "Bad request" };
  const db = getDb(env.DB);
  if (form.get("checked") === "true") await db.insert(groceryChecks).values({ weekStart: week, foodId: food }).onConflictDoNothing();
  else await db.delete(groceryChecks).where(and(eq(groceryChecks.weekStart, week), eq(groceryChecks.foodId, food)));
  return { ok: true };
}

const short = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export default function Groceries({ loaderData }: Route.ComponentProps) {
  const { monday, groups, checked } = loaderData;
  const count = groups.reduce((n, g) => n + g.items.length, 0);
  return (
    <Screen>
      <BackButton to="/" label="Back to Today" />
      <LargeTitle eyebrow={`Week of ${short(monday)} · ${count} items`} title="Groceries" />
      {groups.map((g) => (
        <section key={g.section} className="flex flex-col gap-2">
          <SectionTitle>{g.label}</SectionTitle>
          <Card className="overflow-hidden">
            {g.items.map((i) => (
              <GroceryRow key={i.foodId} week={monday} foodId={i.foodId} name={i.name} grams={i.grams} checked={checked.includes(i.foodId)} />
            ))}
          </Card>
        </section>
      ))}
    </Screen>
  );
}

function GroceryRow({ week, foodId, name, grams, checked }: { week: string; foodId: string; name: string; grams: number; checked: boolean }) {
  const fetcher = useFetcher();
  const on = fetcher.formData ? fetcher.formData.get("checked") === "true" : checked;
  return (
    <button
      type="button"
      onClick={() => fetcher.submit({ week, food: foodId, checked: String(!on) }, { method: "post" })}
      className="flex w-full items-center gap-3 border-b-[0.5px] border-separator px-4 py-3 text-left last:border-b-0"
      aria-pressed={on}
    >
      <span className={`flex size-6 flex-none items-center justify-center rounded-full border-2 ${on ? "border-steps bg-steps" : "border-separator"}`} />
      <span className={`flex-1 text-[16px] ${on ? "text-label-3 line-through" : ""}`}>{name}</span>
      <span className="tabular text-[15px] text-label-2">{grams >= 1000 ? `${(grams / 1000).toFixed(1)} kg` : `${grams} g`}</span>
    </button>
  );
}
```

- [ ] **Step 5: Register both routes** (inside `layout(...)`)

```ts
    route("check-in", "routes/check-in.tsx"),
    route("groceries", "routes/groceries.tsx"),
```

- [ ] **Step 6: Run the test and make sure it passes**

Run: `npx vitest run --project workers tests/workers/checkin-route.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Build the check-in and groceries screens"
```

---

### Task 8: Library screen

**Files:**
- Modify: `app/routes/library.tsx` (replace)

- [ ] **Step 1: Implement**

```tsx
// app/routes/library.tsx
import { env } from "cloudflare:workers";
import { Link, useSearchParams } from "react-router";
import type { Route } from "./+types/library";
import { MealPhoto } from "~/components/MealPhoto";
import { Segmented } from "~/components/Segmented";
import { Card, LargeTitle, Screen, SectionTitle } from "~/components/ui";
import { exerciseImage, exercises, meals, plan } from "~/content";
import { getDb } from "~/db/client";
import { mealState } from "~/db/schema";
import { localDate } from "~/domain/dates";

export function meta() {
  return [{ title: "Library · Rocky" }];
}

const GROUP_LABEL: Record<string, string> = {
  chest: "Chest", back: "Back", biceps: "Biceps", triceps: "Triceps", quads: "Quads", hamstrings: "Hamstrings",
  "shoulder-press": "Shoulder press", "side-delts": "Side delts", "rear-delts": "Rear delts",
};
const POOL_LABEL: Record<string, string> = { breakfast: "Breakfasts", main: "Lunch and dinner", snack: "Snacks", dessert: "Desserts" };

export async function loader(_args: Route.LoaderArgs) {
  const state = await getDb(env.DB).select().from(mealState).all();
  const today = localDate();
  const usedBy = new Map<string, string[]>();
  for (const t of Object.values(plan.templates)) for (const e of t.exercises) usedBy.set(e.exercise, [...(usedBy.get(e.exercise) ?? []), t.name]);
  return {
    meals: [...meals.values()].map((m) => {
      const s = state.find((x) => x.slug === m.slug);
      return { slug: m.slug, name: m.name, pool: m.pool, mode: m.mode, kcal: m.kcal, protein: m.protein, photoKey: s?.photoKey ?? null, rested: !!s?.restedUntil && s.restedUntil >= today };
    }),
    exercises: [...exercises.values()].map((e) => ({ id: e.id, name: e.name, group: e.group, equipment: e.equipment, image: exerciseImage(e, 0), usedBy: usedBy.get(e.id) ?? [] })),
  };
}

export default function Library({ loaderData }: Route.ComponentProps) {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "exercises" ? "exercises" : "meals";
  const q = (params.get("q") ?? "").toLowerCase();
  const setParam = (k: string, v: string) => setParams((p) => (p.set(k, v), p), { replace: true });

  return (
    <Screen>
      <LargeTitle title="Library" />
      <Segmented label="Library section" options={[{ value: "meals", label: "Meals" }, { value: "exercises", label: "Exercises" }]} value={tab} onChange={(v) => setParam("tab", v)} />
      <label className="sr-only" htmlFor="q">
        Search
      </label>
      <input id="q" value={params.get("q") ?? ""} onChange={(e) => setParam("q", e.target.value)} placeholder="Search" className="h-11 rounded-xl bg-fill px-4 text-[17px] outline-none" />

      {tab === "meals"
        ? (["breakfast", "main", "snack", "dessert"] as const).map((pool) => {
            const list = loaderData.meals.filter((m) => m.pool === pool && m.name.toLowerCase().includes(q));
            if (list.length === 0) return null;
            return (
              <section key={pool} className="flex flex-col gap-2">
                <SectionTitle>{POOL_LABEL[pool]}</SectionTitle>
                <Card className="overflow-hidden">
                  {list.map((m) => (
                    <Link key={m.slug} to={`/meal/${m.slug}`} className="flex items-center gap-3 border-b-[0.5px] border-separator px-3.5 py-3 last:border-b-0">
                      <MealPhoto photoKey={m.photoKey} alt="" className="size-12 flex-none rounded-xl" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[16px] font-semibold">{m.name}</div>
                        <div className="tabular text-[13px] text-label-2">
                          {m.kcal} cal · {m.protein} g{m.mode === "weekend" ? " · weekends" : ""}
                          {m.rested ? " · resting" : ""}
                        </div>
                      </div>
                    </Link>
                  ))}
                </Card>
              </section>
            );
          })
        : Object.entries(GROUP_LABEL).map(([group, label]) => {
            const list = loaderData.exercises.filter((e) => e.group === group && e.name.toLowerCase().includes(q));
            if (list.length === 0) return null;
            return (
              <section key={group} className="flex flex-col gap-2">
                <SectionTitle>{label}</SectionTitle>
                <Card className="overflow-hidden">
                  {list.map((e) => (
                    <div key={e.id} className="flex items-center gap-3 border-b-[0.5px] border-separator px-3.5 py-3 last:border-b-0">
                      <img src={e.image} alt="" className="size-12 flex-none rounded-xl object-cover" />
                      <div className="min-w-0 flex-1">
                        <div className="text-[16px] font-semibold">{e.name}</div>
                        <div className="text-[13px] capitalize text-label-2">
                          {e.equipment.replace("-", " ")}
                          {e.usedBy.length ? ` · ${e.usedBy.join(", ")}` : ""}
                        </div>
                      </div>
                    </div>
                  ))}
                </Card>
              </section>
            );
          })}
    </Screen>
  );
}
```

- [ ] **Step 2: Look at it, then commit**

Run: `npm run dev`, open Library. Expected: Meals grouped by pool with photos or placeholders and resting labels; Exercises grouped by muscle with photos; search filters both; opening a meal from Library shows it without the "Ate it" bar unless it is planned today.

```bash
git add -A
git commit -m "Build the Library screen"
```

---

### Task 9: Settings (reminders and Shortcut setup)

**Files:**
- Create: `app/server/settings.server.ts`
- Modify: `app/routes/settings.tsx` (replace)
- Test: `tests/workers/settings.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/workers/settings.test.ts
import { describe, expect, it } from "vitest";
import { reminderSettings, saveReminder } from "~/server/settings.server";
import { db } from "./helpers";

describe("reminder settings", () => {
  it("returns defaults for every reminder until changed", async () => {
    const all = await reminderSettings(db());
    expect(all).toHaveLength(10);
    expect(all.find((r) => r.kind === "weigh-in")).toMatchObject({ enabled: true, time: "07:30" });
  });

  it("saves a change", async () => {
    await saveReminder(db(), { kind: "weigh-in", enabled: false, time: "06:45" });
    expect((await reminderSettings(db())).find((r) => r.kind === "weigh-in")).toMatchObject({ enabled: false, time: "06:45" });
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run --project workers tests/workers/settings.test.ts`
Expected: FAIL, cannot resolve `~/server/settings.server`.

- [ ] **Step 3: Implement the module**

```ts
// app/server/settings.server.ts
import type { Db } from "~/db/client";
import { reminderSettings as table } from "~/db/schema";
import { DEFAULT_REMINDERS, type ReminderKind, type ReminderSetting } from "~/domain/reminders";

export const REMINDER_LABEL: Record<ReminderKind, string> = {
  "weigh-in": "Weigh-in",
  breakfast: "Breakfast",
  lift: "Lift at noon",
  lunch: "Lunch",
  snack: "Snack",
  "plan-b": "Plan B nudge",
  steps: "Steps check",
  dinner: "Dinner",
  "kitchen-closed": "Kitchen closes",
  "check-in": "Sunday check-in",
};

export async function reminderSettings(db: Db): Promise<ReminderSetting[]> {
  const rows = await db.select().from(table).all();
  return DEFAULT_REMINDERS.map((d) => {
    const row = rows.find((r) => r.kind === d.kind);
    return { kind: d.kind, enabled: row?.enabled ?? true, time: row?.time ?? d.time };
  });
}

export async function saveReminder(db: Db, s: ReminderSetting): Promise<void> {
  await db.insert(table).values(s).onConflictDoUpdate({ target: table.kind, set: { enabled: s.enabled, time: s.time } });
}
```

- [ ] **Step 4: Settings screen**

```tsx
// app/routes/settings.tsx
import { env } from "cloudflare:workers";
import { useState } from "react";
import { Form, useFetcher } from "react-router";
import type { Route } from "./+types/settings";
import { Toggle } from "~/components/Toggle";
import { BackButton, Card, LargeTitle, Screen, SectionTitle } from "~/components/ui";
import { getDb } from "~/db/client";
import { DEFAULT_REMINDERS, type ReminderKind } from "~/domain/reminders";
import { REMINDER_LABEL, reminderSettings, saveReminder } from "~/server/settings.server";

export const handle = { hideTabBar: true };

export function meta() {
  return [{ title: "Settings · Rocky" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  return {
    reminders: await reminderSettings(getDb(env.DB)),
    ingestUrl: `${new URL(request.url).origin}/api/ingest/steps`,
    ingestToken: env.INGEST_TOKEN,
    vapidPublicKey: env.VAPID_PUBLIC_KEY,
  };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const kind = String(form.get("kind")) as ReminderKind;
  const time = String(form.get("time"));
  if (!DEFAULT_REMINDERS.some((r) => r.kind === kind) || !/^\d{2}:\d{2}$/.test(time)) return { error: "Bad reminder" };
  await saveReminder(getDb(env.DB), { kind, enabled: form.get("enabled") === "true", time });
  return { ok: true };
}

export default function Settings({ loaderData }: Route.ComponentProps) {
  const { reminders, ingestUrl, ingestToken } = loaderData;
  const [shown, setShown] = useState(false);
  return (
    <Screen>
      <BackButton to="/" label="Back to Today" />
      <LargeTitle title="Settings" />

      <section className="flex flex-col gap-2">
        <SectionTitle>Reminders</SectionTitle>
        <Card className="overflow-hidden">
          {reminders.map((r) => (
            <ReminderRow key={r.kind} kind={r.kind} enabled={r.enabled} time={r.time} />
          ))}
        </Card>
      </section>

      <section className="flex flex-col gap-2">
        <SectionTitle>Steps from Apple Watch</SectionTitle>
        <Card className="flex flex-col gap-3 p-[18px] text-[15px]">
          <p className="leading-snug text-label-2">The "Send steps to Rocky" Shortcut posts today's step count here. Full setup: docs/runbooks/steps-shortcut.md.</p>
          <div>
            <div className="text-[13px] font-semibold text-label-2">URL</div>
            <code className="block break-all text-[14px]">{ingestUrl}</code>
          </div>
          <div>
            <div className="text-[13px] font-semibold text-label-2">Authorization header</div>
            <code className="block break-all text-[14px]">Bearer {shown ? ingestToken : "••••••••••••"}</code>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setShown(!shown)} className="glass h-10 rounded-full px-4 text-[15px] font-semibold">
              {shown ? "Hide" : "Show"}
            </button>
            <button type="button" onClick={() => navigator.clipboard.writeText(`Bearer ${ingestToken}`)} className="glass h-10 rounded-full px-4 text-[15px] font-semibold">
              Copy header
            </button>
          </div>
        </Card>
      </section>

      <Card className="p-4">
        <Form method="post" action="/logout">
          <button type="submit" className="h-11 w-full rounded-full text-[17px] font-semibold text-calories">
            Sign out
          </button>
        </Form>
      </Card>
    </Screen>
  );
}

function ReminderRow({ kind, enabled, time }: { kind: ReminderKind; enabled: boolean; time: string }) {
  const fetcher = useFetcher();
  const pendingEnabled = fetcher.formData ? fetcher.formData.get("enabled") === "true" : enabled;
  const pendingTime = fetcher.formData ? String(fetcher.formData.get("time")) : time;
  const save = (e: boolean, t: string) => fetcher.submit({ kind, enabled: String(e), time: t }, { method: "post" });
  return (
    <div className="flex items-center gap-3 border-b-[0.5px] border-separator px-4 py-2.5 last:border-b-0">
      <span className="flex-1 text-[16px]">{REMINDER_LABEL[kind]}</span>
      <label className="sr-only" htmlFor={`time-${kind}`}>
        {REMINDER_LABEL[kind]} time
      </label>
      <input id={`time-${kind}`} type="time" value={pendingTime} onChange={(e) => save(pendingEnabled, e.target.value)} className="tabular h-9 rounded-lg bg-fill px-2 text-[15px] outline-none" />
      <Toggle on={pendingEnabled} label={`${REMINDER_LABEL[kind]} on`} onChange={(on) => save(on, pendingTime)} />
    </div>
  );
}
```

- [ ] **Step 5: Run the test and make sure it passes**

Run: `npx vitest run --project workers tests/workers/settings.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Build Settings with reminder controls and Shortcut setup"
```

---

### Task 10: Check-in cards on Today

**Files:**
- Modify: `app/server/day.server.ts`, `app/routes/today.tsx`

- [ ] **Step 1: Add the fields to the summary**

In `app/server/day.server.ts`:
- add to `DaySummary`: `checkInDue: boolean; checkInSkipped: boolean;`
- add `import { checkInDone, checkInWindow } from "./checkin.server";` and `weekStart, weekday` to the `~/domain/dates` import;
- before the `return {`, add:

```ts
  const openWeek = checkInWindow(now);
  const checkInDue = openWeek !== null && !(await checkInDone(db, openWeek));
  const lastMonday = addDays(weekStart(date), -7);
  const checkInSkipped = weekday(date) === 1 && localMinutes(now) >= 12 * 60 && !(await checkInDone(db, lastMonday));
```

- add `checkInDue, checkInSkipped,` to the returned object.

- [ ] **Step 2: Show the cards**

In `app/routes/today.tsx`, directly under `{day.weighIn === null && <WeighInCard />}` add:

```tsx
      {day.checkInDue && (
        <Link to="/check-in" className="flex items-center justify-between rounded-[26px] bg-card px-[18px] py-4">
          <div>
            <div className="text-[17px] font-semibold">Sunday check-in</div>
            <div className="text-[14px] text-label-2">10 minutes to set up next week.</div>
          </div>
          <Icon name="chevron" size={18} strokeWidth={2.4} />
        </Link>
      )}
      {day.checkInSkipped && <Card className="px-[18px] py-3.5 text-[15px] text-label-2">Check-in skipped. This week runs on last week's numbers.</Card>}
```

- [ ] **Step 3: Run the whole suite and typecheck**

Run: `npm run typecheck && npm test`
Expected: both pass.

- [ ] **Step 4: Commit and deploy**

```bash
git add -A
git commit -m "Show check-in due and skipped states on Today"
git push origin main
```
