# P4a: Check-in Data, Rules and Named Changes Implementation Plan

> **For agentic workers:** implement this plan task-by-task with the `executing-plans` skill. Steps use checkbox (`- [ ]`) syntax for tracking.

> **This step carries a migration. Kameron runs `npm run db:migrate:remote` before the PR merges.** The new code syncs a `lift_drops` table: pull's snapshot reads every synced table, so a deploy without the migration breaks every phone's first pull. Task 16 hands him the commands and waits for his "done".

> **Starts from N3's merged result.** Cut the build branch from `main` only after `v2/n3-engine-call` has merged. This plan builds on what N3 adds: `nextTarget` with `baseStepGoal` and the "no surplus" guardrail, `trendReading` and `roundLb`, `burnEntries` and `checkInBurns`, `app/checkin/call.ts` (`callView`, `CallFacts`, `scaleChanges`), `app/checkin/CallBlock.tsx`, and the trend everywhere. `app/domain/adjustments.ts` is gone. Where this plan quotes a line of N3's code to replace, it is the line as `docs/superpowers/plans/2026-10-28-n3-engine-call.md` writes it. If N3 landed with other wording, make the same change to the line that is there.

**Goal:** Everything the one-page check-in needs, with nothing on screen changing yet except one gym line:
- **Data.** `check_ins` gains the three taps (`hunger`, `energy`, `sleep`). A new synced `lift_drops` table holds a stuck lift's one-session drop. `plan.json` gains the Jan 1 `goal`, and the content gains `BODY_PART`.
- **Rules.** Stuck lifts and their drop weight. The drop applied wherever a suggestion is made, with the gym's plain-ink "Dropped to 40" line. Two hungry Sundays turn a cut into Rocky's walking pick. The week's call over the phone's copy (`weekCall`), the week's lifts, meal repeats and rests, the `CheckInDigest`, and Rocky's rule-written take (`ruleTake`).
- **Named changes.** `finishCheckIn`, `logWaist`, `checkGrocery`.
- **The week's plan** is made by pull and by the 5-minute cron, not only by the layout loader.

**Architecture:**
- **Pure rules in `app/domain/` and `app/checkin/`.** The page (P4b) runs them in the browser over the store. `finishCheckIn` runs the very same functions inside the mutator, over a scan of the same tables, so the phone's preview and the server's write can't disagree on the rules.
- **The digest is the hinge.** `buildDigest` gathers every number the week page shows into one `CheckInDigest`. `ruleTake` writes Win, Fix and Call from it now; project 5 sends the same object to the AI and checks the AI's numbers with `digestNumbers`.
- **`finishCheckIn` carries only choices.** Pick, taps, rests and lift plans. Every number is worked out again from the scanned rows.
- **The v1 check-in route keeps working** through this step on N3's server path. It only gains `hungry: false`, since v1 has no taps. P4b removes it.

**Tech Stack:** React Router 8.4 (framework mode, SSR on), Drizzle on D1 with drizzle-kit migrations, the F2 sync layer, Vitest 4 (unit project for pure modules, workers project for D1), zod 4.

**Spec:** `docs/superpowers/specs/2026-10-28-checkin-plan-progress-library-design.md` (section 1 "The check-in's rules", section 2 "Data" and "Named changes", section 5, rollout step 1, Testing). **N3 plan:** `docs/superpowers/plans/2026-10-28-n3-engine-call.md`. **N1 plan** (the migration pattern): `docs/superpowers/plans/2026-10-27-n1-nutrition-data.md`, Tasks 7 and 8. **Build branch:** `v2/p4a-checkin-data`, from `main` after N3 merges. This plan is committed on `v2/p4-checkin-plan-progress-library`.

**Mocks:** none for this step. The one visible change is the gym's last-time line for a dropped lift, which the spec words.

## Calls made in this plan (flag them in the PR)

**Spec gaps resolved:**
- **Finishing again versus "No `check_ins` row may exist".** The spec's call 1 lets a finished check-in be redone until Monday 3am, and its Named changes table refuses any second finish. This plan follows call 1: `finishCheckIn` refuses "That check-in is already finished." only when a row exists and `mealDate(at)` is on or after next Monday. Before that, it replaces. So "two phones finish the same week" (section 5) is refused only after Monday 3am; before it, the later finish wins, which is the same thing as "Change my answers".
- **What "replaces" undoes.** A second finish rewrites `targets` (same key) and the `check_ins` row. Rests the first finish set and the second drops go back to `rested_until = null`, but only if they still hold the first finish's date. Drops the first finish wrote and the second doesn't are deleted, but only if their `from_date` is still next Monday. `completed_at` keeps the first finish, as N3 does.
- **`outcome`** is `{ call, pick, rest, lifts }`. `call` is the digest's call (N3's `Call` plus the burn facts below), so the finished page shows the saved numbers. `lifts` holds every planned lift as applied: a `drop` for a lift that isn't stuck is saved as `hold`.
- **`Call.hungry`** is a new field: true only when two hungry Sundays moved Rocky's pick from calories to steps. With half portions the pick is already steps, so `hungry` stays false and no hungry line is added.
- **Moved up versus stuck.** A lift whose newest session hit the top of its range on every set is never stuck, whatever the feel tap said. A hard top session is then neither moved up nor stuck.
- **Next week's deload empties `stuck`,** as it empties `movedUp`: there is nothing to plan in a deload.
- **`withDrop` takes a fourth argument, `on`,** the date of the session being planned. A drop waits for its Monday: a workout logged on the Sunday evening after Finish isn't dropped.
- **The digest has a few fields beyond the spec's shape,** each for a line the take prints, so every printed number is in the digest:
    - `days.total` (7, for "5 of 7 days counted").
    - `waist.change` (now minus was, for "Waist is down 0.25 in").
    - `call.intakeAvg`, `call.windowTrackedDays`, `call.weighIns`, `call.holdReason`, and `call.limits` (`floor` 2,000 and `fastLossLb` 2).
    - `buildDigest` takes an optional fourth argument, `today`, so a week still in progress doesn't count its future workouts as missed.
    - `digestNumbers` and `numbersIn` are exported for project 5's guardrail.
- **`weekCall`'s option is the final `hungry` flag.** `hungryTwice(rows, monday, hunger)` works it out, so the page and the mutator agree.
- **Next week's meals at Finish** skip any slot already eaten, skipped or swapped, whether or not it has a `planned_meals` row.
- **Pull ensures the plan for `weekStart(mealDate(serverNow()))`,** as the layout loader does.

**Copy the spec doesn't give** (all in `app/checkin/take.ts`, except the refusals in `app/sync/mutators.ts`):

| Case | Line |
|---|---|
| Win, steps exactly at goal | "Steps averaged 8,500, right at the 8,500 goal." |
| Win, workouts | Only when 2 or more are planned: "All 3 workouts done." |
| Fix, 1 or 0 days closed out | "Only 1 day was closed out in full. ..." and "No days were closed out in full. ..." |
| Call, holding: under 10 tracked days in the 21-day window | "Only 9 days in the last three weeks were tracked in full, so 2,400 holds one more week." |
| Call, holding: under 8 weigh-ins | "Only 6 weigh-ins in the last three weeks, so 2,400 holds one more week." |
| Call, holding: 1 or 0 tracked days this week | "Only 1 day was tracked in full, ..." and "No days were tracked in full, ..." |
| Call, half portions with steps at 10,000 | "Food is at half portions and steps are at 10,000, so 2,050 holds." |
| `checkGrocery` on a week that isn't a Monday | "That week doesn't start on a Monday." |
| `logWaist` after today | "That date is in the future." (strict: other changes allow tomorrow, a waist doesn't) |

---

## Conventions

- Everything from the earlier plans applies:
    - No em dashes in code, copy, comments, commits or docs.
    - No `Co-Authored-By` lines, no emojis.
    - One commit per task, staged by path. Never `git commit -a`.
    - Commit messages are a plain sentence describing the behaviour, as in `git log`.
    - Look with `npm run dev`, never `npm run build`.
    - No full-suite runs inside tasks. During a task, run only the files its steps name, plus `npm run typecheck` where a step says so. One `npm run typecheck && npm test` in Task 16, before the PR.
    - Kameron reviews and merges. The build session does not merge. Any `--remote` D1 command, even a read, is handed to Kameron to run.
- **Names come from `app/brand.ts`.** Copy that names the coach uses `COACH_NAME`. Tests build those strings with `COACH_NAME` too.
- `app/checkin/*`, `app/today/*`, `app/workout/*`, `app/content/*` and `app/domain/*` must not import `cloudflare:workers` or any `*.server.ts`. They run in the browser. A `*.server.ts` and `app/sync/mutators.ts` may import from them.
- Store rows are raw D1 rows: snake_case, booleans `0`/`1`, JSON columns as strings. A mutator reads tables only through `tx.get` and `tx.scan`.
- **Numbers in copy** use `toLocaleString("en-US")` ("2,400"). A weight change prints with one decimal ("0.4 lb"). Inches print with at most two decimals ("0.25", "35.5").
- **The check-in's tables, read once.** The rules read a `Rows` function (`(table) => Row[]`). On the page it is the store. Inside `finishCheckIn` it is a snapshot of `tx.scan` over `CHECK_IN_TABLES`, taken before any write.
- **Unit fixtures live in `tests/unit/checkin/fixture.ts`.** `threeWeeks()` is N3's worked example. `weekThree()` adds the week the digest, the take and Finish are tested on. The workers test seeds D1 from the same fixture, so the server's numbers are checked against the same arithmetic.
- **Unit test dates** use Chicago daylight time (`-05:00`) and stay before November 1, 2026, except where a test names a later week and passes dates only.
- **Worker test storage is isolated per file and shared across the tests in a file.**

## Files

| File | Responsibility |
|---|---|
| `app/db/schema.ts` | `check_ins.hunger`, `energy`, `sleep`; the `lift_drops` table |
| `drizzle/0010_checkin_data.sql`, `drizzle/0011_checkin_sync.sql` (generated) | The columns and table; `lift_drops`' triggers |
| `app/sync/tables.ts` | `lift_drops` in the synced list |
| `content/plan.json`, `app/content/schema.ts` | `goal` |
| `app/content/index.ts` | `BodyPart`, `BODY_PARTS`, `BODY_PART` |
| `app/domain/stalls.ts` (new) | `dropWeight`, `bestSet`, `stuckLifts` |
| `app/domain/progression.ts` | `LiftDrop`, `dropApplies`, `withDrop` |
| `app/workout/sessions.ts` | `dropFor` |
| `app/workout/model.ts` | Suggestions with the drop; the drop's last-time line |
| `app/today/model.ts` | Today's "go up" line respects a drop |
| `app/domain/energy.ts` | `CallInput.hungry`, `Call.hungry`, `FAST_LOSS_LB` |
| `app/checkin/call.ts` | The hungry why-line |
| `app/server/checkin.server.ts` | Passes `hungry: false` (v1 path, removed in P4b) |
| `app/checkin/engine.ts` (new) | `weekCall`, `WeekCall`, `hungryTwice`, `weighIns` |
| `app/checkin/meals.ts` (new) | `mealRepeats`, `defaultRests`, `restUntil`, `backFromRest`, `lastEatenBefore`, `previewNextWeek`, `groceryCount`, `rotationMeals` |
| `app/checkin/lifts.ts` (new) | `performedLifts`, `liftWeek`, `MovedUp`, `Stuck`, `LiftWeek` |
| `app/checkin/digest.ts` (new) | `CheckInDigest`, `CheckInChoices`, `Level`, `SleepLevel`, `HoldReason`, `buildDigest`, `digestNumbers`, `numbersIn` |
| `app/checkin/take.ts` (new) | `Take`, `ruleTake` |
| `app/sync/mutators.ts` | `finishCheckIn`, `logWaist`, `checkGrocery` |
| `app/routes/api.sync.pull.ts` | Ensures this week's plan before reading |
| `app/jobs/scheduled.ts` | The 5-minute cron ensures each planned person's week |

## Interfaces other steps build on

P4b reads all of these. P4c, P4d and project 5 read the ones marked.

```ts
// app/content/index.ts (P4d)
export type BodyPart = "chest" | "back" | "shoulders" | "arms" | "legs";
export const BODY_PARTS: { id: BodyPart; label: string }[];
export const BODY_PART: Record<Exercise["group"], BodyPart>;
// plan.goal (P4c, P4d): { date: "2027-01-01", low: 195, high: 198 }

// app/domain/progression.ts (P4d's lift page)
export interface LiftDrop { weight: number; from: ISODate }
export function dropApplies(drop: LiftDrop | null, lastSessionDate: ISODate | null, on: ISODate): drop is LiftDrop;
export function withDrop(suggestion: Suggestion, drop: LiftDrop | null, lastSessionDate: ISODate | null, on: ISODate): Suggestion;
// app/workout/sessions.ts
export function dropFor(rows: Rows, exerciseId: string): LiftDrop | null;

// app/domain/stalls.ts (bestSet: P4d's best sets)
export function dropWeight(top: number, increment: number): number;
export function bestSet(sets: LoggedSet[]): LoggedSet; // the heaviest set, then the most reps at it
export function stuckLifts(lifts: LiftHistory[], weekStart: ISODate, weekEnd: ISODate, setsNext: number): StuckLift[];

// app/checkin/engine.ts
export function weekCall(rows: Rows, monday: ISODate, opts: { hungry: boolean }): WeekCall; // WeekCall extends N3's CallFacts
export function hungryTwice(rows: Rows, monday: ISODate, hunger: string | null): boolean;

// app/checkin/meals.ts (P4c's groceries preview)
export function previewNextWeek(rows: Rows, monday: ISODate, rest: string[]): PlannedMeal[];
export function groceryCount(slugs: string[]): number;

// app/checkin/digest.ts (project 5)
export interface CheckInDigest { ... } // shape in Task 10
export function buildDigest(rows: Rows, monday: ISODate, choices: CheckInChoices, today?: ISODate): CheckInDigest;
export function digestNumbers(d: CheckInDigest): Set<number>;
export function numbersIn(text: string): number[];

// app/checkin/take.ts (project 5 replaces only the text)
export function ruleTake(d: CheckInDigest): { win: string; fix: string; call: string };

// app/sync/mutators.ts (P4b, P4c)
finishCheckIn { week, at, pick: "calories" | "steps", hunger, energy, sleep, rest: string[], lifts: { exercise, plan: "hold" | "drop" }[] }
logWaist { date, inches }
checkGrocery { week, food, checked }
```

---

### Task 1: The taps, the drops table, and the migrations

**Files:**
- Modify: `app/db/schema.ts`, `app/sync/tables.ts`
- Create: `drizzle/0010_checkin_data.sql` (generated), `drizzle/0011_checkin_sync.sql` (custom), their snapshots and journal entries
- Test: `tests/unit/sync/tables.test.ts`, `tests/workers/schema.test.ts`

- [ ] **Step 1: Write the failing tests.**

1. In `tests/unit/sync/tables.test.ts`, add to "keys rows the same way the SQL does":

```ts
    expect(keyOf("lift_drops", { exercise_id: "seated-dumbbell-shoulder-press", weight_lb: 40 })).toBe("seated-dumbbell-shoulder-press");
```

and change the third test's name and length:

```ts
  it("syncs the 21 personal tables and nothing server-only", () => {
    expect(SYNCED).toHaveLength(21);
```

2. In `tests/workers/schema.test.ts`, add `"lift_drops"` to the list between `"grocery_checks"` and `"login_attempts"`.

- [ ] **Step 2: Run them to make sure they fail.**

```bash
npx vitest run --project unit tests/unit/sync/tables.test.ts
npx vitest run --project workers tests/workers/schema.test.ts
```

Expected: FAIL. "Not a synced table: lift_drops", 20 tables, and no `lift_drops` table.

- [ ] **Step 3: Change the schema.** In `app/db/schema.ts`:

1. In `checkIns`, add after `trackedDays: integer("tracked_days"),`:

```ts
  /** The Sunday taps: hunger and energy are low, fine or high; sleep is poor, fine or great. Null when skipped, and on older rows. */
  hunger: text("hunger"),
  energy: text("energy"),
  sleep: text("sleep"),
```

2. Add at the end of the file:

```ts
/** A stuck lift dropped back at the check-in: the weight for its next session on or after `from_date`. One per lift. */
export const liftDrops = sqliteTable("lift_drops", {
  exerciseId: text("exercise_id").primaryKey(),
  weightLb: real("weight_lb").notNull(),
  /** The Monday after the check-in that set it. */
  fromDate: text("from_date").notNull(),
  createdAt: text("created_at").notNull(),
});
```

- [ ] **Step 4: Generate the data migration.**

```bash
npx drizzle-kit generate --name=checkin_data
```

Expected: `drizzle/0010_checkin_data.sql`, a snapshot and a journal entry. Read the SQL. It holds only:
- three `ALTER TABLE \`check_ins\` ADD \`hunger\` text;` style lines (`hunger`, `energy`, `sleep`)
- `CREATE TABLE \`lift_drops\`` with the four columns.

If drizzle-kit rebuilds `check_ins` (`__new_check_ins`) instead, stop and tell Kameron: adding nullable columns should never need a rebuild, and a rebuild would drop the `check_ins` triggers.

- [ ] **Step 5: Register the table.** In `app/sync/tables.ts`, add after `{ name: "usual_orders", ...cols("client_id") },`:

```ts
  { name: "lift_drops", ...cols("exercise_id") },
```

`SYNC_SCHEMA` stays at 3: no row key changes, and the new table starts empty, so no phone needs a fresh snapshot.

- [ ] **Step 6: Generate the trigger migration.**

```bash
npx drizzle-kit generate --custom --name=checkin_sync
npx tsx scripts/gen-sync-triggers.ts lift_drops > drizzle/0011_checkin_sync.sql
```

Expected: the first command makes an empty `drizzle/0011_checkin_sync.sql` and a journal entry; the second fills it with the three `sync_lift_drops_*` triggers. `check_ins` keeps its triggers: they log only the row key, so new columns don't touch them.

- [ ] **Step 7: Run the tests and typecheck.**

```bash
npx vitest run --project unit tests/unit/sync/tables.test.ts tests/unit/sync/store.test.ts
npx vitest run --project workers tests/workers/schema.test.ts tests/workers/sync-triggers.test.ts tests/workers/sync-pull.test.ts
npm run typecheck
```

Expected: PASS, no type errors.

- [ ] **Step 8: Commit.**

```bash
git add app/db/schema.ts app/sync/tables.ts drizzle tests/unit/sync/tables.test.ts tests/workers/schema.test.ts
git commit -m "Check-ins keep the Sunday taps, and a synced table holds a stuck lift's drop"
```

---

### Task 2: Prove the migration keeps v1 check-ins and logs drops

**Files:**
- Create: `tests/workers/checkin-migration.test.ts`

- [ ] **Step 1: Write the test.**

```ts
import { applyD1Migrations, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

const SHOULDER = "seated-dumbbell-shoulder-press";

describe("the P4a migration", () => {
  it("keeps a v1 check-in with no taps, and logs every write to lift_drops", async () => {
    const d1 = env.MIGRATION_TEST;
    const split = env.TEST_MIGRATIONS.findIndex((m) => m.name.startsWith("0010"));
    await applyD1Migrations(d1, env.TEST_MIGRATIONS.slice(0, split));
    await d1
      .prepare("INSERT INTO check_ins (week_start, avg_weight, change, adherence, outcome, completed_at) VALUES ('2026-10-12', 206.3, -0.8, 6, '{}', '2026-10-18T23:00:00.000Z')")
      .run();

    await applyD1Migrations(d1, env.TEST_MIGRATIONS);

    expect((await d1.prepare("SELECT week_start, adherence, hunger, energy, sleep FROM check_ins").all()).results).toEqual([
      { week_start: "2026-10-12", adherence: 6, hunger: null, energy: null, sleep: null },
    ]);
    const before = (await d1.prepare("SELECT COUNT(*) AS n FROM changes").first<{ n: number }>())!.n;
    await d1.prepare(`INSERT INTO lift_drops (exercise_id, weight_lb, from_date, created_at) VALUES ('${SHOULDER}', 40, '2026-10-26', '2026-10-25T23:00:00.000Z')`).run();
    await d1.prepare(`UPDATE lift_drops SET weight_lb = 35 WHERE exercise_id = '${SHOULDER}'`).run();
    await d1.prepare("DELETE FROM lift_drops").run();
    expect((await d1.prepare("SELECT table_name, row_key, op FROM changes ORDER BY version").all()).results.slice(before)).toEqual([
      { table_name: "lift_drops", row_key: SHOULDER, op: "put" },
      { table_name: "lift_drops", row_key: SHOULDER, op: "put" },
      { table_name: "lift_drops", row_key: SHOULDER, op: "del" },
    ]);
  });
});
```

- [ ] **Step 2: Run it.**

```bash
npx vitest run --project workers tests/workers/checkin-migration.test.ts
```

Expected: PASS. If a statement fails, fix it in `0010` or `0011`. The test exists to run the real SQL against an old row.

- [ ] **Step 3: Commit.**

```bash
git add tests/workers/checkin-migration.test.ts
git commit -m "Prove the check-in migration keeps v1 rows and logs lift drops"
```

---

### Task 3: The Jan 1 goal and the five body parts

**Files:**
- Modify: `content/plan.json`, `app/content/schema.ts`, `app/content/index.ts`
- Test: `tests/unit/content.test.ts`

- [ ] **Step 1: Write the failing tests.** In `tests/unit/content.test.ts`, change the import to:

```ts
import { BODY_PART, BODY_PARTS, exercises, foods, meals, messages, plan } from "~/content";
```

and add at the end of the file:

```ts
describe("goal and body parts", () => {
  it("reads the Jan 1 goal from the plan", () => {
    expect(plan.goal).toEqual({ date: "2027-01-01", low: 195, high: 198 });
  });

  it("folds the 9 muscle groups into 5 body parts, in list order", () => {
    expect(BODY_PARTS.map((b) => b.label)).toEqual(["Chest", "Back", "Shoulders", "Arms", "Legs"]);
    const count = new Map<string, number>();
    for (const e of exercises.values()) count.set(BODY_PART[e.group], (count.get(BODY_PART[e.group]) ?? 0) + 1);
    // Chest 12; back 6; shoulder press, side and rear delts 3 each; biceps and triceps 7 each; quads and hamstrings 4 each.
    expect(Object.fromEntries(count)).toEqual({ chest: 12, back: 6, shoulders: 9, arms: 14, legs: 8 });
  });
});
```

- [ ] **Step 2: Run them to make sure they fail.**

```bash
npx vitest run --project unit tests/unit/content.test.ts
```

Expected: FAIL. `BODY_PARTS` is undefined and `plan.goal` is undefined.

- [ ] **Step 3: The goal.** In `content/plan.json`, add after `"maintenanceKcal": 2800,`:

```json
  "goal": { "date": "2027-01-01", "low": 195, "high": 198 },
```

In `app/content/schema.ts`, add to `PlanSchema` after `maintenanceKcal: z.number(),`:

```ts
  /** The phase's checkpoint: the date, and the weight range to land in. */
  goal: z.object({ date: z.string(), low: z.number(), high: z.number() }),
```

- [ ] **Step 4: The body parts.** In `app/content/index.ts`, add at the end:

```ts
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
```

- [ ] **Step 5: Run the tests and typecheck.** Same command as Step 2, then `npm run typecheck`. Expected: PASS, no type errors.

- [ ] **Step 6: Commit.**

```bash
git add content/plan.json app/content/schema.ts app/content/index.ts tests/unit/content.test.ts
git commit -m "The plan names the Jan 1 goal, and exercises fold into five body parts"
```

---

### Task 4: Stuck lifts and the drop weight

The rule is the spec's call 5. A lift is stuck when its last three sessions with logged sets, skipping deload weeks, share a top weight, the second and third each total no more reps than the first, and the third falls in the week under review. A lift whose newest session hit the top of the range on every set moved up, and a body-weight lift never stalls.

**Files:**
- Create: `app/domain/stalls.ts`
- Test: `tests/unit/domain/stalls.test.ts`

- [ ] **Step 1: Write the failing tests.** Create `tests/unit/domain/stalls.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { dropWeight, stuckLifts, type LiftHistory, type LiftSession } from "~/domain/stalls";

const sets = (...pairs: [number, number][]) => pairs.map(([weight, reps]) => ({ weight, reps }));
const at = (date: string, s: [number, number][], deload = false): LiftSession => ({ date, sets: sets(...s), deload });

// Seated dumbbell shoulder press, 6 to 10 reps, 5 lb steps, on three Wednesdays. Week 3 runs Oct 19 to 25.
function shoulder(sessions: LiftSession[], over: Partial<LiftHistory> = {}): LiftHistory {
  return { exercise: "seated-dumbbell-shoulder-press", increment: 5, bodyWeight: false, repMax: 10, sessions, ...over };
}
const EIGHT_SEVEN: [number, number][] = [
  [45, 8],
  [45, 7],
];

describe("dropWeight", () => {
  it("drops about 10%, to the increment, at least one step and never below one", () => {
    expect(dropWeight(45, 5)).toBe(40);
    // 13.5 rounds to 15, which is no drop, so it goes one step down.
    expect(dropWeight(15, 5)).toBe(10);
    expect(dropWeight(10, 5)).toBe(5);
    expect(dropWeight(5, 5)).toBe(5);
    // 117 rounds to 120 at 10 lb steps.
    expect(dropWeight(130, 10)).toBe(120);
  });
});

describe("stuckLifts", () => {
  it("finds a lift at the same weight and reps three sessions running", () => {
    const lift = shoulder([at("2026-10-07", EIGHT_SEVEN), at("2026-10-14", EIGHT_SEVEN), at("2026-10-21", EIGHT_SEVEN)]);
    expect(stuckLifts([lift], "2026-10-19", "2026-10-25", 2)).toEqual([
      { exercise: "seated-dumbbell-shoulder-press", top: 45, lastSets: sets(...EIGHT_SEVEN), chase: [8, 8], drop: 40 },
    ]);
  });

  it("counts falling reps as stuck, and rising reps or a heavier session as moving", () => {
    // 16, then 15, then 14 reps in all: no more than the first.
    const falling = shoulder([at("2026-10-07", [[45, 8], [45, 8]]), at("2026-10-14", EIGHT_SEVEN), at("2026-10-21", [[45, 7], [45, 7]])]);
    expect(stuckLifts([falling], "2026-10-19", "2026-10-25", 2)).toHaveLength(1);
    // 15, then 16: the second beat the first.
    const rising = shoulder([at("2026-10-07", EIGHT_SEVEN), at("2026-10-14", [[45, 8], [45, 8]]), at("2026-10-21", EIGHT_SEVEN)]);
    expect(stuckLifts([rising], "2026-10-19", "2026-10-25", 2)).toEqual([]);
    const heavier = shoulder([at("2026-10-07", [[40, 8], [40, 7]]), at("2026-10-14", EIGHT_SEVEN), at("2026-10-21", EIGHT_SEVEN)]);
    expect(stuckLifts([heavier], "2026-10-19", "2026-10-25", 2)).toEqual([]);
  });

  it("skips a deload week's session when finding the three", () => {
    // Week 8 (Nov 23 to 29) is the deload. Reviewing week 9 (Nov 30 to Dec 6): Nov 11, Nov 18 and Dec 2 are the run.
    const lift = shoulder([at("2026-11-11", EIGHT_SEVEN), at("2026-11-18", EIGHT_SEVEN), at("2026-11-25", [[45, 9]], true), at("2026-12-02", EIGHT_SEVEN)]);
    expect(stuckLifts([lift], "2026-11-30", "2026-12-06", 2)).toHaveLength(1);
  });

  it("shows nothing when the third session is outside the week under review", () => {
    const lift = shoulder([at("2026-10-07", EIGHT_SEVEN), at("2026-10-14", EIGHT_SEVEN), at("2026-10-21", EIGHT_SEVEN)]);
    expect(stuckLifts([lift], "2026-10-26", "2026-11-01", 2)).toEqual([]);
  });

  it("never calls a lift stuck when it hit the top, or when it is body weight", () => {
    const top: [number, number][] = [
      [45, 10],
      [45, 10],
    ];
    expect(stuckLifts([shoulder([at("2026-10-07", top), at("2026-10-14", top), at("2026-10-21", top)])], "2026-10-19", "2026-10-25", 2)).toEqual([]);
    const pullUps = shoulder([at("2026-10-07", [[0, 8], [0, 7]]), at("2026-10-14", [[0, 8], [0, 7]]), at("2026-10-21", [[0, 8], [0, 7]])], { exercise: "pull-up", bodyWeight: true, repMax: 12 });
    expect(stuckLifts([pullUps], "2026-10-19", "2026-10-25", 2)).toEqual([]);
  });

  it("chases the best set's reps once per set next week", () => {
    // The best set is the heaviest, then the most reps at it: 8, even when it came second.
    const lift = shoulder([at("2026-10-07", EIGHT_SEVEN), at("2026-10-14", EIGHT_SEVEN), at("2026-10-21", [[45, 7], [45, 8]])]);
    expect(stuckLifts([lift], "2026-10-19", "2026-10-25", 2)[0].chase).toEqual([8, 8]);
    expect(stuckLifts([lift], "2026-10-19", "2026-10-25", 1)[0].chase).toEqual([8]);
  });
});
```

- [ ] **Step 2: Run them to make sure they fail.**

```bash
npx vitest run --project unit tests/unit/domain/stalls.test.ts
```

Expected: FAIL, "Cannot find module '~/domain/stalls'".

- [ ] **Step 3: Implement.** Create `app/domain/stalls.ts`:

```ts
// Stuck lifts (spec call 5) and the weight to drop back to (call 6). Pure: the check-in page and finishCheckIn share it.
import type { LoggedSet } from "./progression";
import type { ISODate } from "./types";

export interface LiftSession {
  date: ISODate;
  sets: LoggedSet[];
  deload: boolean;
}

export interface LiftHistory {
  exercise: string;
  increment: number;
  bodyWeight: boolean;
  /** The top of the rep range, from the newest session's lift list. */
  repMax: number;
  /** Sessions with logged sets, oldest first. */
  sessions: LiftSession[];
}

export interface StuckLift {
  exercise: string;
  top: number;
  /** The third session's sets: "45 × 8, 7". */
  lastSets: LoggedSet[];
  /** Next week's reps to chase, one per set: the best set's reps. */
  chase: number[];
  drop: number;
}

/** How many sessions in a row make a stall. */
export const STALL_SESSIONS = 3;

const topOf = (sets: LoggedSet[]) => Math.max(...sets.map((s) => s.weight));
const repsOf = (sets: LoggedSet[]) => sets.reduce((n, s) => n + s.reps, 0);

/** About 10% lighter, to the lift's increment: at least one increment below the top, and never below one increment. */
export function dropWeight(top: number, increment: number): number {
  return Math.max(increment, Math.min(top - increment, Math.round((top * 0.9) / increment) * increment));
}

/** The heaviest set, then the most reps at that weight. */
export function bestSet(sets: LoggedSet[]): LoggedSet {
  const top = topOf(sets);
  return sets.filter((s) => s.weight === top).reduce((a, b) => (b.reps > a.reps ? b : a));
}

export function stuckLifts(lifts: LiftHistory[], weekStart: ISODate, weekEnd: ISODate, setsNext: number): StuckLift[] {
  const out: StuckLift[] = [];
  for (const lift of lifts) {
    if (lift.bodyWeight) continue;
    // Deload sessions neither count nor break the run.
    const run = lift.sessions.filter((s) => !s.deload && s.sets.length > 0).slice(-STALL_SESSIONS);
    if (run.length < STALL_SESSIONS) continue;
    const [first, second, third] = run;
    if (third.date < weekStart || third.date > weekEnd) continue;
    // Every set at the top of the range moves the lift up: progress, not a stall.
    if (third.sets.every((s) => s.reps >= lift.repMax)) continue;
    const top = topOf(first.sets);
    if (topOf(second.sets) !== top || topOf(third.sets) !== top) continue;
    if (repsOf(second.sets) > repsOf(first.sets) || repsOf(third.sets) > repsOf(first.sets)) continue;
    const best = bestSet(third.sets);
    out.push({ exercise: lift.exercise, top, lastSets: third.sets, chase: Array.from({ length: setsNext }, () => best.reps), drop: dropWeight(top, lift.increment) });
  }
  return out;
}
```

- [ ] **Step 4: Run the tests.** Same command as Step 2. Expected: PASS, all 7.

- [ ] **Step 5: Commit.**

```bash
git add app/domain/stalls.ts tests/unit/domain/stalls.test.ts
git commit -m "A lift is stuck after three sessions at the same weight with no more reps, and drops about 10%"
```

---

### Task 5: A dropped lift's next session, and the gym's line for it

**Files:**
- Modify: `app/domain/progression.ts`, `app/workout/sessions.ts`, `app/workout/model.ts`, `app/today/model.ts`
- Test: `tests/unit/domain/progression.test.ts`, `tests/unit/workout/model.test.ts`, `tests/unit/today/model.test.ts`

- [ ] **Step 1: Write the failing tests.**

1. In `tests/unit/domain/progression.test.ts`, change the import to `import { nextSuggestion, restSeconds, withDrop } from '~/domain/progression';` and add at the end:

```ts
describe('withDrop', () => {
  // Dropped at Sunday Oct 25's check-in, for the first session from Monday Oct 26.
  const drop = { weight: 40, from: '2026-10-26' };
  const up = { weight: 50, goUp: true };

  it('sets the dropped weight for the first session from its Monday', () => {
    expect(withDrop(up, drop, '2026-10-21', '2026-10-28')).toEqual({ weight: 40, goUp: false });
    expect(withDrop(up, drop, null, '2026-10-26')).toEqual({ weight: 40, goUp: false });
  });

  it('is spent once the lift is logged on or after that Monday', () => {
    expect(withDrop(up, drop, '2026-10-26', '2026-10-28')).toBe(up);
    expect(withDrop(up, drop, '2026-11-02', '2026-11-04')).toBe(up);
  });

  it('waits for its Monday, and does nothing without a drop', () => {
    expect(withDrop(up, drop, '2026-10-21', '2026-10-25')).toBe(up);
    expect(withDrop(up, null, '2026-10-21', '2026-10-28')).toBe(up);
  });
});
```

2. In `tests/unit/workout/model.test.ts`, add inside `describe("buildWorkout")`:

```ts
  it("starts a lift dropped at the check-in at the dropped weight, in plain ink", () => {
    // Leg press hit the top last Wednesday, but Sunday's check-in dropped it to 240 from Monday Oct 26.
    const dropped = merge(history(), { lift_drops: [{ exercise_id: "leg-press", weight_lb: 240, from_date: "2026-10-26", created_at: "2026-10-25T23:00:00Z" }] });
    const m = buildWorkout(rowsOf(dropped), at(WED, "08:00"));
    expect(m.lifts[0]).toMatchObject({ suggestion: { weight: 240, goUp: false }, drop: { weight: 240, from: "2026-10-26" } });
    expect(lastLine(m.lifts[0], m.date)).toEqual({ goUp: false, text: "Last Wednesday: 270 × 12, 12. Dropped to 240 at Sunday's check-in. Build back from here." });
    expect(nextTarget(m.lifts[0], m.setsPerLift)?.weight).toBe(240);
  });

  it("runs the usual rule again once a session at the dropped weight is logged", () => {
    const monday = { workout_sessions: [session({ id: 10, client_id: null, date: "2026-10-26", template_id: LEGS, started_at: "2026-10-26T17:00:00Z", ended_at: "2026-10-26T18:00:00Z" })], set_logs: [set({ session_key: "id:10", weight_lb: 240, reps: 10, logged_at: "2026-10-26T17:05:00Z" })] };
    const rows = merge(history(), monday, { lift_drops: [{ exercise_id: "leg-press", weight_lb: 240, from_date: "2026-10-26", created_at: "2026-10-25T23:00:00Z" }] });
    const m = buildWorkout(rowsOf(rows), at(WED, "08:00"));
    expect(m.lifts[0]).toMatchObject({ suggestion: { weight: 240, goUp: false }, drop: null });
    expect(lastLine(m.lifts[0], m.date).text).toBe("Last Monday: 240 × 10. Beat it today.");
  });
```

3. In `tests/unit/today/model.test.ts`, add after "says what goes up when every set hit the top last time":

```ts
  it("says nothing goes up for a lift dropped back at the check-in", () => {
    const lastWed = "2026-10-21";
    const sets: Row[] = [1, 2].map((n) => ({ id: n, session_id: 9, session_key: "id:9", exercise_id: firstLift.id, position: 0, set_number: n, weight_lb: 270, reps: legs.exercises[0].repMax, logged_at: `${lastWed}T17:00:00Z`, client_id: null }));
    const m = asPlan(
      buildToday(
        rowsOf({
          planned_meals: planned(WED),
          workout_sessions: [{ id: 9, date: lastWed, template_id: "wed-legs-shoulders", started_at: `${lastWed}T17:00:00Z`, ended_at: `${lastWed}T18:00:00Z`, exercises: null }],
          set_logs: sets,
          lift_drops: [{ exercise_id: firstLift.id, weight_lb: 240, from_date: "2026-10-26", created_at: "2026-10-25T23:00:00Z" }],
        }),
        at(WED, "09:00"),
        true,
      ),
    );
    expect(m.training?.goUp).toBeNull();
  });
```

- [ ] **Step 2: Run them to make sure they fail.**

```bash
npx vitest run --project unit tests/unit/domain/progression.test.ts tests/unit/workout/model.test.ts tests/unit/today/model.test.ts
```

Expected: FAIL. `withDrop` is not a function, the workout suggests 280 with `goUp: true`, and Today still says the leg press goes up.

- [ ] **Step 3: The rule.** In `app/domain/progression.ts`, add at the top:

```ts
import type { ISODate } from './types';
```

and at the end:

```ts
/** A stuck lift dropped back at the check-in: this weight for its first session on or after `from` (a Monday). */
export interface LiftDrop {
  weight: number;
  from: ISODate;
}

/** The drop applies to a session on or after its Monday, until the lift has been logged on or after that Monday. */
export function dropApplies(drop: LiftDrop | null, lastSessionDate: ISODate | null, on: ISODate): drop is LiftDrop {
  return drop !== null && on >= drop.from && (lastSessionDate === null || lastSessionDate < drop.from);
}

/** The suggestion with a pending drop applied. After the dropped session, the usual rule runs on it. */
export function withDrop(suggestion: Suggestion, drop: LiftDrop | null, lastSessionDate: ISODate | null, on: ISODate): Suggestion {
  return dropApplies(drop, lastSessionDate, on) ? { weight: drop.weight, goUp: false } : suggestion;
}
```

- [ ] **Step 4: Read the drop.** In `app/workout/sessions.ts`, change the progression import to `import type { Feel, LiftDrop, LoggedSet } from "~/domain/progression";` and add at the end:

```ts
/** The check-in's drop for a lift, if one was set. Whether it still applies is `dropApplies`'s call. */
export function dropFor(rows: Rows, exerciseId: string): LiftDrop | null {
  const r = rows("lift_drops").find((d) => d.exercise_id === exerciseId);
  return r ? { weight: n(r, "weight_lb"), from: s(r, "from_date") } : null;
}
```

- [ ] **Step 5: The workout model.** In `app/workout/model.ts`:

1. Change the progression import to:

```ts
import { dropApplies, nextSuggestion, restSeconds, withDrop, type Feel, type LiftDrop, type LoggedSet, type Suggestion } from "~/domain/progression";
```

and the sessions import to:

```ts
import { doneDates, dropFor, finishedAt, lastSession, sessionKey, setsBySession, type LastSession, type Rows } from "./sessions";
```

2. In `interface LiftView`, add after `suggestion: Suggestion;`:

```ts
  /** The check-in's drop, while it still applies to this day's session. */
  drop: LiftDrop | null;
```

3. In `buildWorkout`'s `lifts` map, replace

```ts
    const last = lastSession(rows, l.exercise, date);
```

with

```ts
    const last = lastSession(rows, l.exercise, date);
    const drop = dropFor(rows, l.exercise);
    const lastDate = last?.date ?? null;
```

and replace

```ts
      suggestion: nextSuggestion(last?.sets ?? null, { repMax: l.repMax, increment: ex.increment, deload }, last?.feel ?? null),
```

with

```ts
      suggestion: withDrop(nextSuggestion(last?.sets ?? null, { repMax: l.repMax, increment: ex.increment, deload }, last?.feel ?? null), drop, lastDate, date),
      drop: dropApplies(drop, lastDate, date) ? drop : null,
```

4. In `lastLine`, after the `const head = ...` line, add:

```ts
  // A drop is not progression, so it reads in plain ink, never the brass callout.
  if (lift.drop) return { goUp: false, text: `${head} Dropped to ${lift.drop.weight} at Sunday's check-in. Build back from here.` };
```

- [ ] **Step 6: Today.** In `app/today/model.ts`:

1. Change `import { nextSuggestion } from "~/domain/progression";` to `import { nextSuggestion, withDrop } from "~/domain/progression";`.
2. Change the sessions import to `import { doneDates, dropFor, lastSession, loggedDates, sessionKey, type Rows } from "~/workout/sessions";`.
3. In `trainingModel`, replace

```ts
    const next = nextSuggestion(last?.sets ?? null, { repMax: l.repMax, increment: ex.increment, deload }, last?.feel ?? null);
```

with

```ts
    const next = withDrop(nextSuggestion(last?.sets ?? null, { repMax: l.repMax, increment: ex.increment, deload }, last?.feel ?? null), dropFor(rows, l.exercise), last?.date ?? null, date);
```

- [ ] **Step 7: Run the tests and typecheck.** Same command as Step 2, then `npm run typecheck`. Expected: PASS, no type errors. The SetScreen already shows a non-`goUp` line in plain `ink-2`, so it needs no change.

- [ ] **Step 8: Commit.**

```bash
git add app/domain/progression.ts app/workout/sessions.ts app/workout/model.ts app/today/model.ts tests/unit/domain/progression.test.ts tests/unit/workout/model.test.ts tests/unit/today/model.test.ts
git commit -m "A lift dropped at the check-in starts its next session at the dropped weight, then builds back"
```

---

### Task 6: Two hungry Sundays make walking Rocky's pick

**Files:**
- Modify: `app/domain/energy.ts`, `app/checkin/call.ts`, `app/server/checkin.server.ts`
- Test: `tests/unit/domain/call.test.ts`, `tests/unit/checkin/call.test.ts`

- [ ] **Step 1: Write the failing tests.**

1. In `tests/unit/domain/call.test.ts`, add `hungry: false` to the object `input()` returns, after `halfPortionKcal: 2050,`. Then add at the end of the `describe`:

```ts
  it("makes walking Rocky's pick for a cut after two hungry Sundays, and changes no number", () => {
    expect(nextTarget(input({ hungry: true }))).toMatchObject({ kind: "cut", pick: "steps", hungry: true, calories: { kcal: 2300, stepGoal: 8500 }, steps: { kcal: 2400, stepGoal: 9500 } });
  });

  it("leaves half portions as they are: walking is already the pick", () => {
    const call = nextTarget(input({ week: week(2400, "updating"), trendWeight: 200, currentKcal: 2100, hungry: true }));
    expect(call).toMatchObject({ kind: "cut", guardrail: "half-portions", pick: "steps", hungry: false, calories: { kcal: 2050 } });
  });

  it("lets the cut stand when steps are already at 10,000", () => {
    expect(nextTarget(input({ stepGoal: 10000, baseStepGoal: 10000, hungry: true }))).toMatchObject({ kind: "cut", pick: "calories", hungry: false, steps: null });
  });

  it("ignores hunger on pace, on a raise, on a hold, and before a maintenance week", () => {
    expect(nextTarget(input({ week: week(2914, "updating"), trendWeight: 200, hungry: true }))).toMatchObject({ kind: "on-pace", pick: "calories", hungry: false });
    expect(nextTarget(input({ week: week(3100, "settling"), trendWeight: 200, hungry: true }))).toMatchObject({ kind: "raise", pick: "calories", hungry: false });
    expect(nextTarget(input({ changes: [-2.2, -2.5], hungry: true }))).toMatchObject({ kind: "hold", pick: "calories", hungry: false });
    expect(nextTarget(input({ maintenanceNext: true, hungry: true }))).toMatchObject({ kind: "maintenance", pick: "calories", hungry: false });
  });
```

2. In `tests/unit/checkin/call.test.ts`, add `hungry: false` to the `input` object inside `facts()`, after `halfPortionKcal: 2050,`. Then add at the end of the file:

```ts
describe("callView: hungry two Sundays running", () => {
  it("puts walking first as Rocky's pick and says why", () => {
    const view = callView(facts({}, { hungry: true }), "steps", FOODS);
    expect(view.why).toHaveLength(4);
    expect(view.why.at(-1)).toBe(`You were hungry two Sundays running, so ${COACH_NAME} picks steps over less food.`);
    expect(view.options).toEqual([
      { value: "steps", title: "Keep 2,400, walk 1,000 more", sub: `${PICK} Steps go to 8,000 a day instead.` },
      { value: "calories", title: "Trim 100 cal a day", sub: "Smaller portions of rice, honey and butter." },
    ]);
    expect(view).toMatchObject({ kcal: 2400, was: "holds", steps: "Steps 8,000" });
  });

  it("adds nothing when steps are already at 10,000", () => {
    const view = callView(facts({}, { hungry: true, stepGoal: 10000, baseStepGoal: 10000 }), "calories", FOODS);
    expect(view.why).toHaveLength(3);
    expect(view.options).toEqual([]);
  });
});
```

The fixture's week 3 is N3's: a settling cut from 2,400 to 2,300, with walking at 8,000 (this week's 7,000 goal plus 1,000).

- [ ] **Step 2: Run them to make sure they fail.**

```bash
npx vitest run --project unit tests/unit/domain/call.test.ts tests/unit/checkin/call.test.ts
```

Expected: the new tests FAIL. The pick stays `calories`, `hungry` is undefined, and there is no fourth why-line.

- [ ] **Step 3: The rule.** In `app/domain/energy.ts`:

1. Add after `export const GOAL_RATE = 0.005;`:

```ts
/** Losing more than this two weeks running holds a cut (the fast-loss guardrail). */
export const FAST_LOSS_LB = 2;
```

2. In `interface CallInput`, add after `halfPortionKcal: number;`:

```ts
  /** Hunger was High at this check-in and the last one: Rocky picks walking over a cut. */
  hungry: boolean;
```

3. In `interface Call`, add after `maintenanceKcal: number | null;`:

```ts
  /** True when two hungry Sundays moved Rocky's pick from calories to steps. The numbers are the same either way. */
  hungry: boolean;
```

4. In `nextTarget`, change the `base` line to include `hungry: false`:

```ts
  const base = { goalLbPerWeek, guardrail: null, calories: keep, steps: null, pick: "calories" as const, maintenanceKcal: null, hungry: false };
```

5. Replace the fast-loss condition

```ts
  if (kcal < currentKcal && thisWeek !== null && lastWeek !== null && thisWeek < -2 && lastWeek < -2) {
```

with

```ts
  if (kcal < currentKcal && thisWeek !== null && lastWeek !== null && thisWeek < -FAST_LOSS_LB && lastWeek < -FAST_LOSS_LB) {
```

6. Replace the last line of `nextTarget`

```ts
  return { ...base, kind, ideal, guardrail, calories: { kcal, stepGoal }, steps, pick };
```

with

```ts
  // Two hungry Sundays running: walking takes over a cut, when walking is on offer. Nothing else changes.
  const hungry = input.hungry && kind === "cut" && pick === "calories" && steps !== null;
  return { ...base, kind, ideal, guardrail, calories: { kcal, stepGoal }, steps, pick: hungry ? "steps" : pick, hungry };
```

- [ ] **Step 4: The why-line.** In `app/checkin/call.ts`:

1. Add after `const CANT = ...`:

```ts
const HUNGRY = `You were hungry two Sundays running, so ${COACH_NAME} picks steps over less food.`;
```

2. In `callView`, replace

```ts
  const why = f.energy.state === "holding" ? holdingLines(f) : [...readLines(f), ...moveLines(f)];
```

with

```ts
  const why = [...(f.energy.state === "holding" ? holdingLines(f) : [...readLines(f), ...moveLines(f)]), ...(call.hungry ? [HUNGRY] : [])];
```

- [ ] **Step 5: The v1 path.** In `app/server/checkin.server.ts`, in `checkInData`'s `nextTarget({ ... })` call, add after `halfPortionKcal: HALF_PORTION_KCAL,`:

```ts
    // v1's page has no taps. P4b replaces this path.
    hungry: false,
```

- [ ] **Step 6: Run the tests and typecheck.**

```bash
npx vitest run --project unit tests/unit/domain/call.test.ts tests/unit/checkin/call.test.ts
npx vitest run --project workers tests/workers/checkin-engine.test.ts
npm run typecheck
```

Expected: PASS, no type errors.

- [ ] **Step 7: Commit.**

```bash
git add app/domain/energy.ts app/checkin/call.ts app/server/checkin.server.ts tests/unit/domain/call.test.ts tests/unit/checkin/call.test.ts
git commit -m "Two hungry Sundays running turn a cut into Rocky's walking pick"
```

---

### Task 7: The week's call over the phone's copy

N3 wires the engine through Drizzle in `checkInData`. This lifts that wiring into a pure `weekCall(rows, monday, { hungry })` with the same inputs and outputs, so the page and `finishCheckIn` run it over the store. It is checked against N3's worked example, seeded as rows.

**Files:**
- Create: `app/checkin/engine.ts`, `tests/unit/checkin/fixture.ts`
- Test: `tests/unit/checkin/engine.test.ts`

- [ ] **Step 1: The fixture.** Create `tests/unit/checkin/fixture.ts`. `weekThree()` is used from Task 8 on; it is written now so the whole fixture reads in one place.

```ts
// Seeded weeks for the check-in's rules, as raw rows (the phone's copy and D1 hold the same shapes).
import { addDays } from "~/domain/dates";
import type { Row } from "~/sync/tables";

export type Tables = Record<string, Row[]>;

export const rowsOf = (t: Tables) => (name: string) => t[name] ?? [];

export const SHOULDER = "seated-dumbbell-shoulder-press";
export const BOWL = "chicken-and-rice-bowl";
export const THIGHS = "honey-glazed-chicken-thighs";

const SLOT_KCAL = [
  ["breakfast", 500],
  ["lunch", 600],
  ["snack", 250],
  ["dinner", 600],
  ["dessert", 450],
] as const;

const eaten = (date: string, slot: string, kcal: number): Row => ({
  client_id: `seed-${date}-${slot}`,
  date,
  slot,
  meal_slug: null,
  name: "Seed",
  category: "planned",
  kcal,
  protein_g: 36,
  relaxed: 0,
  portions: 1,
  logged_at: `${date}T18:00:00Z`,
});

/**
 * N3's worked example. A weigh-in every day from Sunday Oct 4, the day before the phase, falling 0.07 lb a day
 * (206.0 to 204.5). Every slot eaten from Oct 5 at 2,400 a day and 180 g protein, except Saturday Oct 24's dessert,
 * which leaves that day partial and out of the math. 7,700 steps a day in week 3 (Oct 19 to 25).
 * The trend: 206.0 on Oct 4, 205.99 on Oct 5, 205.508 on Oct 18, 205.092 on Oct 25.
 * Week 3's burn: 2,400 + 3,500 x (206.0 - 205.092) / 21 = 2,551. Halfway from 2,800: 2,676, to 2,680.
 */
export function threeWeeks(): Tables {
  const t: Tables = { weigh_ins: [], meal_logs: [], steps_daily: [] };
  for (let d = 0; d < 22; d++) {
    const date = addDays("2026-10-04", d);
    t.weigh_ins.push({ date, weight_lb: Math.round((206 - 0.07 * d) * 10) / 10, logged_at: `${date}T12:00:00Z` });
    if (date < "2026-10-05") continue;
    for (const [slot, kcal] of SLOT_KCAL) if (!(date === "2026-10-24" && slot === "dessert")) t.meal_logs.push(eaten(date, slot, kcal));
    if (date >= "2026-10-19") t.steps_daily.push({ date, steps: 7700, updated_at: `${date}T23:00:00Z` });
  }
  return t;
}

const session = (id: number, date: string, template: string): Row => ({
  id,
  client_id: `w-${id}`,
  date,
  template_id: template,
  started_at: `${date}T17:00:00Z`,
  ended_at: `${date}T18:00:00Z`,
  planned_at: `${date}T17:00:00Z`,
  exercises: null,
  lifts: null,
  feel: null,
});

const set = (id: number, date: string, exercise: string, position: number, setNumber: number, weight: number, reps: number): Row => ({
  client_id: `set-${id}-${position}-${setNumber}`,
  session_id: id,
  session_key: `w-${id}`,
  exercise_id: exercise,
  position,
  set_number: setNumber,
  weight_lb: weight,
  reps,
  logged_at: `${date}T17:${String(10 + position * 5 + setNumber).padStart(2, "0")}:00Z`,
});

const dessert = (id: string, date: string, at: string): Row => ({
  client_id: id,
  date,
  slot: null,
  meal_slug: null,
  name: "Sugar-free jello",
  category: "dessert",
  kcal: 0,
  protein_g: 0,
  relaxed: 0,
  portions: 1,
  logged_at: at,
});

/**
 * Week 3 (Mon Oct 19 to Sun Oct 25) on top of threeWeeks(). None of it moves the engine's numbers.
 * - Lunch Mon to Thu is the chicken and rice bowl (4 times); dinner Mon, Wed and Fri the honey-glazed thighs (3 times).
 * - Thursday's snack has 12 g protein and its dinner none: 36 x 3 + 12 = 120 g. Every other tracked day is 180 g, so
 *   the six tracked days average 1,020 / 6 = 170 g. Saturday stays partial (no dessert): 144 g, not tracked.
 * - Saturday walked 5,900. The week averages (7,700 x 6 + 5,900) / 7 = 7,443, still over the 7,000 goal, so the
 *   ramp stays at 7,500.
 * - Three off-plan desserts at 0 cal, two Friday and one Sunday: Sunday's is past the 2 allowed, so Sunday isn't a
 *   full day. Full days: Mon, Tue, Wed and Fri, 4.
 * - Workouts: Mon incline press 50 x 10, 10 and pec deck 130 x 12, 12 (both at the top: 55 and 135 next).
 *   Tuesday's extra: hammer curl 30 x 10. Wed shoulder press 45 x 8, 7, as on Oct 7 and Oct 14 (stuck, drop 40).
 *   Friday missed.
 * - Waist 35.75 on Oct 11 and 35.5 on Sunday Oct 25.
 * - Steak and baked potato rested until Oct 21 (back next week), salmon and rice until Nov 3 (still resting next
 *   Monday), burger bowl until Oct 18 (back before this week).
 */
export function weekThree(): Tables {
  const t = threeWeeks();
  t.meal_logs = t.meal_logs.map((l) => {
    const date = l.date as string;
    const slot = l.slot as string;
    if (slot === "lunch" && date >= "2026-10-19" && date <= "2026-10-22") return { ...l, meal_slug: BOWL };
    if (slot === "dinner" && ["2026-10-19", "2026-10-21", "2026-10-23"].includes(date)) return { ...l, meal_slug: THIGHS };
    if (date === "2026-10-22" && slot === "snack") return { ...l, protein_g: 12 };
    if (date === "2026-10-22" && slot === "dinner") return { ...l, protein_g: 0 };
    return l;
  });
  t.meal_logs.push(dessert("d-1", "2026-10-23", "2026-10-23T23:30:00Z"), dessert("d-2", "2026-10-23", "2026-10-23T23:45:00Z"), dessert("d-3", "2026-10-25", "2026-10-25T23:30:00Z"));
  t.steps_daily = t.steps_daily.map((s) => (s.date === "2026-10-24" ? { ...s, steps: 5900 } : s));
  t.workout_sessions = [
    session(1007, "2026-10-07", "wed-legs-shoulders"),
    session(1014, "2026-10-14", "wed-legs-shoulders"),
    session(1019, "2026-10-19", "mon-chest-back-arms"),
    session(1020, "2026-10-20", "optional-arms-back"),
    session(1021, "2026-10-21", "wed-legs-shoulders"),
  ];
  t.set_logs = [
    ...([
      [1007, "2026-10-07"],
      [1014, "2026-10-14"],
      [1021, "2026-10-21"],
    ] as const).flatMap(([id, date]) => [set(id, date, SHOULDER, 4, 1, 45, 8), set(id, date, SHOULDER, 4, 2, 45, 7)]),
    set(1019, "2026-10-19", "incline-dumbbell-press", 0, 1, 50, 10),
    set(1019, "2026-10-19", "incline-dumbbell-press", 0, 2, 50, 10),
    set(1019, "2026-10-19", "pec-deck", 1, 1, 130, 12),
    set(1019, "2026-10-19", "pec-deck", 1, 2, 130, 12),
    set(1020, "2026-10-20", "hammer-curl", 2, 1, 30, 10),
  ];
  t.waist_logs = [
    { date: "2026-10-11", inches: 35.75 },
    { date: "2026-10-25", inches: 35.5 },
  ];
  t.meal_state = [
    { slug: "steak-and-baked-potato", photo_key: null, rested_until: "2026-10-21" },
    { slug: "salmon-and-rice", photo_key: null, rested_until: "2026-11-03" },
    { slug: "burger-bowl", photo_key: null, rested_until: "2026-10-18" },
  ];
  return t;
}

/** A saved check-in row, for the week before, with only what a test sets. */
export function checkInRow(weekStart: string, over: Row = {}): Row {
  return {
    week_start: weekStart,
    avg_weight: null,
    change: null,
    adherence: 0,
    outcome: "{}",
    completed_at: "2026-10-18T23:00:00.000Z",
    burn: null,
    burn_state: null,
    intake_avg: null,
    tracked_days: null,
    hunger: null,
    energy: null,
    sleep: null,
    ...over,
  };
}
```

- [ ] **Step 2: Write the failing tests.** Create `tests/unit/checkin/engine.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { hungryTwice, weekCall } from "~/checkin/engine";
import { checkInRow, rowsOf, threeWeeks } from "./fixture";

describe("weekCall", () => {
  it("gives N3's worked example from rows: a settling cut of 100", () => {
    const wc = weekCall(rowsOf(threeWeeks()), "2026-10-19", { hungry: false });
    // Trend 205.092 on Sunday, 205.508 the Sunday before.
    expect(wc).toMatchObject({ monday: "2026-10-19", sunday: "2026-10-25", trendWeight: 205.1, change: -0.4, avgSteps: 7700, rampedStepGoal: 7500, thisWeekKcal: 2400 });
    expect(wc.energy).toMatchObject({ burn: 2680, state: "settling", updates: 1, intakeAvg: 2400, trackedDays: 6, windowTrackedDays: 20, weighIns: 21 });
    // The facts N3's callView reads: no targets rows, so the plan's 2,400, 7,000 and 180.
    expect(wc).toMatchObject({ lastBurn: 2800, kcal: 2400, stepGoal: 7000, proteinG: 180, weekNumber: 3 });
    // Ideal: 2,680 - 0.005 x 205.092 x 3,500 / 7 = 2,167, down to 2,150. Settling moves 100. Walking: 7,000 + 1,000.
    expect(wc.call).toMatchObject({ kind: "cut", ideal: 2150, guardrail: null, pick: "calories", hungry: false, calories: { kcal: 2300, stepGoal: 7500 }, steps: { kcal: 2400, stepGoal: 8000 } });
  });

  it("passes hunger to the call", () => {
    expect(weekCall(rowsOf(threeWeeks()), "2026-10-19", { hungry: true }).call).toMatchObject({ kind: "cut", pick: "steps", hungry: true, calories: { kcal: 2300 } });
  });

  it("holds at the plan's burn before the phase starts", () => {
    const wc = weekCall(rowsOf(threeWeeks()), "2026-09-28", { hungry: false });
    expect(wc.energy).toMatchObject({ state: "holding", burn: 2800, updates: 0 });
    expect(wc).toMatchObject({ trendWeight: null, change: null, lastBurn: 2800 });
    expect(wc.call).toMatchObject({ kind: "hold", steps: null });
  });
});

describe("hungryTwice", () => {
  it("needs High now and High saved last week; a skipped week breaks the run", () => {
    const t = threeWeeks();
    t.check_ins = [checkInRow("2026-10-12", { hunger: "high" }), checkInRow("2026-10-05", { hunger: "high" })];
    const rows = rowsOf(t);
    expect(hungryTwice(rows, "2026-10-19", "high")).toBe(true);
    expect(hungryTwice(rows, "2026-10-19", "fine")).toBe(false);
    expect(hungryTwice(rows, "2026-10-19", null)).toBe(false);
    // Oct 19 was skipped, so Oct 26's High follows nothing.
    expect(hungryTwice(rows, "2026-10-26", "high")).toBe(false);
  });
});
```

- [ ] **Step 3: Run them to make sure they fail.**

```bash
npx vitest run --project unit tests/unit/checkin/engine.test.ts
```

Expected: FAIL, "Cannot find module '~/checkin/engine'".

- [ ] **Step 4: Implement.** Create `app/checkin/engine.ts`:

```ts
// The week's call over the phone's copy (spec section 1, "The call over the phone's copy"). The check-in page runs it
// in the browser, and finishCheckIn runs it over a scan of the same tables. N3's checkInData did the same through
// Drizzle; the inputs and outputs are the same. Pure.
import { plan } from "~/content";
import { HALF_PORTION_KCAL } from "~/content/scaled";
import { resolveBaseTargets, resolveTargets } from "~/content/targets";
import { weekNumber, weekType } from "~/domain/calendar";
import { dayIntake, type LogFacts } from "~/domain/completeness";
import { addDays } from "~/domain/dates";
import { energyHistory, nextTarget, type EnergyWeek } from "~/domain/energy";
import { rampStepGoal } from "~/domain/steps";
import { roundLb, trendReading, trendSeries, weeklyTrendChange } from "~/domain/trend";
import type { ISODate } from "~/domain/types";
import { checkInBurns, targetEntries, type Rows } from "~/today/slots";
import type { CallFacts } from "./call";

export interface WeekCall extends CallFacts {
  monday: ISODate;
  sunday: ISODate;
  /** The trend on Sunday, to 0.1 lb. Null before 3 weigh-ins. */
  trendWeight: number | null;
  /** Sunday's trend minus last Sunday's, to 0.1 lb. */
  change: number | null;
  /** The week's steps over 7, as v1 averaged them. */
  avgSteps: number;
  /** Next week's step goal after the ramp. */
  rampedStepGoal: number;
  /** This week's calorie target as eaten, a maintenance week included. "On your scale from Monday" starts from it. */
  thisWeekKcal: number;
}

/** A week before the phase began: nothing to read, so the burn holds at the plan's estimate. */
const beforePhase = (monday: ISODate): EnergyWeek => ({
  weekStart: monday,
  burn: plan.maintenanceKcal,
  state: "holding",
  updates: 0,
  observed: null,
  intakeAvg: null,
  trackedDays: 0,
  windowTrackedDays: 0,
  weighIns: 0,
  trendStart: null,
  trendEnd: null,
});

/** Every weigh-in up to a date, oldest first. The trend starts at the first one ever. */
export function weighIns(rows: Rows, through: ISODate): { date: ISODate; weight: number }[] {
  return rows("weigh_ins")
    .map((r) => ({ date: r.date as ISODate, weight: Number(r.weight_lb) }))
    .filter((w) => w.date <= through)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** This check-in's hunger tap is High, and so is last week's saved one. A skipped check-in last week breaks the run. */
export function hungryTwice(rows: Rows, monday: ISODate, hunger: string | null): boolean {
  if (hunger !== "high") return false;
  const lastWeek = addDays(monday, -7);
  return rows("check_ins").some((r) => r.week_start === lastWeek && r.hunger === "high");
}

export function weekCall(rows: Rows, monday: ISODate, { hungry }: { hungry: boolean }): WeekCall {
  const sunday = addDays(monday, 6);
  const weights = weighIns(rows, sunday);
  const series = trendSeries(weights, sunday);
  const trendWeight = trendReading(weights, sunday)?.weight ?? null;
  const thisChange = weeklyTrendChange(series, sunday);

  const entries = targetEntries(rows);
  const base = resolveBaseTargets(entries, sunday);
  const thisWeekKcal = resolveTargets(entries, sunday, checkInBurns(rows)).kcal;
  const steps = new Map(rows("steps_daily").map((r) => [r.date as ISODate, Number(r.steps)]));
  let stepSum = 0;
  for (let i = 0; i < 7; i++) stepSum += steps.get(addDays(monday, i)) ?? 0;
  const avgSteps = Math.round(stepSum / 7);
  const rampedStepGoal = rampStepGoal(base.stepGoal, avgSteps);

  const byDate = new Map<ISODate, (LogFacts & { kcal: number })[]>();
  for (const l of rows("meal_logs")) {
    const d = l.date as ISODate;
    if (d < plan.phaseStart || d > sunday) continue;
    const day = byDate.get(d) ?? [];
    day.push({ slot: (l.slot as string | null) ?? null, category: l.category as string, kcal: Number(l.kcal) });
    byDate.set(d, day);
  }
  const weighed = new Set(weights.map((w) => w.date));
  const weeks = energyHistory({
    phaseStart: plan.phaseStart,
    through: monday,
    priorBurn: plan.maintenanceKcal,
    intake: (d) => {
      const day = byDate.get(d);
      return day ? dayIntake(day) : null;
    },
    trend: (d) => series.get(d) ?? null,
    weighedIn: (d) => weighed.has(d),
  });
  const energy = weeks.at(-1) ?? beforePhase(monday);
  const call = nextTarget({
    week: energy,
    trendWeight: series.get(sunday) ?? 0,
    currentKcal: base.kcal,
    stepGoal: rampedStepGoal,
    baseStepGoal: base.stepGoal,
    changes: [thisChange, weeklyTrendChange(series, addDays(sunday, -7))],
    maintenanceNext: weekType(plan, addDays(monday, 7)) === "maintenance",
    halfPortionKcal: HALF_PORTION_KCAL,
    hungry,
  });
  return {
    monday,
    sunday,
    trendWeight,
    change: trendWeight !== null && thisChange !== null ? roundLb(thisChange) : null,
    avgSteps,
    rampedStepGoal,
    thisWeekKcal,
    call,
    energy,
    lastBurn: weeks.at(-2)?.burn ?? plan.maintenanceKcal,
    kcal: base.kcal,
    stepGoal: base.stepGoal,
    proteinG: base.proteinG,
    weekNumber: weekNumber(plan, monday),
  };
}
```

- [ ] **Step 5: Run the tests.** Same command as Step 3. Expected: PASS, all 4.

- [ ] **Step 6: Commit.**

```bash
git add app/checkin/engine.ts tests/unit/checkin/fixture.ts tests/unit/checkin/engine.test.ts
git commit -m "The week's call runs over the phone's copy, with N3's worked example as rows"
```

---

### Task 8: Meal repeats, rests, and next week's preview

**Files:**
- Create: `app/checkin/meals.ts`
- Test: `tests/unit/checkin/meals.test.ts`

- [ ] **Step 1: Write the failing tests.** Create `tests/unit/checkin/meals.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { backFromRest, defaultRests, groceryCount, lastEatenBefore, mealRepeats, previewNextWeek, restUntil } from "~/checkin/meals";
import { BOWL, rowsOf, THIGHS, weekThree } from "./fixture";

const rows = rowsOf(weekThree());

describe("meal repeats", () => {
  it("lists planned meals eaten 3 or more times, most first, and rests 4 or more by default", () => {
    const repeats = mealRepeats(rows, "2026-10-19");
    expect(repeats).toEqual([
      { slug: BOWL, name: "Chicken and rice bowl", count: 4 },
      { slug: THIGHS, name: "Honey-glazed chicken thighs", count: 3 },
    ]);
    expect(defaultRests(repeats)).toEqual([BOWL]);
  });

  it("rests two full weeks from next Monday", () => {
    // Oct 26 + 13 days.
    expect(restUntil("2026-10-19")).toBe("2026-11-08");
  });

  it("names meals back from rest by next Monday", () => {
    // Steak rested until Oct 21 is back; salmon until Nov 3 still rests; burger bowl came back before this week.
    expect(backFromRest(rows, "2026-10-19")).toEqual(["Steak and baked potato"]);
    expect(backFromRest(rows, "2026-10-12")).toEqual(["Burger bowl"]);
  });
});

describe("next week's preview", () => {
  it("keeps the latest day each meal was eaten", () => {
    expect(lastEatenBefore(rows, "2026-10-26")).toEqual({ [BOWL]: "2026-10-22", [THIGHS]: "2026-10-23" });
    expect(lastEatenBefore(rows, "2026-10-21")).toEqual({ [BOWL]: "2026-10-20", [THIGHS]: "2026-10-19" });
  });

  it("plans 35 slots without the switched-on rests or meals still resting", () => {
    const week = previewNextWeek(rows, "2026-10-19", [BOWL]);
    expect(week).toHaveLength(35);
    expect(week[0].date).toBe("2026-10-26");
    expect(week.at(-1)!.date).toBe("2026-11-01");
    expect(week.some((p) => p.slug === BOWL || p.slug === "salmon-and-rice")).toBe(false);
  });

  it("counts a week's foods as the grocery list does", () => {
    // Chicken, rice, butter and pineapple, however many times the bowl comes up.
    expect(groceryCount([BOWL])).toBe(4);
    expect(groceryCount([BOWL, BOWL])).toBe(4);
    expect(groceryCount([])).toBe(0);
  });
});
```

- [ ] **Step 2: Run them to make sure they fail.**

```bash
npx vitest run --project unit tests/unit/checkin/meals.test.ts
```

Expected: FAIL, "Cannot find module '~/checkin/meals'".

- [ ] **Step 3: Implement.** Create `app/checkin/meals.ts`:

```ts
// Next week's meals as the check-in sees them (spec section 1, "Meal repeats and rests"). Pure: the page previews with
// it, finishCheckIn writes with the same rotation inputs, and P4c's grocery preview reuses previewNextWeek.
import { foods, meals } from "~/content";
import { addDays } from "~/domain/dates";
import { buildGroceryList } from "~/domain/groceries";
import { generateWeek, type PlannedMeal, type RotationMeal } from "~/domain/rotation";
import type { ISODate } from "~/domain/types";
import { restedOn, type Rows } from "~/today/slots";

/** Eaten this many times in a week, a meal is listed with a rest switch. */
export const REPEAT_AT = 3;
/** From this many, the switch starts on. */
export const REST_DEFAULT_AT = 4;

export interface MealRepeat {
  slug: string;
  name: string;
  count: number;
}

export function rotationMeals(): RotationMeal[] {
  return [...meals.values()].map((m) => ({ slug: m.slug, pool: m.pool, mode: m.mode, tags: m.tags }));
}

/** Planned meals eaten 3 or more times in the week, most first, then by name. A skip has no slug, so it never counts. */
export function mealRepeats(rows: Rows, monday: ISODate): MealRepeat[] {
  const sunday = addDays(monday, 6);
  const counts = new Map<string, number>();
  for (const l of rows("meal_logs")) {
    const d = l.date as ISODate;
    if (l.category !== "planned" || typeof l.meal_slug !== "string" || d < monday || d > sunday) continue;
    counts.set(l.meal_slug, (counts.get(l.meal_slug) ?? 0) + 1);
  }
  return [...counts]
    .filter(([slug, count]) => count >= REPEAT_AT && meals.has(slug))
    .map(([slug, count]) => ({ slug, name: meals.get(slug)!.name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/** The switches as the page opens: on for 4 or more, off for 3. */
export function defaultRests(repeats: MealRepeat[]): string[] {
  return repeats.filter((r) => r.count >= REST_DEFAULT_AT).map((r) => r.slug);
}

/** A rest chosen at this check-in runs two full weeks: next Monday plus 13 days, as v1 did. */
export function restUntil(monday: ISODate): ISODate {
  return addDays(monday, 20);
}

/** Meals resting at some point this week that are back in rotation by next Monday, by name. */
export function backFromRest(rows: Rows, monday: ISODate): string[] {
  const next = addDays(monday, 7);
  return rows("meal_state")
    .filter((r) => typeof r.rested_until === "string" && r.rested_until >= monday && r.rested_until < next && meals.has(r.slug as string))
    .map((r) => meals.get(r.slug as string)!.name)
    .sort((a, b) => a.localeCompare(b));
}

/** The latest day each meal was eaten before a date, as the rotation reads it. */
export function lastEatenBefore(rows: Rows, before: ISODate): Record<string, ISODate> {
  const out: Record<string, ISODate> = {};
  for (const l of rows("meal_logs")) {
    const slug = l.meal_slug;
    const d = l.date as ISODate;
    if (typeof slug !== "string" || d >= before) continue;
    if (!out[slug] || d > out[slug]) out[slug] = d;
  }
  return out;
}

/** Next week's 35 slots as Finish would write them: the rotation, with what already rests next Monday and the switches that are on. */
export function previewNextWeek(rows: Rows, monday: ISODate, rest: string[]): PlannedMeal[] {
  const next = addDays(monday, 7);
  return generateWeek({ weekStart: next, meals: rotationMeals(), lastEaten: lastEatenBefore(rows, next), rested: [...new Set([...restedOn(rows, next), ...rest])] });
}

/** How many foods a week of meals needs, as the grocery list counts them. The grams don't change the count. */
export function groceryCount(slugs: string[]): number {
  const ingredients = new Map([...meals.values()].map((m) => [m.slug, m.ingredients.map((i) => ({ foodId: i.food, grams: i.grams }))]));
  const info = new Map([...foods].map(([id, f]) => [id, { name: f.name, section: f.section }]));
  return buildGroceryList(slugs, ingredients, info).reduce((n, g) => n + g.items.length, 0);
}
```

- [ ] **Step 4: Run the tests.** Same command as Step 2. Expected: PASS, all 6.

- [ ] **Step 5: Commit.**

```bash
git add app/checkin/meals.ts tests/unit/checkin/meals.test.ts
git commit -m "The check-in reads meal repeats, rest defaults, meals back from rest, and next week's preview"
```

---

### Task 9: The week's lifts

**Files:**
- Create: `app/checkin/lifts.ts`
- Test: `tests/unit/checkin/lifts.test.ts`

- [ ] **Step 1: Write the failing tests.** Create `tests/unit/checkin/lifts.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { liftWeek } from "~/checkin/lifts";
import { rowsOf, SHOULDER, weekThree, type Tables } from "./fixture";

describe("liftWeek", () => {
  it("counts planned, done, extras and misses, and finds what moved up and what is stuck", () => {
    expect(liftWeek(rowsOf(weekThree()), "2026-10-19", "2026-10-26")).toEqual({
      planned: 3,
      plannedDone: 2,
      extras: ["2026-10-20"],
      missed: ["2026-10-23"],
      movedUp: [
        { exercise: "incline-dumbbell-press", name: "Incline dumbbell press", from: 50, to: 55 },
        { exercise: "pec-deck", name: "Pec deck", from: 130, to: 135 },
      ],
      stuck: [{ exercise: SHOULDER, name: "Seated dumbbell shoulder press", top: 45, lastSets: [{ weight: 45, reps: 8 }, { weight: 45, reps: 7 }], chase: [8, 8], drop: 40 }],
      nextWeekDeload: false,
    });
  });

  it("counts only past days as missed while the week is still going", () => {
    expect(liftWeek(rowsOf(weekThree()), "2026-10-19", "2026-10-22")).toMatchObject({ plannedDone: 2, missed: [] });
  });

  it("moves nothing up and plans nothing for a stuck lift when next week is the deload", () => {
    // Week 7 (Nov 16 to 22): the pec deck hit the top, but week 8 is the deload.
    const t: Tables = {
      workout_sessions: [{ id: 2000, client_id: "w-2000", date: "2026-11-16", template_id: "mon-chest-back-arms", started_at: "2026-11-16T17:00:00Z", ended_at: "2026-11-16T18:00:00Z", planned_at: null, exercises: null, lifts: null, feel: null }],
      set_logs: [1, 2].map((n) => ({ client_id: `s-${n}`, session_id: 2000, session_key: "w-2000", exercise_id: "pec-deck", position: 1, set_number: n, weight_lb: 130, reps: 12, logged_at: `2026-11-16T17:0${n}:00Z` })),
    };
    expect(liftWeek(rowsOf(t), "2026-11-16", "2026-11-23")).toMatchObject({ movedUp: [], stuck: [], nextWeekDeload: true });
  });
});
```

- [ ] **Step 2: Run them to make sure they fail.**

```bash
npx vitest run --project unit tests/unit/checkin/lifts.test.ts
```

Expected: FAIL, "Cannot find module '~/checkin/lifts'".

- [ ] **Step 3: Implement.** Create `app/checkin/lifts.ts`:

```ts
// The week's lifts as the check-in reads them: workouts planned and done, extras, misses, what moved up and what is
// stuck (spec section 1, "Stuck lifts", and the digest's `lifts`). Pure.
import { exercises, plan } from "~/content";
import { isTrainingDay, setsFor, weekType, type Moves } from "~/domain/calendar";
import { addDays } from "~/domain/dates";
import { nextSuggestion, type Feel, type LoggedSet } from "~/domain/progression";
import { stuckLifts, type LiftHistory } from "~/domain/stalls";
import type { ISODate } from "~/domain/types";
import type { Row } from "~/sync/tables";
import { resolveLifts } from "~/workout/lifts";
import { doneDates, sessionKey, setsBySession, type Rows } from "~/workout/sessions";

export interface MovedUp {
  exercise: string;
  name: string;
  from: number;
  to: number;
}

export interface Stuck {
  exercise: string;
  name: string;
  top: number;
  lastSets: LoggedSet[];
  chase: number[];
  drop: number;
}

export interface LiftWeek {
  planned: number;
  plannedDone: number;
  /** Rest days with a workout done. */
  extras: ISODate[];
  /** Planned days before `today` with nothing done. */
  missed: ISODate[];
  movedUp: MovedUp[];
  stuck: Stuck[];
  nextWeekDeload: boolean;
}

/** One lift in one workout, with its logged sets. */
export interface Performed {
  exercise: string;
  date: ISODate;
  position: number;
  repMax: number;
  sets: LoggedSet[];
  feel: Feel | null;
  /** The last set's time, to order two workouts on one day. */
  at: string;
}

// An added lift with no list to read takes the added range's top.
const DEFAULT_REP_MAX = 12;
const asFeel = (v: unknown): Feel | null => (v === "easy" || v === "right" || v === "hard" ? v : null);

/** Every lift done with logged sets up to a date, oldest first. */
export function performedLifts(rows: Rows, through: ISODate): Performed[] {
  const bySession = setsBySession(rows);
  const out: Performed[] = [];
  for (const session of rows("workout_sessions")) {
    const date = session.date as ISODate;
    if (date > through) continue;
    const sets = bySession.get(sessionKey(session)) ?? [];
    if (sets.length === 0) continue;
    const list = resolveLifts(rows, session, session.template_id as string, date);
    const byPosition = new Map<number, Row[]>();
    for (const r of sets) byPosition.set(Number(r.position), [...(byPosition.get(Number(r.position)) ?? []), r]);
    for (const [position, logged] of byPosition) {
      const exercise = logged[0].exercise_id as string;
      if (!exercises.has(exercise)) continue;
      const lift = list.find((l) => l.position === position) ?? list.find((l) => l.exercise === exercise);
      const ordered = [...logged].sort((a, b) => Number(a.set_number) - Number(b.set_number));
      out.push({
        exercise,
        date,
        position,
        repMax: lift?.repMax ?? DEFAULT_REP_MAX,
        sets: ordered.map((r) => ({ weight: Number(r.weight_lb), reps: Number(r.reps) })),
        feel: asFeel(session.feel),
        at: ordered.reduce((latest, r) => ((r.logged_at as string) > latest ? (r.logged_at as string) : latest), ""),
      });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.at.localeCompare(b.at) || a.position - b.position);
}

/** The week's lifts. `today` decides which planned days count as missed: none on or after it. */
export function liftWeek(rows: Rows, monday: ISODate, today: ISODate): LiftWeek {
  const sunday = addDays(monday, 6);
  const nextMonday = addDays(monday, 7);
  const moves: Moves = Object.fromEntries(rows("schedule_moves").map((r) => [r.date as string, (r.template_id as string | null) ?? null]));
  const done = doneDates(rows, today);
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const planned = days.filter((d) => isTrainingDay(plan, d, moves));
  const nextWeekDeload = weekType(plan, nextMonday) === "deload";
  const performed = performedLifts(rows, sunday);

  // The workout model's moved-up rule, on each lift's newest session this week.
  const latest = new Map<string, Performed>();
  for (const p of performed) if (p.date >= monday) latest.set(p.exercise, p);
  const movedUp = [...latest.values()]
    .sort((a, b) => a.date.localeCompare(b.date) || a.position - b.position)
    .flatMap((p) => {
      const ex = exercises.get(p.exercise)!;
      const next = nextSuggestion(p.sets, { repMax: p.repMax, increment: ex.increment, deload: nextWeekDeload }, p.feel);
      return next.goUp && next.weight !== null ? [{ exercise: p.exercise, name: ex.name, from: Math.max(...p.sets.map((s) => s.weight)), to: next.weight }] : [];
    });

  const histories = new Map<string, LiftHistory>();
  for (const p of performed) {
    const ex = exercises.get(p.exercise)!;
    const h = histories.get(p.exercise) ?? { exercise: p.exercise, increment: ex.increment, bodyWeight: ex.equipment === "body-weight", repMax: p.repMax, sessions: [] };
    h.repMax = p.repMax;
    h.sessions.push({ date: p.date, sets: p.sets, deload: weekType(plan, p.date) === "deload" });
    histories.set(p.exercise, h);
  }
  // A deload next week replaces the stuck cards: nothing moves, so there is nothing to plan.
  const stuck = nextWeekDeload
    ? []
    : stuckLifts([...histories.values()], monday, sunday, setsFor(plan, nextMonday)).map((s) => ({ ...s, name: exercises.get(s.exercise)!.name }));

  return {
    planned: planned.length,
    plannedDone: planned.filter((d) => done.has(d)).length,
    extras: days.filter((d) => !isTrainingDay(plan, d, moves) && done.has(d)),
    missed: planned.filter((d) => !done.has(d) && d < today),
    movedUp,
    stuck,
    nextWeekDeload,
  };
}
```

`Stuck` has the same fields as `StuckLift` plus `name`, so `{ ...s, name }` fits it.

- [ ] **Step 4: Run the tests and typecheck.** Same command as Step 2, then `npm run typecheck`. Expected: PASS, all 3, no type errors.

- [ ] **Step 5: Commit.**

```bash
git add app/checkin/lifts.ts tests/unit/checkin/lifts.test.ts
git commit -m "The check-in reads the week's workouts, extras, misses, lifts moved up and lifts stuck"
```

---

### Task 10: The digest

**Files:**
- Create: `app/checkin/digest.ts`
- Test: `tests/unit/checkin/digest.test.ts`

- [ ] **Step 1: Write the failing tests.** Create `tests/unit/checkin/digest.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildDigest, digestNumbers, numbersIn, type CheckInChoices } from "~/checkin/digest";
import { BOWL, checkInRow, rowsOf, SHOULDER, THIGHS, weekThree } from "./fixture";

const NONE: CheckInChoices = { hunger: null, energy: null, sleep: null, rest: null };

describe("buildDigest", () => {
  it("gathers every number the week page shows (see weekThree for the arithmetic)", () => {
    expect(buildDigest(rowsOf(weekThree()), "2026-10-19", NONE)).toEqual({
      week: { monday: "2026-10-19", sunday: "2026-10-25", number: 3, weeksToCheckpoint: 10 },
      // Since Oct 5's trend of 205.99: 205.092 - 205.99 = -0.898.
      weight: { trend: 205.1, change: -0.4, sinceStart: -0.9, firstDate: "2026-10-05", firstWeight: 205.9 },
      days: { counted: 7, full: 4, tracked: 6, total: 7 },
      protein: { avg: 170, target: 180, lowDay: { date: "2026-10-22", grams: 120 } },
      steps: { avg: 7443, goal: 7000, lowDay: { date: "2026-10-24", steps: 5900 } },
      intake: { avg: 2400 },
      lifts: {
        planned: 3,
        plannedDone: 2,
        extras: ["2026-10-20"],
        missed: ["2026-10-23"],
        movedUp: [
          { exercise: "incline-dumbbell-press", name: "Incline dumbbell press", from: 50, to: 55 },
          { exercise: "pec-deck", name: "Pec deck", from: 130, to: 135 },
        ],
        stuck: [{ exercise: SHOULDER, name: "Seated dumbbell shoulder press", top: 45, lastSets: [{ weight: 45, reps: 8 }, { weight: 45, reps: 7 }], chase: [8, 8], drop: 40 }],
        nextWeekDeload: false,
      },
      waist: { now: 35.5, was: 35.75, wasDate: "2026-10-11", change: -0.25 },
      desserts: { offPlan: 3, allowance: 2 },
      feel: { hunger: null, energy: null, sleep: null, hungryTwice: false },
      call: {
        kind: "cut",
        ideal: 2150,
        goalLbPerWeek: expect.closeTo(1.0255, 3),
        guardrail: null,
        calories: { kcal: 2300, stepGoal: 7500 },
        steps: { kcal: 2400, stepGoal: 8000 },
        pick: "calories",
        maintenanceKcal: null,
        hungry: false,
        state: "settling",
        burn: 2680,
        // Week 3 plus the 3 updates left before the fourth.
        steadyBy: 6,
        trackedDays: 6,
        windowTrackedDays: 20,
        weighIns: 21,
        intakeAvg: 2400,
        holdReason: null,
        currentKcal: 2400,
        limits: { floor: 2000, fastLossLb: 2 },
      },
      meals: {
        repeats: [
          { slug: BOWL, name: "Chicken and rice bowl", count: 4, rest: true },
          { slug: THIGHS, name: "Honey-glazed chicken thighs", count: 3, rest: false },
        ],
        backFromRest: ["Steak and baked potato"],
      },
    });
  });

  it("follows the choices: taps, and the rest switches", () => {
    const d = buildDigest(rowsOf(weekThree()), "2026-10-19", { hunger: "fine", energy: "high", sleep: "poor", rest: [THIGHS] });
    expect(d.feel).toEqual({ hunger: "fine", energy: "high", sleep: "poor", hungryTwice: false });
    expect(d.meals.repeats.map((r) => r.rest)).toEqual([false, true]);
  });

  it("is hungry twice only after last week's High, and then picks steps", () => {
    const t = weekThree();
    t.check_ins = [checkInRow("2026-10-12", { hunger: "high" })];
    const d = buildDigest(rowsOf(t), "2026-10-19", { ...NONE, hunger: "high" });
    expect(d.feel.hungryTwice).toBe(true);
    expect(d.call).toMatchObject({ pick: "steps", hungry: true });
    // A skipped check-in in between breaks the run.
    t.check_ins = [checkInRow("2026-10-05", { hunger: "high" })];
    expect(buildDigest(rowsOf(t), "2026-10-19", { ...NONE, hunger: "high" }).feel.hungryTwice).toBe(false);
  });

  it("names why a holding week holds", () => {
    // Week 2's 21-day window starts before the phase.
    expect(buildDigest(rowsOf(weekThree()), "2026-10-12", NONE).call).toMatchObject({ kind: "hold", state: "holding", holdReason: "first-weeks", steadyBy: null });
  });
});

describe("the guardrail's helpers", () => {
  it("collects every number, its tenth, and each list's length", () => {
    const n = digestNumbers(buildDigest(rowsOf(weekThree()), "2026-10-19", NONE));
    for (const x of [7443, 7000, 5900, 170, 0.4, 0.9, 0.25, 2680, 2300, 8000, 2, 3, 1]) expect(n.has(x), String(x)).toBe(true);
  });

  it("reads numbers from text, leaving out month-day dates", () => {
    expect(numbersIn("Waist is down 0.25 in since Oct 18.")).toEqual([0.25]);
    expect(numbersIn("Steps averaged 8,120, short of 8,500.")).toEqual([8120, 8500]);
  });
});
```

`1` is in the set because `goalLbPerWeek` (1.025) rounds to 1.0, and the first moved-up list has 2 entries while `extras` has 1.

- [ ] **Step 2: Run them to make sure they fail.**

```bash
npx vitest run --project unit tests/unit/checkin/digest.test.ts
```

Expected: FAIL, "Cannot find module '~/checkin/digest'".

- [ ] **Step 3: Implement.** Create `app/checkin/digest.ts`:

```ts
// Every number the check-in's week page shows, in one object (spec section 1, "The digest"). ruleTake reads it now;
// project 5 sends it to the AI and checks the AI's numbers against digestNumbers. Pure.
import { plan } from "~/content";
import { isRelaxedDay, weekNumber } from "~/domain/calendar";
import { dayIntake } from "~/domain/completeness";
import { addDays } from "~/domain/dates";
import {
  FAST_LOSS_LB,
  KCAL_FLOOR,
  MIN_TRACKED_IN_WEEK,
  MIN_TRACKED_IN_WINDOW,
  MIN_WEIGH_INS,
  SETTLING_UPDATES,
  WINDOW_DAYS,
  type BurnState,
  type Call,
  type EnergyWeek,
} from "~/domain/energy";
import { countedDay, DESSERT_ALLOWANCE, fullDay, overAllowanceDates } from "~/domain/habits";
import type { LoggedSet } from "~/domain/progression";
import { trendReading } from "~/domain/trend";
import type { ISODate } from "~/domain/types";
import { targetsOn, type Rows } from "~/today/slots";
import { loggedDates } from "~/workout/sessions";
import { hungryTwice, weekCall, weighIns } from "./engine";
import { liftWeek } from "./lifts";
import { backFromRest, defaultRests, mealRepeats } from "./meals";

export type Level = "low" | "fine" | "high";
export type SleepLevel = "poor" | "fine" | "great";
/** Why a holding burn holds, in the order N3's why-lines check it. */
export type HoldReason = "first-weeks" | "week-days" | "window-days" | "weigh-ins";

/** What the person has chosen on the page so far. */
export interface CheckInChoices {
  hunger: Level | null;
  energy: Level | null;
  sleep: SleepLevel | null;
  /** Slugs to rest. Null keeps the defaults: 4 or more times. */
  rest: string[] | null;
}

export interface CheckInDigest {
  week: { monday: ISODate; sunday: ISODate; number: number; weeksToCheckpoint: number };
  weight: { trend: number | null; change: number | null; sinceStart: number | null; firstDate: ISODate | null; firstWeight: number | null };
  /** `total` is the 7 days the counts are out of. */
  days: { counted: number; full: number; tracked: number; total: number };
  protein: { avg: number | null; target: number; lowDay: { date: ISODate; grams: number } | null };
  steps: { avg: number; goal: number; lowDay: { date: ISODate; steps: number } | null };
  intake: { avg: number | null };
  lifts: {
    planned: number;
    plannedDone: number;
    extras: ISODate[];
    missed: ISODate[];
    movedUp: { exercise: string; name: string; from: number; to: number }[];
    stuck: { exercise: string; name: string; top: number; lastSets: LoggedSet[]; chase: number[]; drop: number }[];
    nextWeekDeload: boolean;
  };
  /** `change` is now minus was, in inches. */
  waist: { now: number | null; was: number | null; wasDate: ISODate | null; change: number | null };
  desserts: { offPlan: number; allowance: number };
  feel: { hunger: Level | null; energy: Level | null; sleep: SleepLevel | null; hungryTwice: boolean };
  call: Call & {
    state: BurnState;
    burn: number;
    /** The week the burn stops settling, while it settles. */
    steadyBy: number | null;
    trackedDays: number;
    windowTrackedDays: number;
    weighIns: number;
    /** The 21-day window's average, as `check_ins.intake_avg` stores it. */
    intakeAvg: number | null;
    holdReason: HoldReason | null;
    currentKcal: number;
    limits: { floor: number; fastLossLb: number };
  };
  meals: { repeats: { slug: string; name: string; count: number; rest: boolean }[]; backFromRest: string[] };
}

const CHECKPOINT_WEEK = Number(Object.entries(plan.weekTypes).find(([, type]) => type === "checkpoint")?.[0] ?? 0);

function holdReason(e: EnergyWeek): HoldReason {
  // The first two weeks' windows reach back before the phase.
  if (addDays(e.weekStart, 6 - (WINDOW_DAYS - 1)) < plan.phaseStart) return "first-weeks";
  if (e.trackedDays < MIN_TRACKED_IN_WEEK) return "week-days";
  if (e.windowTrackedDays < MIN_TRACKED_IN_WINDOW) return "window-days";
  if (e.weighIns < MIN_WEIGH_INS) return "weigh-ins";
  // Every count passed, so there was no trend the day before the window.
  return "first-weeks";
}

const lowest = <T>(xs: T[], value: (x: T) => number): T | null => xs.reduce<T | null>((low, x) => (low === null || value(x) < value(low) ? x : low), null);

/**
 * The week under review, in numbers. `today` decides which planned workouts count as missed; it defaults to next
 * Monday, when the whole week is past.
 */
export function buildDigest(rows: Rows, monday: ISODate, choices: CheckInChoices, today: ISODate = addDays(monday, 7)): CheckInDigest {
  const sunday = addDays(monday, 6);
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const hungry = hungryTwice(rows, monday, choices.hunger);
  const wc = weekCall(rows, monday, { hungry });
  const number = weekNumber(plan, monday);

  const weights = weighIns(rows, sunday);
  const first = weights.find((w) => w.date >= plan.phaseStart) ?? null;

  const logs = rows("meal_logs");
  const steps = new Map(rows("steps_daily").map((r) => [r.date as ISODate, Number(r.steps)]));
  const weighed = new Set(weights.map((w) => w.date));
  const workouts = loggedDates(rows);
  const desserts = logs.filter((l) => l.category === "dessert" && !Number(l.relaxed)).map((l) => ({ date: l.date as ISODate, at: l.logged_at as string }));
  const over = overAllowanceDates(desserts);
  const facts = days.map((date) => {
    const dayLogs = logs.filter((l) => l.date === date);
    const t = targetsOn(rows, date);
    const proteinG = dayLogs.reduce((n, l) => n + Number(l.protein_g), 0);
    const walked = steps.get(date) ?? 0;
    const relaxed = isRelaxedDay(plan, date);
    return {
      date,
      proteinG,
      steps: walked,
      hasSteps: steps.has(date),
      intake: dayIntake(dayLogs.map((l) => ({ slot: (l.slot as string | null) ?? null, category: l.category as string, kcal: Number(l.kcal) }))),
      counted: countedDay({ weighIn: weighed.has(date), mealLogged: dayLogs.some((l) => l.category !== "skipped"), workout: workouts.has(date), steps: walked, relaxed }),
      full: fullDay({ proteinG, proteinTarget: t.proteinG, steps: walked, stepGoal: t.stepGoal, relaxedDay: relaxed, overAllowance: over.has(date) }),
    };
  });
  const tracked = facts.filter((f) => f.intake !== null);
  const proteinLow = lowest(tracked, (f) => f.proteinG);
  const stepsLow = lowest(
    facts.filter((f) => f.hasSteps),
    (f) => f.steps,
  );
  const weekTargets = targetsOn(rows, sunday);

  const waists = rows("waist_logs")
    .map((r) => ({ date: r.date as ISODate, inches: Number(r.inches) }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const now = waists.filter((w) => w.date >= monday && w.date <= sunday).at(-1) ?? null;
  const was = waists.filter((w) => w.date < monday).at(-1) ?? null;

  const repeats = mealRepeats(rows, monday);
  const rest = choices.rest ?? defaultRests(repeats);
  const e = wc.energy;

  return {
    week: { monday, sunday, number, weeksToCheckpoint: CHECKPOINT_WEEK - number },
    weight: {
      trend: wc.trendWeight,
      change: wc.change,
      sinceStart: trendReading(weights, sunday, plan.phaseStart)?.sinceFrom ?? null,
      firstDate: first?.date ?? null,
      firstWeight: first?.weight ?? null,
    },
    days: { counted: facts.filter((f) => f.counted).length, full: facts.filter((f) => f.full).length, tracked: tracked.length, total: 7 },
    protein: {
      avg: tracked.length ? Math.round(tracked.reduce((n, f) => n + f.proteinG, 0) / tracked.length) : null,
      target: weekTargets.proteinG,
      lowDay: proteinLow ? { date: proteinLow.date, grams: proteinLow.proteinG } : null,
    },
    steps: { avg: wc.avgSteps, goal: weekTargets.stepGoal, lowDay: stepsLow ? { date: stepsLow.date, steps: stepsLow.steps } : null },
    intake: { avg: tracked.length ? Math.round(tracked.reduce((n, f) => n + f.intake!, 0) / tracked.length) : null },
    lifts: liftWeek(rows, monday, today),
    waist: { now: now?.inches ?? null, was: was?.inches ?? null, wasDate: was?.date ?? null, change: now && was ? Math.round((now.inches - was.inches) * 100) / 100 : null },
    desserts: { offPlan: desserts.filter((d) => d.date >= monday && d.date <= sunday).length, allowance: DESSERT_ALLOWANCE },
    feel: { hunger: choices.hunger, energy: choices.energy, sleep: choices.sleep, hungryTwice: hungry },
    call: {
      ...wc.call,
      state: e.state,
      burn: e.burn,
      steadyBy: e.state === "settling" ? number + SETTLING_UPDATES - e.updates : null,
      trackedDays: e.trackedDays,
      windowTrackedDays: e.windowTrackedDays,
      weighIns: e.weighIns,
      intakeAvg: e.intakeAvg,
      holdReason: e.state === "holding" ? holdReason(e) : null,
      currentKcal: wc.kcal,
      limits: { floor: KCAL_FLOOR, fastLossLb: FAST_LOSS_LB },
    },
    meals: { repeats: repeats.map((r) => ({ ...r, rest: rest.includes(r.slug) })), backFromRest: backFromRest(rows, monday) },
  };
}

/** Every number a digest holds, as a line may print it: absolute, to 0.1, and each list's length. */
export function digestNumbers(d: CheckInDigest): Set<number> {
  const out = new Set<number>();
  const walk = (v: unknown): void => {
    if (typeof v === "number" && Number.isFinite(v)) {
      out.add(Math.abs(v));
      out.add(Math.abs(Math.round(v * 10) / 10));
    } else if (Array.isArray(v)) {
      out.add(v.length);
      v.forEach(walk);
    } else if (v && typeof v === "object") {
      Object.values(v).forEach(walk);
    }
  };
  walk(d);
  return out;
}

const MONTH_DAY = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{1,2}\b/g;

/** The numbers in a line of text, leaving out month-day dates ("Oct 18"). "8,120" reads as 8120. */
export function numbersIn(text: string): number[] {
  return [...text.replace(MONTH_DAY, "").matchAll(/\d[\d,]*(?:\.\d+)?/g)].map((m) => Number(m[0].replace(/,/g, "")));
}
```

- [ ] **Step 4: Run the tests and typecheck.** Same command as Step 2, then `npm run typecheck`. Expected: PASS, all 6, no type errors.

`goalLbPerWeek` is 0.005 x 205.0917 = 1.0255, compared to 3 decimals.

- [ ] **Step 5: Commit.**

```bash
git add app/checkin/digest.ts tests/unit/checkin/digest.test.ts
git commit -m "The check-in digest gathers every number of the week in one object"
```

---

### Task 11: Rocky's take, written by rules

Each line takes the first case that applies (spec section 1, "Rocky's take"). The tests build digests by hand, so each case's numbers are on the page.

**Files:**
- Create: `app/checkin/take.ts`
- Test: `tests/unit/checkin/take.test.ts`

- [ ] **Step 1: Write the failing tests.** Create `tests/unit/checkin/take.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { COACH_NAME } from "~/brand";
import { buildDigest, digestNumbers, numbersIn, type CheckInDigest } from "~/checkin/digest";
import { ruleTake } from "~/checkin/take";
import { rowsOf, SHOULDER, weekThree } from "./fixture";

/** Week 4 (Oct 26 to Nov 1). Its win is "All 3 workouts done.", nothing to fix, and a settling cut. */
function base(): CheckInDigest {
  return {
    week: { monday: "2026-10-26", sunday: "2026-11-01", number: 4, weeksToCheckpoint: 9 },
    weight: { trend: 205.3, change: -0.3, sinceStart: -1.7, firstDate: "2026-10-05", firstWeight: 207 },
    days: { counted: 6, full: 5, tracked: 6, total: 7 },
    protein: { avg: 176, target: 180, lowDay: { date: "2026-10-29", grams: 150 } },
    steps: { avg: 8620, goal: 8500, lowDay: { date: "2026-10-31", steps: 6900 } },
    intake: { avg: 2310 },
    lifts: { planned: 3, plannedDone: 3, extras: [], missed: [], movedUp: [{ exercise: "pec-deck", name: "Pec deck", from: 130, to: 135 }], stuck: [], nextWeekDeload: false },
    waist: { now: null, was: 35.5, wasDate: "2026-10-18", change: null },
    desserts: { offPlan: 1, allowance: 2 },
    feel: { hunger: null, energy: null, sleep: null, hungryTwice: false },
    call: {
      kind: "cut",
      ideal: 2050,
      goalLbPerWeek: 1.0265,
      guardrail: null,
      calories: { kcal: 2300, stepGoal: 8500 },
      steps: { kcal: 2400, stepGoal: 9500 },
      pick: "calories",
      maintenanceKcal: null,
      hungry: false,
      state: "settling",
      burn: 2580,
      steadyBy: 5,
      trackedDays: 6,
      windowTrackedDays: 20,
      weighIns: 21,
      intakeAvg: 2310,
      holdReason: null,
      currentKcal: 2400,
      limits: { floor: 2000, fastLossLb: 2 },
    },
    meals: { repeats: [], backFromRest: [] },
  };
}

const make = (edit: (d: CheckInDigest) => void): CheckInDigest => {
  const d = base();
  edit(d);
  return d;
};
// Below the workouts win, so the later win rows can show.
const twoOfThree = (d: CheckInDigest) => (d.lifts.plannedDone = 2);
const shortSteps = (d: CheckInDigest) => (d.steps.avg = 8120);

const WINS: [string, CheckInDigest, string][] = [
  ["seven of seven with protein", make((d) => ((d.days.counted = 7), (d.protein.avg = 178))), "Seven of seven days counted, and protein averaged 178 g against 180."],
  [
    "two or more lifts moved up",
    make((d) => (d.lifts.movedUp = [d.lifts.movedUp[0], { exercise: "seated-cable-row", name: "Seated cable row", from: 110, to: 115 }, { exercise: "leg-extension", name: "Leg extension", from: 120, to: 130 }])),
    "Three lifts moved up. Pec deck goes to 135 lb.",
  ],
  ["every planned workout done", base(), "All 3 workouts done."],
  ["steps over goal", make(twoOfThree), "Steps averaged 8,620, over the 8,500 goal."],
  ["waist down", make((d) => (twoOfThree(d), shortSteps(d), (d.waist = { now: 35.25, was: 35.5, wasDate: "2026-10-18", change: -0.25 }))), "Waist is down 0.25 in since Oct 18."],
  ["trend down", make((d) => (twoOfThree(d), shortSteps(d), (d.weight.change = -0.4))), "Trend down 0.4 lb this week."],
  ["otherwise", make((d) => (twoOfThree(d), shortSteps(d), (d.weight.change = 0.2), (d.days.counted = 5))), "5 of 7 days counted."],
];

const FIXES: [string, CheckInDigest, string][] = [
  ["steps under goal", make((d) => ((d.steps = { avg: 8120, goal: 8500, lowDay: { date: "2026-10-31", steps: 5900 } }))), "Steps averaged 8,120, short of 8,500. Saturday was the low day at 5,900."],
  ["under 4 days closed out", make((d) => (d.days.tracked = 3)), "Only 3 days were closed out in full. Close out each night so the burn can update."],
  ["protein more than 10 g under", make((d) => (d.protein = { avg: 165, target: 180, lowDay: { date: "2026-10-29", grams: 120 } })), "Protein averaged 165 g against 180. Thursday was the low day at 120 g."],
  ["a workout missed", make((d) => (d.lifts.missed = ["2026-10-30"])), "Friday's workout was missed. Get the next one in."],
  ["two workouts missed", make((d) => (d.lifts.missed = ["2026-10-28", "2026-10-30"])), "2 workouts were missed. Get the next one in."],
  [
    "a stuck lift",
    make((d) => (d.lifts.stuck = [{ exercise: SHOULDER, name: "Seated dumbbell shoulder press", top: 45, lastSets: [{ weight: 45, reps: 8 }, { weight: 45, reps: 7 }], chase: [8, 8], drop: 40 }])),
    "Seated dumbbell shoulder press is stuck at 45 lb. Pick a plan for it below.",
  ],
  ["desserts over the allowance", make((d) => (d.desserts.offPlan = 3)), "3 off-plan desserts against the 2 allowed."],
  ["nothing", base(), "Nothing to fix. Run it back."],
];

const LEAD = "Trend down 0.3 lb.";
const CALLS: [string, CheckInDigest, string][] = [
  ["cut, pick calories", base(), `${LEAD} Burn is near 2,580, so calories go to 2,300 from Monday.`],
  [
    "cut, pick steps at half portions",
    make((d) => (d.call = { ...d.call, guardrail: "half-portions", pick: "steps", calories: { kcal: 2050, stepGoal: 8500 }, steps: { kcal: 2100, stepGoal: 9500 } })),
    `${LEAD} Food is at half portions, so ${COACH_NAME} picks 9,500 steps over less food.`,
  ],
  ["cut, pick steps when hungry", make((d) => (d.call = { ...d.call, pick: "steps", hungry: true })), `${LEAD} You were hungry two Sundays running, so ${COACH_NAME} picks 9,500 steps over less food.`],
  ["on pace while settling", make((d) => (d.call = { ...d.call, kind: "on-pace", calories: { kcal: 2300, stepGoal: 8500 }, steps: null })), `${LEAD} The burn estimate settles by week 5, so 2,300 holds one more week.`],
  ["on pace", make((d) => (d.call = { ...d.call, kind: "on-pace", state: "updating", steadyBy: null, steps: null })), `${LEAD} Right on pace, so 2,300 holds.`],
  ["raise", make((d) => (d.call = { ...d.call, kind: "raise", calories: { kcal: 2450, stepGoal: 8500 }, steps: null })), `${LEAD} Faster than 1 lb a week, so calories go up to 2,450.`],
  ["hold, few tracked days", make((d) => (d.call = { ...d.call, kind: "hold", state: "holding", holdReason: "week-days", trackedDays: 3, calories: { kcal: 2400, stepGoal: 8500 }, steps: null })), `${LEAD} Only 3 days were tracked in full, so 2,400 holds one more week.`],
  ["hold, first two weeks", make((d) => (d.call = { ...d.call, kind: "hold", state: "holding", holdReason: "first-weeks", calories: { kcal: 2400, stepGoal: 8500 }, steps: null })), `${LEAD} Two weeks of weigh-ins come first, so 2,400 holds.`],
  ["hold, a thin window", make((d) => (d.call = { ...d.call, kind: "hold", state: "holding", holdReason: "window-days", windowTrackedDays: 9, calories: { kcal: 2400, stepGoal: 8500 }, steps: null })), `${LEAD} Only 9 days in the last three weeks were tracked in full, so 2,400 holds one more week.`],
  ["hold, few weigh-ins", make((d) => (d.call = { ...d.call, kind: "hold", state: "holding", holdReason: "weigh-ins", weighIns: 6, calories: { kcal: 2400, stepGoal: 8500 }, steps: null })), `${LEAD} Only 6 weigh-ins in the last three weeks, so 2,400 holds one more week.`],
  ["hold, fast loss", make((d) => (d.call = { ...d.call, kind: "hold", guardrail: "fast-loss", calories: { kcal: 2400, stepGoal: 8500 }, steps: null })), `${LEAD} You lost over 2 lb two weeks running, so 2,400 holds.`],
  ["hold, floor", make((d) => (d.call = { ...d.call, kind: "hold", guardrail: "floor", calories: { kcal: 2000, stepGoal: 8500 }, steps: null })), `${LEAD} 2,000 is the floor, so it holds.`],
  ["hold, half portions at 10,000", make((d) => (d.call = { ...d.call, kind: "hold", guardrail: "half-portions", calories: { kcal: 2050, stepGoal: 10000 }, steps: null })), `${LEAD} Food is at half portions and steps are at 10,000, so 2,050 holds.`],
  ["maintenance next week", make((d) => (d.call = { ...d.call, kind: "maintenance", maintenanceKcal: 2600, steps: null })), `${LEAD} Maintenance week next: 2,600 a day, your burn.`],
];

describe("ruleTake", () => {
  it.each(WINS)("wins: %s", (_, d, line) => expect(ruleTake(d).win).toBe(line));
  it.each(FIXES)("fixes: %s", (_, d, line) => expect(ruleTake(d).fix).toBe(line));
  it.each(CALLS)("calls: %s", (_, d, line) => expect(ruleTake(d).call).toBe(line));

  it("leads the call with the trend: up, flat, or nothing without one", () => {
    expect(ruleTake(make((d) => (d.weight.change = 0.2))).call).toBe("Trend up 0.2 lb. Burn is near 2,580, so calories go to 2,300 from Monday.");
    expect(ruleTake(make((d) => (d.weight.change = 0))).call).toBe("Trend flat. Burn is near 2,580, so calories go to 2,300 from Monday.");
    expect(ruleTake(make((d) => (d.weight.change = null))).call).toBe("Burn is near 2,580, so calories go to 2,300 from Monday.");
  });

  it("says 1 and 0 days in words that read right", () => {
    expect(ruleTake(make((d) => (d.days.tracked = 1))).fix).toBe("Only 1 day was closed out in full. Close out each night so the burn can update.");
    expect(ruleTake(make((d) => (d.days.tracked = 0))).fix).toBe("No days were closed out in full. Close out each night so the burn can update.");
  });

  it("writes week 3's take from its rows", () => {
    expect(ruleTake(buildDigest(rowsOf(weekThree()), "2026-10-19", { hunger: null, energy: null, sleep: null, rest: null }))).toEqual({
      win: "Two lifts moved up. Incline dumbbell press goes to 55 lb.",
      fix: "Friday's workout was missed. Get the next one in.",
      call: "Trend down 0.4 lb. Burn is near 2,680, so calories go to 2,300 from Monday.",
    });
  });

  it("prints no number that isn't in the digest", () => {
    for (const [name, d] of [...WINS, ...FIXES, ...CALLS]) {
      const take = ruleTake(d);
      const known = digestNumbers(d);
      for (const line of [take.win, take.fix, take.call]) for (const n of numbersIn(line)) expect(known.has(n), `${name}: ${n} in "${line}"`).toBe(true);
    }
  });
});
```

In week 3, protein averaged 170 against 180: that is not within 5 g, so the first win doesn't apply, and it is exactly 10 under, not more, so protein isn't the fix.

- [ ] **Step 2: Run them to make sure they fail.**

```bash
npx vitest run --project unit tests/unit/checkin/take.test.ts
```

Expected: FAIL, "Cannot find module '~/checkin/take'".

- [ ] **Step 3: Implement.** Create `app/checkin/take.ts`:

```ts
// Rocky's take, written by rules from the week's numbers (spec section 1, "Rocky's take"). Every number it prints comes
// from the digest. Project 5 replaces only this text, and only when the AI is on. Pure.
import { COACH_NAME } from "~/brand";
import { MIN_TRACKED_IN_WEEK } from "~/domain/energy";
import { weekday } from "~/domain/dates";
import type { ISODate } from "~/domain/types";
import type { CheckInDigest } from "./digest";

export interface Take {
  win: string;
  fix: string;
  call: string;
}

const DAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const COUNT = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"];

const num = (n: number) => n.toLocaleString("en-US");
const dayName = (d: ISODate) => DAY[weekday(d)];
const monthDay = (d: ISODate) => {
  const [, m, day] = d.split("-").map(Number);
  return `${MONTH_SHORT[m - 1]} ${day}`;
};
/** A weight change, one decimal: "0.4". */
const lb = (n: number) => Math.abs(n).toFixed(1);
/** Inches, at most two decimals: "0.25", "0.5". */
const inches = (n: number) => String(Math.round(Math.abs(n) * 100) / 100);
const goal = (lbPerWeek: number) => String(Math.round(lbPerWeek * 10) / 10);

function win(d: CheckInDigest): string {
  const { days, protein, lifts, steps, waist, weight } = d;
  if (days.counted === days.total && protein.avg !== null && protein.avg >= protein.target - 5) return `Seven of seven days counted, and protein averaged ${protein.avg} g against ${protein.target}.`;
  if (lifts.movedUp.length >= 2) return `${COUNT[lifts.movedUp.length] ?? lifts.movedUp.length} lifts moved up. ${lifts.movedUp[0].name} goes to ${lifts.movedUp[0].to} lb.`;
  if (lifts.planned >= 2 && lifts.plannedDone === lifts.planned) return `All ${lifts.planned} workouts done.`;
  if (steps.avg >= steps.goal) return `Steps averaged ${num(steps.avg)}, ${steps.avg > steps.goal ? "over" : "right at"} the ${num(steps.goal)} goal.`;
  if (waist.change !== null && waist.change < 0 && waist.wasDate) return `Waist is down ${inches(waist.change)} in since ${monthDay(waist.wasDate)}.`;
  if (weight.change !== null && weight.change < 0) return `Trend down ${lb(weight.change)} lb this week.`;
  return `${days.counted} of ${days.total} days counted.`;
}

function fix(d: CheckInDigest): string {
  const { steps, days, protein, lifts, desserts } = d;
  if (steps.avg < steps.goal) {
    const low = steps.lowDay ? ` ${dayName(steps.lowDay.date)} was the low day at ${num(steps.lowDay.steps)}.` : "";
    return `Steps averaged ${num(steps.avg)}, short of ${num(steps.goal)}.${low}`;
  }
  if (days.tracked < MIN_TRACKED_IN_WEEK) {
    const closed = days.tracked === 0 ? "No days were" : days.tracked === 1 ? "Only 1 day was" : `Only ${days.tracked} days were`;
    return `${closed} closed out in full. Close out each night so the burn can update.`;
  }
  if (protein.avg !== null && protein.avg < protein.target - 10) {
    const low = protein.lowDay ? ` ${dayName(protein.lowDay.date)} was the low day at ${protein.lowDay.grams} g.` : "";
    return `Protein averaged ${protein.avg} g against ${protein.target}.${low}`;
  }
  if (lifts.missed.length === 1) return `${dayName(lifts.missed[0])}'s workout was missed. Get the next one in.`;
  if (lifts.missed.length > 1) return `${lifts.missed.length} workouts were missed. Get the next one in.`;
  if (lifts.stuck.length > 0) return `${lifts.stuck[0].name} is stuck at ${lifts.stuck[0].top} lb. Pick a plan for it below.`;
  if (desserts.offPlan > desserts.allowance) return `${desserts.offPlan} off-plan desserts against the ${desserts.allowance} allowed.`;
  return "Nothing to fix. Run it back.";
}

/** Rocky's pick, not the radio the person has chosen. */
function callLine(d: CheckInDigest): string {
  const c = d.call;
  const kcal = num(c.calories.kcal);
  if (c.kind === "maintenance") return `Maintenance week next: ${num(c.maintenanceKcal ?? c.burn)} a day, your burn.`;
  if (c.pick === "steps" && c.steps) {
    const walk = num(c.steps.stepGoal);
    return c.hungry ? `You were hungry two Sundays running, so ${COACH_NAME} picks ${walk} steps over less food.` : `Food is at half portions, so ${COACH_NAME} picks ${walk} steps over less food.`;
  }
  if (c.kind === "cut") return `Burn is near ${num(c.burn)}, so calories go to ${kcal} from Monday.`;
  if (c.kind === "raise") return `Faster than ${goal(c.goalLbPerWeek)} lb a week, so calories go up to ${kcal}.`;
  if (c.kind === "on-pace") return c.steadyBy !== null ? `The burn estimate settles by week ${c.steadyBy}, so ${kcal} holds one more week.` : `Right on pace, so ${kcal} holds.`;
  if (c.state === "holding") {
    if (c.holdReason === "week-days") {
      const days = c.trackedDays === 0 ? "No days were" : c.trackedDays === 1 ? "Only 1 day was" : `Only ${c.trackedDays} days were`;
      return `${days} tracked in full, so ${kcal} holds one more week.`;
    }
    if (c.holdReason === "window-days") return `Only ${c.windowTrackedDays} days in the last three weeks were tracked in full, so ${kcal} holds one more week.`;
    if (c.holdReason === "weigh-ins") return `Only ${c.weighIns} weigh-ins in the last three weeks, so ${kcal} holds one more week.`;
    return `Two weeks of weigh-ins come first, so ${kcal} holds.`;
  }
  if (c.guardrail === "fast-loss") return `You lost over ${c.limits.fastLossLb} lb two weeks running, so ${kcal} holds.`;
  if (c.guardrail === "floor") return `${num(c.limits.floor)} is the floor, so it holds.`;
  if (c.guardrail === "half-portions") return `Food is at half portions and steps are at ${num(c.calories.stepGoal)}, so ${kcal} holds.`;
  return `${kcal} holds.`;
}

function lead(change: number | null): string | null {
  if (change === null) return null;
  if (Math.abs(change) < 0.05) return "Trend flat.";
  return `Trend ${change < 0 ? "down" : "up"} ${lb(change)} lb.`;
}

export function ruleTake(d: CheckInDigest): Take {
  const first = lead(d.weight.change);
  const line = callLine(d);
  return { win: win(d), fix: fix(d), call: first ? `${first} ${line}` : line };
}
```

- [ ] **Step 4: Run the tests.** Same command as Step 2. Expected: PASS, every case.

- [ ] **Step 5: Commit.**

```bash
git add app/checkin/take.ts tests/unit/checkin/take.test.ts
git commit -m "Rocky's take is written by rules: one win, one fix, and the call, from the digest's numbers"
```

---

### Task 12: Waist and grocery checks are named changes

**Files:**
- Modify: `app/sync/mutators.ts`
- Test: `tests/unit/sync/checkin-mutators.test.ts`

- [ ] **Step 1: Write the failing tests.** Create `tests/unit/sync/checkin-mutators.test.ts`. Task 13 adds the `finishCheckIn` tests to the same file.

```ts
import { describe, expect, it } from "vitest";
import { describeRejection, runMutation, type MutationContext } from "~/sync/mutators";
import { MemoryTx } from "~/sync/tx";

const SUNDAY: MutationContext = { now: "2026-10-25T23:05:00.000Z", today: "2026-10-25" };
const run = (tx: MemoryTx, name: string, args: unknown, c = SUNDAY) => runMutation(tx, name, args, c);

describe("logWaist", () => {
  it("saves inches to two decimals for a day, and replaces that day's entry", async () => {
    const tx = new MemoryTx(new Map());
    await run(tx, "logWaist", { date: "2026-10-25", inches: 35.456 });
    expect(await tx.get("waist_logs", "2026-10-25")).toEqual({ date: "2026-10-25", inches: 35.46 });
    await run(tx, "logWaist", { date: "2026-10-25", inches: 35.5 });
    expect(await tx.scan("waist_logs")).toEqual([{ date: "2026-10-25", inches: 35.5 }]);
  });

  it("refuses a future day and a number outside 20 to 60", async () => {
    const tx = new MemoryTx(new Map());
    await expect(run(tx, "logWaist", { date: "2026-10-26", inches: 35 })).rejects.toThrow("That date is in the future.");
    await expect(run(tx, "logWaist", { date: "2026-10-25", inches: 61 })).rejects.toThrow();
    await expect(run(tx, "logWaist", { date: "2026-10-25", inches: 19.9 })).rejects.toThrow();
  });
});

describe("checkGrocery", () => {
  it("checks and unchecks a food for a week", async () => {
    const tx = new MemoryTx(new Map());
    await run(tx, "checkGrocery", { week: "2026-10-26", food: "white-rice-cooked", checked: true });
    expect(await tx.get("grocery_checks", "2026-10-26|white-rice-cooked")).toEqual({ week_start: "2026-10-26", food_id: "white-rice-cooked" });
    await run(tx, "checkGrocery", { week: "2026-10-26", food: "white-rice-cooked", checked: false });
    expect(await tx.scan("grocery_checks")).toEqual([]);
  });

  it("refuses a food not in the list and a week that isn't a Monday", async () => {
    const tx = new MemoryTx(new Map());
    await expect(run(tx, "checkGrocery", { week: "2026-10-26", food: "unicorn", checked: true })).rejects.toThrow("That food isn't in the list.");
    await expect(run(tx, "checkGrocery", { week: "2026-10-27", food: "butter", checked: true })).rejects.toThrow("That week doesn't start on a Monday.");
    expect(describeRejection("checkGrocery", "That food isn't in the list.")).toBe("Grocery check didn't save. That food isn't in the list.");
    expect(describeRejection("logWaist", "That date is in the future.")).toBe("Waist didn't save. That date is in the future.");
  });
});
```

- [ ] **Step 2: Run them to make sure they fail.**

```bash
npx vitest run --project unit tests/unit/sync/checkin-mutators.test.ts
```

Expected: FAIL, "Unknown change: logWaist" and "Unknown change: checkGrocery".

- [ ] **Step 3: Implement.** In `app/sync/mutators.ts`:

1. Change `import { exercises, meals, plan } from "~/content";` to `import { exercises, foods, meals, plan } from "~/content";`, and add `weekday` to the dates import: `import { addDays, daysBetween, weekStart, weekday } from "~/domain/dates";`.

2. Add to `defs`, after `deleteOffPlan`:

```ts
  logWaist: {
    args: z.object({ date, inches: z.number().min(20).max(60) }),
    async run(tx: Tx, a: { date: string; inches: number }, ctx: MutationContext) {
      // A waist is measured, never planned, so unlike meals it can't be logged for tomorrow.
      if (a.date > ctx.today) throw new MutationRejected("That date is in the future.");
      tx.put("waist_logs", { date: a.date, inches: Math.round(a.inches * 100) / 100 });
    },
  },
  checkGrocery: {
    args: z.object({ week: date, food: z.string().refine((id) => foods.has(id), "That food isn't in the list."), checked: z.boolean() }),
    async run(tx: Tx, a: { week: string; food: string; checked: boolean }) {
      if (weekday(a.week) !== 1) throw new MutationRejected("That week doesn't start on a Monday.");
      if (a.checked) tx.put("grocery_checks", { week_start: a.week, food_id: a.food });
      else tx.delete("grocery_checks", `${a.week}|${a.food}`);
    },
  },
```

3. Add to `MUTATION_LABELS`, after `deleteOffPlan: "Off-plan removal",`:

```ts
  logWaist: "Waist",
  checkGrocery: "Grocery check",
```

- [ ] **Step 4: Run the tests and typecheck.** Same command as Step 2, then `npm run typecheck`. Expected: PASS, all 4, no type errors.

- [ ] **Step 5: Commit.**

```bash
git add app/sync/mutators.ts tests/unit/sync/checkin-mutators.test.ts
git commit -m "Waist entries and grocery checks are named changes"
```

---

### Task 13: Finish check-in is one named change

The order is the spec's: checks, the call, targets, the row, rests, drops, next week's meals. Every number comes from the scanned rows through `buildDigest`; the args carry only choices.

**Files:**
- Modify: `app/sync/mutators.ts`
- Test: `tests/unit/sync/checkin-mutators.test.ts`

- [ ] **Step 1: Write the failing tests.** In `tests/unit/sync/checkin-mutators.test.ts`, add to the imports:

```ts
import type { Row } from "~/sync/tables";
import { BOWL, checkInRow, SHOULDER, weekThree, type Tables } from "../checkin/fixture";
```

and add at the end of the file:

```ts
/** A phone holding week three: the store, as MemoryTx keeps it. */
function phone(t: Tables = weekThree()): MemoryTx {
  const tx = new MemoryTx(new Map());
  for (const [table, rows] of Object.entries(t)) for (const r of rows) tx.put(table, r);
  return tx;
}

const AT = "2026-10-25T23:00:00.000Z"; // Sunday Oct 25, 6pm in Chicago.
const finish = (over: Row = {}) => ({
  week: "2026-10-19",
  at: AT,
  pick: "calories",
  hunger: "fine",
  energy: "high",
  sleep: "fine",
  rest: [BOWL],
  lifts: [
    { exercise: SHOULDER, plan: "drop" },
    { exercise: "pec-deck", plan: "drop" },
  ],
  ...over,
});
const nextWeek = async (tx: MemoryTx) => (await tx.scan("planned_meals")).filter((r) => (r.date as string) >= "2026-10-26" && (r.date as string) <= "2026-11-01");

describe("finishCheckIn", () => {
  it("writes Monday's targets, the row, the rests, the drops and next week's meals", async () => {
    const tx = phone();
    await run(tx, "finishCheckIn", finish());
    // Week three's settling cut: 2,300 cal and the ramped 7,500 steps. Protein stays 180.
    expect(await tx.get("targets", "2026-10-26")).toEqual({ effective_from: "2026-10-26", kcal: 2300, protein_g: 180, step_goal: 7500 });
    const row = (await tx.get("check_ins", "2026-10-19"))!;
    expect(row).toMatchObject({ avg_weight: 205.1, change: -0.4, adherence: 4, burn: 2680, burn_state: "settling", intake_avg: 2400, tracked_days: 6, hunger: "fine", energy: "high", sleep: "fine", completed_at: AT });
    expect(JSON.parse(row.outcome as string)).toMatchObject({
      pick: "calories",
      rest: [BOWL],
      // The pec deck isn't stuck, so its drop is saved as a hold.
      lifts: [
        { exercise: SHOULDER, plan: "drop" },
        { exercise: "pec-deck", plan: "hold" },
      ],
      call: { kind: "cut", calories: { kcal: 2300, stepGoal: 7500 }, burn: 2680 },
    });
    expect(await tx.get("meal_state", BOWL)).toEqual({ slug: BOWL, photo_key: null, rested_until: "2026-11-08" });
    expect(await tx.get("lift_drops", SHOULDER)).toEqual({ exercise_id: SHOULDER, weight_lb: 40, from_date: "2026-10-26", created_at: SUNDAY.now });
    expect(await tx.get("lift_drops", "pec-deck")).toBeNull();
    const week = await nextWeek(tx);
    expect(week).toHaveLength(35);
    // The bowl now rests, and salmon still rests until Nov 3.
    expect(week.some((r) => r.meal_slug === BOWL || r.meal_slug === "salmon-and-rice")).toBe(false);
  });

  it("keeps next week's slots already eaten or swapped, finished on Monday morning", async () => {
    const t = weekThree();
    t.planned_meals = [
      { date: "2026-10-26", slot: "breakfast", meal_slug: "steak-and-eggs", swapped: 0 },
      { date: "2026-10-26", slot: "dinner", meal_slug: BOWL, swapped: 1 },
    ];
    t.meal_logs.push({ client_id: "m-mon", date: "2026-10-26", slot: "breakfast", meal_slug: "steak-and-eggs", name: "Steak and eggs", category: "planned", kcal: 600, protein_g: 50, relaxed: 0, portions: 1, logged_at: "2026-10-26T12:40:00Z" });
    const tx = phone(t);
    // Monday Oct 26, 8am: the window is still open for week three.
    await run(tx, "finishCheckIn", finish({ at: "2026-10-26T13:00:00.000Z", rest: [BOWL, "steak-and-eggs"] }), { now: "2026-10-26T13:05:00.000Z", today: "2026-10-26" });
    const week = await nextWeek(tx);
    expect(week).toHaveLength(35);
    expect(await tx.get("planned_meals", "2026-10-26|breakfast")).toMatchObject({ meal_slug: "steak-and-eggs", swapped: 0 });
    expect(await tx.get("planned_meals", "2026-10-26|dinner")).toMatchObject({ meal_slug: BOWL, swapped: 1 });
    // Both now rest, so the kept slots are the only places they appear.
    const kept = (r: Row) => r.date === "2026-10-26" && (r.slot === "breakfast" || r.slot === "dinner");
    expect(week.filter((r) => !kept(r)).some((r) => r.meal_slug === BOWL || r.meal_slug === "steak-and-eggs")).toBe(false);
  });

  it("refuses a closed window, a week the window doesn't name, and a time out of bounds", async () => {
    const tx = phone();
    const tuesday = { now: "2026-10-27T18:00:00.000Z", today: "2026-10-27" };
    await expect(run(tx, "finishCheckIn", finish({ at: tuesday.now }), tuesday)).rejects.toThrow("That week's check-in has closed.");
    await expect(run(tx, "finishCheckIn", finish({ week: "2026-10-12" }))).rejects.toThrow("That week's check-in has closed.");
    await expect(run(tx, "finishCheckIn", finish({ at: "2026-10-25T23:15:00.000Z" }))).rejects.toThrow("That time is in the future.");
    await expect(run(tx, "finishCheckIn", finish({ at: "2026-10-22T23:00:00.000Z" }))).rejects.toThrow("That time is too long ago.");
    expect(await tx.scan("check_ins")).toEqual([]);
  });

  it("replaces the first finish until Monday 3am, then refuses", async () => {
    const tx = phone();
    await run(tx, "finishCheckIn", finish());
    // Sunday 9pm: walk instead, rest nothing, and hold the shoulder press.
    const evening = { now: "2026-10-26T02:05:00.000Z", today: "2026-10-25" };
    await run(tx, "finishCheckIn", finish({ at: "2026-10-26T02:00:00.000Z", pick: "steps", hunger: "high", rest: [], lifts: [{ exercise: SHOULDER, plan: "hold" }] }), evening);
    expect(await tx.get("targets", "2026-10-26")).toEqual({ effective_from: "2026-10-26", kcal: 2400, protein_g: 180, step_goal: 8000 });
    expect(await tx.get("meal_state", BOWL)).toMatchObject({ rested_until: null });
    expect(await tx.get("lift_drops", SHOULDER)).toBeNull();
    const row = (await tx.get("check_ins", "2026-10-19"))!;
    expect(row).toMatchObject({ hunger: "high", completed_at: AT });
    expect(JSON.parse(row.outcome as string)).toMatchObject({ pick: "steps", rest: [] });
    // Monday 4am: the new week has started.
    const monday = { now: "2026-10-26T09:05:00.000Z", today: "2026-10-26" };
    await expect(run(tx, "finishCheckIn", finish({ at: "2026-10-26T09:00:00.000Z" }), monday)).rejects.toThrow("That check-in is already finished.");
    expect(describeRejection("finishCheckIn", "That check-in is already finished.")).toBe("Check-in didn't save. That check-in is already finished.");
  });

  it("falls back to calories when steps are picked and the call has no walking option", async () => {
    const tx = phone();
    // Sunday Oct 18: week two holds, so there is no walking pick. No steps were logged that week, so no ramp.
    await run(tx, "finishCheckIn", finish({ week: "2026-10-12", at: "2026-10-18T23:00:00.000Z", pick: "steps", rest: [], lifts: [] }), { now: "2026-10-18T23:05:00.000Z", today: "2026-10-18" });
    expect(await tx.get("targets", "2026-10-19")).toEqual({ effective_from: "2026-10-19", kcal: 2400, protein_g: 180, step_goal: 7000 });
    expect(JSON.parse((await tx.get("check_ins", "2026-10-12"))!.outcome as string)).toMatchObject({ pick: "calories", call: { kind: "hold" } });
  });

  it("makes walking the pick after two hungry Sundays", async () => {
    const t = weekThree();
    t.check_ins = [checkInRow("2026-10-12", { hunger: "high" })];
    const tx = phone(t);
    await run(tx, "finishCheckIn", finish({ hunger: "high", pick: "steps" }));
    expect(await tx.get("targets", "2026-10-26")).toMatchObject({ kcal: 2400, step_goal: 8000 });
    expect(JSON.parse((await tx.get("check_ins", "2026-10-19"))!.outcome as string)).toMatchObject({ pick: "steps", call: { pick: "steps", hungry: true } });
  });
});
```

- [ ] **Step 2: Run them to make sure they fail.**

```bash
npx vitest run --project unit tests/unit/sync/checkin-mutators.test.ts
```

Expected: the `finishCheckIn` tests FAIL with "Unknown change: finishCheckIn". The waist and grocery tests pass.

- [ ] **Step 3: Implement.** In `app/sync/mutators.ts`:

1. Add imports:

```ts
import { buildDigest } from "~/checkin/digest";
import { lastEatenBefore, restUntil } from "~/checkin/meals";
import { checkInWindow } from "~/domain/checkin";
```

change the dates import to `import { addDays, daysBetween, mealDate, weekStart, weekday } from "~/domain/dates";`, and change `import type { RotationMeal } from "~/domain/rotation";` to `import { generateWeek, type RotationMeal } from "~/domain/rotation";`.

2. Add above `const defs = {`:

```ts
/** The tables the check-in's rules read, scanned once before Finish writes anything. */
const CHECK_IN_TABLES = [
  "weigh_ins",
  "meal_logs",
  "targets",
  "steps_daily",
  "check_ins",
  "workout_sessions",
  "set_logs",
  "exercise_checks",
  "exercise_overrides",
  "exercise_swaps",
  "schedule_moves",
  "waist_logs",
  "meal_state",
];

async function snapshot(tx: Tx): Promise<(table: string) => Row[]> {
  const tables = new Map<string, Row[]>();
  for (const t of CHECK_IN_TABLES) tables.set(t, await tx.scan(t));
  return (t) => tables.get(t) ?? [];
}

/** What an earlier finish of the same week rested and dropped, from its outcome. */
function earlierFinish(row: Row | null): { rest: string[]; drops: string[] } {
  try {
    const o = JSON.parse(String(row?.outcome ?? "{}")) as { rest?: unknown; lifts?: unknown };
    const rest = Array.isArray(o.rest) ? o.rest.filter((s): s is string => typeof s === "string") : [];
    const lifts = Array.isArray(o.lifts) ? (o.lifts as { exercise?: unknown; plan?: unknown }[]) : [];
    return { rest, drops: lifts.filter((l) => l?.plan === "drop" && typeof l.exercise === "string").map((l) => l.exercise as string) };
  } catch {
    return { rest: [], drops: [] };
  }
}

const level = z.enum(["low", "fine", "high"]).nullable();
const liftPlan = z.object({ exercise: exerciseId, plan: z.enum(["hold", "drop"]) });
type FinishArgs = {
  week: string;
  at: string;
  pick: "calories" | "steps";
  hunger: "low" | "fine" | "high" | null;
  energy: "low" | "fine" | "high" | null;
  sleep: "poor" | "fine" | "great" | null;
  rest: string[];
  lifts: { exercise: string; plan: "hold" | "drop" }[];
};
```

3. Add to `defs`, after `checkGrocery`:

```ts
  finishCheckIn: {
    args: z.object({
      week: date,
      at,
      pick: z.enum(["calories", "steps"]),
      hunger: level,
      energy: level,
      sleep: z.enum(["poor", "fine", "great"]).nullable(),
      rest: z.array(mealSlug).max(40),
      lifts: z.array(liftPlan).max(30),
    }),
    async run(tx: Tx, a: FinishArgs, ctx: MutationContext) {
      // 1. Checks. The window is judged by the phone's time, which may be up to 2 days old.
      checkTime(a.at, ctx);
      const at = new Date(a.at);
      if (checkInWindow(at) !== a.week) throw new MutationRejected("That week's check-in has closed.");
      const next = addDays(a.week, 7);
      const saved = await tx.get("check_ins", a.week);
      // Finishing again replaces the first, until the new week starts at Monday 3am (mealDate's rule).
      if (saved && mealDate(at) >= next) throw new MutationRejected("That check-in is already finished.");

      // 2. The call, worked out again from the rows. The args never carry a number.
      const rows = await snapshot(tx);
      const rest = [...new Set(a.rest)].filter((slug) => meals.has(slug));
      const d = buildDigest(rows, a.week, { hunger: a.hunger, energy: a.energy, sleep: a.sleep, rest });
      const { call } = d;

      // 3. Monday's targets. Only a call with a walking option can take it; protein stays.
      const pick = a.pick === "steps" && call.steps ? "steps" : "calories";
      const chosen = pick === "steps" && call.steps ? call.steps : call.calories;
      tx.put("targets", { effective_from: next, kcal: chosen.kcal, protein_g: d.protein.target, step_goal: chosen.stepGoal });

      // Undo what an earlier finish of this week set and this one doesn't, if nothing has changed it since.
      const until = restUntil(a.week);
      const stuck = new Map(d.lifts.stuck.map((s) => [s.exercise, s]));
      const drops = [...new Set(a.lifts.filter((l) => l.plan === "drop" && stuck.has(l.exercise)).map((l) => l.exercise))];
      const earlier = earlierFinish(saved);
      for (const slug of earlier.rest) {
        if (rest.includes(slug)) continue;
        const state = await tx.get("meal_state", slug);
        if (state?.rested_until === until) tx.put("meal_state", { ...state, rested_until: null });
      }
      for (const exercise of earlier.drops) {
        if (drops.includes(exercise)) continue;
        if ((await tx.get("lift_drops", exercise))?.from_date === next) tx.delete("lift_drops", exercise);
      }

      // 4. The row. completed_at keeps the first finish.
      const lifts = a.lifts.map((l) => ({ exercise: l.exercise, plan: drops.includes(l.exercise) ? "drop" : "hold" }));
      tx.put("check_ins", {
        week_start: a.week,
        avg_weight: d.weight.trend,
        change: d.weight.change,
        adherence: d.days.full,
        outcome: JSON.stringify({ call, pick, rest, lifts }),
        completed_at: (saved?.completed_at as string | undefined) ?? a.at,
        burn: call.burn,
        burn_state: call.state,
        intake_avg: call.intakeAvg,
        tracked_days: call.trackedDays,
        hunger: a.hunger,
        energy: a.energy,
        sleep: a.sleep,
      });

      // 5. Rests, keeping each meal's photo.
      for (const slug of rest) {
        const state = await tx.get("meal_state", slug);
        tx.put("meal_state", { slug, photo_key: (state?.photo_key as string | null | undefined) ?? null, rested_until: until });
      }

      // 6. Drops, for the next session from Monday.
      for (const exercise of drops) tx.put("lift_drops", { exercise_id: exercise, weight_lb: stuck.get(exercise)!.drop, from_date: next, created_at: ctx.now });

      // 7. Next week's meals, keeping any slot already eaten, skipped or swapped.
      const week = generateWeek({ weekStart: next, meals: rotationMeals(), lastEaten: lastEatenBefore(rows, next), rested: await restedOn(tx, next) });
      const logs = await tx.scan("meal_logs");
      const planned = new Map((await tx.scan("planned_meals")).map((r) => [`${r.date}|${r.slot}`, r]));
      for (const p of week) {
        const answered = logs.some((l) => l.date === p.date && l.slot === p.slot && (l.category === "planned" || l.category === "skipped"));
        if (answered || Number(planned.get(`${p.date}|${p.slot}`)?.swapped ?? 0) === 1) continue;
        tx.put("planned_meals", { date: p.date, slot: p.slot, meal_slug: p.slug, swapped: 0 });
      }
    },
  },
```

`restedOn` is the mutator helper already in this file; it scans `meal_state` after step 5's writes, so the new rests and the undone ones are both seen.

4. Add to `MUTATION_LABELS`, after `checkGrocery: "Grocery check",`:

```ts
  finishCheckIn: "Check-in",
```

- [ ] **Step 4: Run the tests and typecheck.**

```bash
npx vitest run --project unit tests/unit/sync/checkin-mutators.test.ts tests/unit/sync/mutators.test.ts tests/unit/sync/meal-mutators.test.ts
npm run typecheck
```

Expected: PASS, no type errors.

- [ ] **Step 5: Commit.**

```bash
git add app/sync/mutators.ts tests/unit/sync/checkin-mutators.test.ts
git commit -m "Finish check-in is one named change: targets, the row, rests, drops and next week's meals"
```

---

### Task 14: Finish check-in through push, on both people's databases

**Files:**
- Create: `tests/workers/checkin-push.test.ts`

- [ ] **Step 1: Write the test.**

```ts
import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { processPush } from "~/sync/push.server";
import { BOWL, SHOULDER, weekThree, type Tables } from "../unit/checkin/fixture";

async function seed(d1: D1Database, t: Tables) {
  const statements: D1PreparedStatement[] = [];
  for (const [table, rows] of Object.entries(t)) {
    for (const r of rows) {
      const cols = Object.keys(r);
      statements.push(d1.prepare(`INSERT INTO ${table} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`).bind(...cols.map((c) => r[c] ?? null)));
    }
  }
  await d1.batch(statements);
}

const finish = {
  week: "2026-10-19",
  at: "2026-10-25T23:00:00.000Z",
  pick: "calories",
  hunger: "high",
  energy: "fine",
  sleep: "great",
  rest: [BOWL],
  lifts: [{ exercise: SHOULDER, plan: "drop" }],
  // Not in the schema: dropped, so it can't set a number.
  kcal: 1200,
};

async function expectFinished(d1: D1Database) {
  expect(await d1.prepare("SELECT kcal, protein_g, step_goal FROM targets WHERE effective_from = '2026-10-26'").first()).toEqual({ kcal: 2300, protein_g: 180, step_goal: 7500 });
  expect(await d1.prepare("SELECT avg_weight, change, adherence, burn, burn_state, intake_avg, tracked_days, hunger, energy, sleep FROM check_ins WHERE week_start = '2026-10-19'").first()).toEqual({
    avg_weight: 205.1,
    change: -0.4,
    adherence: 4,
    burn: 2680,
    burn_state: "settling",
    intake_avg: 2400,
    tracked_days: 6,
    hunger: "high",
    energy: "fine",
    sleep: "great",
  });
  expect(await d1.prepare(`SELECT rested_until FROM meal_state WHERE slug = '${BOWL}'`).first()).toEqual({ rested_until: "2026-11-08" });
  expect(await d1.prepare("SELECT exercise_id, weight_lb, from_date FROM lift_drops").all().then((r) => r.results)).toEqual([{ exercise_id: SHOULDER, weight_lb: 40, from_date: "2026-10-26" }]);
  expect(await d1.prepare("SELECT COUNT(*) AS n FROM planned_meals WHERE date BETWEEN '2026-10-26' AND '2026-11-01'").first()).toEqual({ n: 35 });
}

describe("finishCheckIn through push", () => {
  it("saves the same numbers as the phone in Kameron's database, and only there", async () => {
    await seed(env.DB, weekThree());
    const res = await processPush(env.DB, { clientId: "phone-checkin-k", mutations: [{ id: 1, name: "finishCheckIn", args: finish }] }, new Date("2026-10-25T23:05:00Z"));
    expect(res.rejected).toEqual([]);
    await expectFinished(env.DB);
    expect(await env.DB_CATHERINE.prepare("SELECT COUNT(*) AS n FROM check_ins").first()).toEqual({ n: 0 });
  });

  it("does the same in Catherine's", async () => {
    await seed(env.DB_CATHERINE, weekThree());
    const res = await processPush(env.DB_CATHERINE, { clientId: "phone-checkin-c", mutations: [{ id: 1, name: "finishCheckIn", args: finish }] }, new Date("2026-10-25T23:05:00Z"));
    expect(res.rejected).toEqual([]);
    await expectFinished(env.DB_CATHERINE);
  });

  it("refuses the same week again after Monday 3am", async () => {
    const res = await processPush(env.DB, { clientId: "phone-checkin-k", mutations: [{ id: 2, name: "finishCheckIn", args: { ...finish, at: "2026-10-26T09:00:00.000Z" } }] }, new Date("2026-10-26T09:05:00Z"));
    expect(res.rejected).toEqual([{ id: 2, message: "That check-in is already finished." }]);
  });
});
```

Hunger is High with no saved week before it, so it moves nothing: the call is the plain settling cut.

- [ ] **Step 2: Run it.**

```bash
npx vitest run --project workers tests/workers/checkin-push.test.ts
```

Expected: PASS. If a seed insert fails, a fixture row has a column D1 doesn't: fix the fixture, not the test. If the numbers differ from the unit test's, the server read something the phone didn't: compare `CHECK_IN_TABLES` with what the rules read.

- [ ] **Step 3: Commit.**

```bash
git add tests/workers/checkin-push.test.ts
git commit -m "Prove finish check-in saves the phone's numbers on D1, in each person's own database"
```

---

### Task 15: Pull and the 5-minute cron make the week's plan

Today's layout loader makes this week's plan now, and it goes in P4e. Pull and the cron take over, so the plan exists for a phone that only syncs, and Monday's exists before anyone opens the app.

**Files:**
- Modify: `app/routes/api.sync.pull.ts`, `app/jobs/scheduled.ts`
- Create: `tests/workers/sync-pull-route.test.ts`
- Test: `tests/workers/scheduled.test.ts`

- [ ] **Step 1: Write the failing tests.**

1. Create `tests/workers/sync-pull-route.test.ts`:

```ts
import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { addDays, mealDate, weekStart } from "~/domain/dates";
import { loader } from "~/routes/api.sync.pull";
import { runAsUser } from "~/server/current-user.server";
import { userById } from "~/server/users.server";
import { routeArgs } from "./helpers";

const planned = async (d1: D1Database, monday: string) =>
  (await d1.prepare("SELECT COUNT(*) AS n FROM planned_meals WHERE date BETWEEN ? AND ?").bind(monday, addDays(monday, 6)).first<{ n: number }>())!.n;
const pull = (clientId: string) => routeArgs(new Request(`http://localhost/api/sync/pull?since=0&clientId=${clientId}`));

describe("pull", () => {
  it("makes this week's plan before it reads, for someone with a plan", async () => {
    const monday = weekStart(mealDate(new Date()));
    const res = (await loader(pull("phone-pull-k"))) as Response;
    expect(res.status).toBe(200);
    expect(await planned(env.DB, monday)).toBe(35);
    const body = (await res.json()) as { puts: Record<string, { date: string }[]> };
    expect(body.puts.planned_meals.filter((r) => r.date >= monday && r.date <= addDays(monday, 6))).toHaveLength(35);
  });

  it("makes no plan for someone without one", async () => {
    const catherine = (await userById(2))!;
    await runAsUser(catherine, () => loader(pull("phone-pull-c")));
    expect(await planned(env.DB_CATHERINE, weekStart(mealDate(new Date())))).toBe(0);
  });
});
```

2. In `tests/workers/scheduled.test.ts`, add at the end:

```ts
it("makes this week's plan on the 5-minute cron, for each person with a plan", async () => {
  const ctx = createExecutionContext();
  // Monday Jan 11, 2027, 9am in Chicago.
  await worker.scheduled(createScheduledController({ cron: "*/5 * * * *", scheduledTime: Date.UTC(2027, 0, 11, 15) }), env, ctx);
  await waitOnExecutionContext(ctx);
  const count = (d1: D1Database) => d1.prepare("select count(*) as n from planned_meals where date between '2027-01-11' and '2027-01-17'").first<{ n: number }>();
  expect((await count(env.DB))!.n).toBe(35);
  expect((await count(env.DB_CATHERINE))!.n).toBe(0);
});
```

- [ ] **Step 2: Run them to make sure they fail.**

```bash
npx vitest run --project workers tests/workers/sync-pull-route.test.ts tests/workers/scheduled.test.ts
```

Expected: the pull test and the new cron test FAIL with 0 planned meals. Catherine's test passes already.

- [ ] **Step 3: Pull.** Replace `app/routes/api.sync.pull.ts` with:

```ts
import type { Route } from "./+types/api.sync.pull";
import { mealDate, weekStart } from "~/domain/dates";
import { serverNow } from "~/server/clock.server";
import { currentUser, userD1, userDb } from "~/server/current-user.server";
import { ensureWeekPlan } from "~/server/meal-plan.server";
import { processPull } from "~/sync/pull.server";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const since = Number(url.searchParams.get("since") ?? "0");
  const clientId = url.searchParams.get("clientId") ?? "";
  if (!Number.isInteger(since) || since < 0 || clientId.length < 8) return Response.json({ error: "Bad pull" }, { status: 400 });
  // The week's plan is made before reading, so a phone that only syncs still gets this week's meals.
  if (currentUser().planKey) await ensureWeekPlan(userDb(), weekStart(mealDate(serverNow())));
  return Response.json(await processPull(userD1(), since, clientId), { headers: { "Cache-Control": "no-store" } });
}
```

- [ ] **Step 4: The cron.** In `app/jobs/scheduled.ts`:

1. Add imports:

```ts
import { mealDate, weekStart } from "~/domain/dates";
import { ensureWeekPlan } from "~/server/meal-plan.server";
```

2. Replace the reminders loop

```ts
    for (const person of people) {
      // Reminders read the plan, so someone without one gets none yet.
      if (!person.planKey) continue;
      const sent = await runReminders(getDb(env[person.dbBinding]), now);
      if (sent.length) console.log(`[cron] reminders for ${person.name}: ${sent.join(", ")}`);
    }
```

with

```ts
    for (const person of people) {
      // Reminders and meals read the plan, so someone without one gets neither yet.
      if (!person.planKey) continue;
      const db = getDb(env[person.dbBinding]);
      // Monday's meals exist before anyone opens the app, so the first pull brings them.
      await ensureWeekPlan(db, weekStart(mealDate(now)));
      const sent = await runReminders(db, now);
      if (sent.length) console.log(`[cron] reminders for ${person.name}: ${sent.join(", ")}`);
    }
```

- [ ] **Step 5: Run the tests and typecheck.**

```bash
npx vitest run --project workers tests/workers/sync-pull-route.test.ts tests/workers/scheduled.test.ts tests/workers/sync-pull.test.ts
npm run typecheck
```

Expected: PASS, no type errors.

- [ ] **Step 6: Commit.**

```bash
git add app/routes/api.sync.pull.ts app/jobs/scheduled.ts tests/workers/sync-pull-route.test.ts tests/workers/scheduled.test.ts
git commit -m "Pull and the 5-minute cron make the week's meal plan for anyone with a plan"
```

---

### Task 16: Full suite, the migrations, the PR, and the wire

- [ ] **Step 1: Run the whole suite once.**

```bash
npm run typecheck && npm test
```

Expected: all green. Fix only the failing files, then re-run those files only.

- [ ] **Step 2: Push and open the PR. Do not merge.**

```bash
git push -u origin v2/p4a-checkin-data
gh pr create --base main --title "Rocky v2 P4a: check-in data, rules and named changes" --body-file - <<'MD'
Project 4, rollout step P4a (`docs/superpowers/specs/2026-10-28-checkin-plan-progress-library-design.md`). Plan: `docs/superpowers/plans/2026-10-28-p4a-checkin-data.md`.

**Needs `npm run db:migrate:remote` before merge** (0010 and 0011): pull's snapshot reads the new `lift_drops` table.

- `check_ins` keeps the Sunday taps (`hunger`, `energy`, `sleep`). A synced `lift_drops` table holds a stuck lift's one-session drop. `SYNC_SCHEMA` stays 3.
- `plan.json` names the Jan 1 goal; exercises fold into five body parts.
- Stuck lifts (same top weight, no more reps, three sessions running, deloads skipped) and the drop back (about 10%, to the increment).
- A dropped lift starts its next session at the dropped weight, in Today's line and the gym, with the plain-ink "Dropped to 40 at Sunday's check-in. Build back from here."
- Two hungry Sundays running make walking Rocky's pick for a cut, with a why-line.
- The week's call over the phone's copy (`weekCall`), the week's lifts, meal repeats and rests, the `CheckInDigest`, and Rocky's rule-written take.
- Named changes: `finishCheckIn`, `logWaist`, `checkGrocery`.
- Pull and the 5-minute cron make the week's meal plan.

Nothing on screen changes except the gym's line for a dropped lift. The v1 check-in still works; P4b replaces it.

Spec gaps resolved and new copy: see "Calls made in this plan" at the top of the plan.
MD
```

End the body with the attribution lines the build session's harness gives for PR bodies, if any. Cloudflare does not build branches, so the PR has no build check.

- [ ] **Step 3: Hand Kameron the migrations, and wait for his "done" before anything merges.**

```bash
npm run db:migrate:remote
npx wrangler d1 execute rocky-db --remote --command "PRAGMA table_info(check_ins)"
npx wrangler d1 execute rocky-db-catherine --remote --command "PRAGMA table_info(check_ins)"
npx wrangler d1 execute rocky-db --remote --command "select name from sqlite_master where name like '%lift_drops%' order by name"
npx wrangler d1 execute rocky-db-catherine --remote --command "select name from sqlite_master where name like '%lift_drops%' order by name"
```

Expected: `hunger`, `energy` and `sleep` listed for both person databases, and `lift_drops` with its three `sync_lift_drops_*` triggers in each. `rocky-core` reports no new migrations.

- [ ] **Step 4: Report back and wait.** Kameron reviews and merges. Pushing `main` deploys through Workers Builds. After the merge, confirm the build on the merge commit is green:

```bash
gh api repos/kameronpduhon/rocky-the-coach/commits/$(git rev-parse origin/main)/check-runs --jq '.check_runs[] | "\(.name) \(.status) \(.conclusion)"'
```

- [ ] **Step 5: Verify on the wire.** The workout route's chunk and its imports carry the new gym line:

```bash
BASE=https://kampduh.com
MANIFEST=$(curl -s $BASE/login | grep -o '/assets/manifest-[A-Za-z0-9_-]*\.js' | head -1)
curl -s "$BASE$MANIFEST" | grep -o '"routes/workout":{[^}]*' | grep -o '/assets/[A-Za-z0-9_.-]*\.js' | sort -u | while read -r f; do curl -s "$BASE$f"; done \
  | grep -oE "Build back from here|at Sunday's check-in" | sort | uniq -c
```

Expected: both strings at least once. If they are missing, the deploy hasn't landed: check Step 4 again, and if it is stuck, Kameron runs `npm run deploy`.

---

## Self-review

- **Spec coverage (rollout step 1):** migration (Tasks 1, 2), `goal` and `BODY_PART` (3), `stalls` and `dropWeight` (4), `withDrop` in Today and the workout model with the gym's line (5), `hungry` in `nextTarget` (6), `weekCall` (7), meal repeats and rests (8), the week's lifts (9), `buildDigest` (10), `ruleTake` (11), `logWaist` and `checkGrocery` (12), `finishCheckIn` (13, 14), pull and cron (15). Testing section: every unit and workers bullet for P4a has a test above.
- **Names match the spec's Named changes table:** `finishCheckIn { week, at, pick, hunger, energy, sleep, rest, lifts }`, `logWaist { date, inches }`, `checkGrocery { week, food, checked }`, labels "Check-in", "Waist", "Grocery check".
