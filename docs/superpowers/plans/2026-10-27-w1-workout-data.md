# W1: Workout Data, Named Changes and the Rest Timer Implementation Plan

> **For agentic workers:** implement this plan task-by-task with the `executing-plans` skill. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lay everything the new workout screens (W2) need, while nothing on screen changes:
- **Workouts that can be planned and logged offline.** Each workout gets a phone-made ID and its own lift list, and the feel tap gets a column.
- **Exercise notes.**
- **The workout named changes.**
- **The "how did it feel" weight rule.**
- **A server-side rest timer** that pings a locked phone.

**Architecture:**
- **The workout tables.**
    - `workout_sessions` is rebuilt so a workout can be planned without a start. It gains `client_id`, `planned_at`, `lifts` and `feel`.
    - `set_logs` and `exercise_checks` gain `session_key`, the workout's sync key, so a set logged offline can point at a workout the server has not numbered yet.
- **Shared mutators** run on the phone and the server. On the server they also fill the numeric `session_id`, so v1 readers keep working.
- **A full snapshot after the change.** A sync schema number makes every phone drop its saved copy and take a fresh snapshot once, because two tables change their row keys.
- **The rest timer** is a SQLite-backed Durable Object per person, behind `POST` and `DELETE /api/rest`.

**Tech Stack:** Drizzle + D1 migrations, Cloudflare Durable Objects (alarms), the F2 sync layer, Zod 4, Vitest 4 with `@cloudflare/vitest-plugin`.

**Spec:** `docs/superpowers/specs/2026-10-27-workouts-design.md` (sections 1, 3 and 5, rollout step 1). **Branch:** `v2/w1-workout-data` (already created from `main`; the spec is committed).

**Calls made in this plan (flag them in the PR):**
- **The two looser columns.**
    - `set_logs.session_id` stays `NOT NULL` on the server; the server fills it from the workout's row. On the phone it can be null until the next pull.
    - `exercise_checks` keeps its old primary key and gains a unique index on `(session_key, exercise_id)`, which the sync upsert targets.
- **`planWorkout` takes an `at` argument**, so `planned_at` is the phone's time, like every other workout time.
- **Updating a row the server has already numbered** goes by `id`. A v1 row has no `client_id`, so `ServerTx` now upserts on `id` whenever the row has one and the table is keyed by `client_id`. Without this, editing a v1 set through the store would fail on the primary key.
- **The feel rule lands as a function only.** Nothing in W1 sets `feel`, so nothing uses it yet; W2 wires it to Today and the gym.
- **The Worker tests get their own entry module** (`tests/workers/test-worker.ts`). The plugin needs the Durable Object class exported from `main`, and the app's real entry imports a React Router virtual module that tests cannot load.

---

## Ground rules

- Everything from the earlier plans applies:
    - No em dashes.
    - No `Co-Authored-By`.
    - One full `npm run typecheck && npm test` at the end.
    - Kameron runs remote migrations.
- Browser-run modules (`app/sync/*.ts` except `*.server.ts`, `app/rest/clock.ts`, `app/domain/*`) import nothing from `cloudflare:workers` or `*.server.ts`.
- Store rows are raw D1 rows: snake_case, booleans `0`/`1`, JSON columns as strings.

## Lift list format (`workout_sessions.lifts`)

A JSON array, or null when the day follows its template (with its always-swaps):

```ts
{ position: number; exercise: string; repMin: number; repMax: number; from: "plan" | "swap" | "added"; replaces?: string }
```

- Plan lifts keep their template position (0, 1, 2 and so on).
- Added lifts take 100 and up.
- Skipping a lift removes its entry, and nothing is renumbered.
- Migrated custom workouts keep their v1 positions (the list index) with `from: "added"` and reps 8 to 12.

---

### Task 1: The feel rule

**Files:**
- Modify: `app/domain/progression.ts`
- Test: `tests/unit/domain/progression.test.ts`

- [ ] **Step 1: Write the failing tests.** Add to the `describe('nextSuggestion', ...)` block in `tests/unit/domain/progression.test.ts`:

```ts
  const top = [{ weight: 270, reps: 12 }, { weight: 270, reps: 12 }];
  const short = [{ weight: 270, reps: 12 }, { weight: 270, reps: 11 }];
  const legs = { repMax: 12, increment: 10, deload: false };

  it('goes up one step after an "about right" or unrated session at the top', () => {
    expect(nextSuggestion(top, legs, 'right')).toEqual({ weight: 280, goUp: true });
    expect(nextSuggestion(top, legs, null)).toEqual({ weight: 280, goUp: true });
  });

  it('goes up two steps after an easy session at the top', () => {
    expect(nextSuggestion(top, legs, 'easy')).toEqual({ weight: 290, goUp: true });
  });

  it('holds after a hard session, even at the top', () => {
    expect(nextSuggestion(top, legs, 'hard')).toEqual({ weight: 270, goUp: false });
  });

  it('holds below the top whatever the feel', () => {
    expect(nextSuggestion(short, legs, 'easy')).toEqual({ weight: 270, goUp: false });
  });

  it('holds in a deload week whatever the feel', () => {
    expect(nextSuggestion(top, { ...legs, deload: true }, 'easy')).toEqual({ weight: 270, goUp: false });
  });
```

- [ ] **Step 2: Run them to make sure they fail.**

```bash
npx vitest run --project unit tests/unit/domain/progression.test.ts
```

Expected: the easy and hard tests fail, because the third argument is ignored.

- [ ] **Step 3: Add the feel to `nextSuggestion`** in `app/domain/progression.ts`:

```ts
/** How the last session felt, from the optional tap after a workout. */
export type Feel = 'easy' | 'right' | 'hard';

export function nextSuggestion(lastSession: LoggedSet[] | null, rule: ProgressionRule, feel: Feel | null = null): Suggestion {
  if (!lastSession || lastSession.length === 0) return { weight: null, goUp: false };
  const top = Math.max(...lastSession.map((s) => s.weight));
  const atTop = lastSession.every((s) => s.reps >= rule.repMax);
  // Hard holds even at the top. Easy at the top earns a second step.
  const goUp = !rule.deload && atTop && feel !== 'hard';
  const steps = feel === 'easy' ? 2 : 1;
  return { weight: goUp ? top + rule.increment * steps : top, goUp };
}
```

- [ ] **Step 4: Run the tests again.** Same command. Expected: PASS, the old tests included.

- [ ] **Step 5: Commit.**

```bash
git add app/domain/progression.ts tests/unit/domain/progression.test.ts
git commit -m "Let how a workout felt shape next time's weight"
```

---

### Task 2: Schema, registry and the migrations

**Files:**
- Modify: `app/db/schema.ts`, `app/sync/tables.ts`, `scripts/gen-sync-triggers.ts`
- Create: `drizzle/0006_workout_data.sql` (generated, then edited), `drizzle/0007_workout_sync.sql` (custom)
- Modify: `tests/unit/sync/tables.test.ts`, `tests/workers/schema.test.ts`

- [ ] **Step 1: Change the schema.** In `app/db/schema.ts`:

1. Add `uniqueIndex` to the `drizzle-orm/sqlite-core` import.
2. In `workoutSessions`, make `startedAt` nullable and add four columns:

```ts
    /** Null while a workout is planned but not started. */
    startedAt: text("started_at"),
    endedAt: text("ended_at"),
    /** JSON array of exercise ids, for a workout built on the spot rather than taken from the plan. v1 only. */
    exercises: text("exercises"),
    /** Made on the phone, so a workout can be created offline. v1 rows have none and sync as `id:<id>`. */
    clientId: text("client_id").unique(),
    plannedAt: text("planned_at"),
    /** JSON lift list for this day (see the W1 plan). Null follows the template and its always-swaps. */
    lifts: text("lifts"),
    /** easy, right or hard, from the optional tap after the workout. */
    feel: text("feel"),
```

3. In `setLogs`, add after `sessionId`:

```ts
    /** The workout's sync key: its client_id, or id:<id> for a v1 workout. */
    sessionKey: text("session_key").notNull().default(""),
```

4. In `exerciseChecks`, add the same `sessionKey` column, and change the table extras to:

```ts
  (t) => [primaryKey({ columns: [t.sessionId, t.exerciseId] }), uniqueIndex("exercise_checks_session_key").on(t.sessionKey, t.exerciseId)],
```

5. Add a table at the end:

```ts
/** A note kept with an exercise from week to week, such as "seat on 4". */
export const exerciseNotes = sqliteTable("exercise_notes", {
  exerciseId: text("exercise_id").primaryKey(),
  note: text("note").notNull(),
  updatedAt: text("updated_at").notNull(),
});
```

- [ ] **Step 2: Generate the migration.**

```bash
npx drizzle-kit generate --name=workout_data
```

Expected: `drizzle/0006_workout_data.sql`, plus a snapshot and a journal entry. Read the SQL. It should hold:
- A rebuild of `workout_sessions`: `CREATE TABLE __new_workout_sessions`, `INSERT ... SELECT`, `DROP TABLE`, `ALTER TABLE ... RENAME`, and the index and unique index recreated.
- `ALTER TABLE ... ADD session_key` for `set_logs` and `exercise_checks`.
- `CREATE TABLE exercise_notes`.
- `CREATE UNIQUE INDEX exercise_checks_session_key`.

- [ ] **Step 3: Edit `0006_workout_data.sql` in two places.**

1. Delete any `PRAGMA foreign_keys=OFF;` and `PRAGMA foreign_keys=ON;` lines, with their breakpoints. These tables have no foreign keys, and D1 does not accept that pragma in a migration.
2. Right after the two `ADD session_key` statements, and before `CREATE UNIQUE INDEX exercise_checks_session_key`, insert the backfill. The unique index would fail on the empty default otherwise:

```sql
UPDATE `set_logs` SET `session_key` = 'id:' || `session_id` WHERE `session_key` = '';
--> statement-breakpoint
UPDATE `exercise_checks` SET `session_key` = 'id:' || `session_id` WHERE `session_key` = '';
--> statement-breakpoint
```

- [ ] **Step 4: Update the sync registry** in `app/sync/tables.ts`:

1. Change `{ name: "workout_sessions", ...byId },` to `{ name: "workout_sessions", ...byClientId },`.
2. Change `{ name: "exercise_checks", ...cols("session_id", "exercise_id") },` to `{ name: "exercise_checks", ...cols("session_key", "exercise_id") },`.
3. Add `{ name: "exercise_notes", ...cols("exercise_id") },` after `profile`.
4. Add, above `SYNCED`:

```ts
/**
 * Bumped whenever a table's row key changes. A phone holding a copy saved under another number drops it (keeping its
 * waiting changes) and takes a full snapshot, so no row is left behind under its old key.
 */
export const SYNC_SCHEMA = 2;
```

- [ ] **Step 5: Let the trigger script rebuild only the tables named.** Replace the loop header in `scripts/gen-sync-triggers.ts` and add a drop before each create:

```ts
// Prints the trigger migration for synced tables: all of them, or only those named. Run it after changing app/sync/tables.ts:
//   npx tsx scripts/gen-sync-triggers.ts [table ...] > drizzle/<n>_<name>.sql
import { SYNCED } from "../app/sync/tables";

const only = process.argv.slice(2);
const out: string[] = [];
for (const { name, keySql } of SYNCED.filter((t) => only.length === 0 || only.includes(t.name))) {
  const neu = keySql("NEW.");
  const old = keySql("OLD.");
  out.push(
    `DROP TRIGGER IF EXISTS sync_${name}_ins;`,
    `DROP TRIGGER IF EXISTS sync_${name}_upd;`,
    `DROP TRIGGER IF EXISTS sync_${name}_del;`,
    `CREATE TRIGGER sync_${name}_ins AFTER INSERT ON ${name} BEGIN INSERT INTO changes (table_name, row_key, op) VALUES ('${name}', ${neu}, 'put'); END;`,
    // A key can change in an update (rare); the old key is then gone from the client's point of view.
    `CREATE TRIGGER sync_${name}_upd AFTER UPDATE ON ${name} BEGIN INSERT INTO changes (table_name, row_key, op) SELECT '${name}', ${old}, 'del' WHERE ${old} IS NOT ${neu}; INSERT INTO changes (table_name, row_key, op) VALUES ('${name}', ${neu}, 'put'); END;`,
    `CREATE TRIGGER sync_${name}_del AFTER DELETE ON ${name} BEGIN INSERT INTO changes (table_name, row_key, op) VALUES ('${name}', ${old}, 'del'); END;`,
  );
}
console.log(out.join("\n--> statement-breakpoint\n"));
```

- [ ] **Step 6: Create the custom migration.**

```bash
npx drizzle-kit generate --custom --name=workout_sync
```

Expected: an empty `drizzle/0007_workout_sync.sql` and a journal entry. Fill it:

```bash
cat > drizzle/0007_workout_sync.sql <<'SQL'
UPDATE workout_sessions SET lifts = (
  SELECT json_group_array(json_object('position', j.key, 'exercise', j.value, 'repMin', 8, 'repMax', 12, 'from', 'added'))
  FROM json_each(workout_sessions.exercises) AS j
) WHERE template_id = 'custom' AND exercises IS NOT NULL AND lifts IS NULL;
--> statement-breakpoint
SQL
npx tsx scripts/gen-sync-triggers.ts workout_sessions exercise_checks exercise_notes >> drizzle/0007_workout_sync.sql
```

The rebuild in 0006 dropped `workout_sessions`' triggers along with the old table. The script recreates them with the new key, re-keys `exercise_checks`, and adds `exercise_notes`.

- [ ] **Step 7: Update the two table-list tests.**
1. In `tests/unit/sync/tables.test.ts`, change `toHaveLength(18)` to `toHaveLength(19)` and the test name to "syncs the 19 personal tables". Add to the first test:

```ts
    expect(keyOf("workout_sessions", { id: 3, client_id: null })).toBe("id:3");
    expect(keyOf("workout_sessions", { id: 3, client_id: "w-1" })).toBe("w-1");
    expect(keyOf("exercise_checks", { session_key: "w-1", exercise_id: "leg-curl" })).toBe("w-1|leg-curl");
```

2. In `tests/workers/schema.test.ts`, add `"exercise_notes"` to the table list, after `"exercise_checks"`.

- [ ] **Step 8: Typecheck, and run the tests that touch the schema.**

```bash
npm run typecheck
npx vitest run --project unit tests/unit/sync/tables.test.ts
npx vitest run --project workers tests/workers/schema.test.ts tests/workers/sync-triggers.test.ts tests/workers/workouts.test.ts tests/workers/custom-workout.test.ts
```

Typecheck flags `startedAt` now being `string | null`. Fix each with `?? ""`, without changing behaviour:
- `app/server/day.server.ts:146` becomes `(b.startedAt ?? "").localeCompare(a.startedAt ?? "")`.
- `progress.server.ts`'s `orderBy` needs no change.

Expected: all PASS. The workouts tests still pass because v1 still writes `started_at`.

- [ ] **Step 9: Commit.**

```bash
git add app/db/schema.ts app/sync/tables.ts scripts/gen-sync-triggers.ts drizzle tests/unit/sync/tables.test.ts tests/workers/schema.test.ts app/server/day.server.ts
git commit -m "Workouts can be planned and keyed on the phone; sets point at their workout's key; exercise notes"
```

---

### Task 3: Prove the migration keeps v1 history

**Files:**
- Modify: `vitest.config.ts`, `tests/workers/env.d.ts`
- Test: `tests/workers/workout-migration.test.ts`

- [ ] **Step 1: Give the Worker tests an empty spare database.** In `vitest.config.ts`, inside the workers `cloudflareTest({ ... miniflare: { ... } })`, add next to `bindings`:

```ts
                // Left unmigrated by apply-migrations.ts, so a test can apply migrations in two halves around old data.
                d1Databases: ["MIGRATION_TEST"],
```

In `tests/workers/env.d.ts`, add `MIGRATION_TEST: D1Database;` to `Env`.

If other Worker tests then fail because `env.DB` is undefined, the option replaced the wrangler bindings instead of adding to them. In that case list all four: `d1Databases: ["DB", "DB_CATHERINE", "CORE", "MIGRATION_TEST"]`.

- [ ] **Step 2: Write the test.** Create `tests/workers/workout-migration.test.ts`:

```ts
import { applyD1Migrations, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("the W1 migration", () => {
  it("keeps every v1 workout and set, links them by key, and copies custom lists", async () => {
    const d1 = env.MIGRATION_TEST;
    const split = env.TEST_MIGRATIONS.findIndex((m) => m.name.startsWith("0006"));
    await applyD1Migrations(d1, env.TEST_MIGRATIONS.slice(0, split));
    await d1.batch([
      d1.prepare("INSERT INTO workout_sessions (id, date, template_id, started_at, ended_at) VALUES (1, '2026-10-21', 'wed-legs-shoulders', '2026-10-21T17:00:00Z', '2026-10-21T18:00:00Z')"),
      d1.prepare(`INSERT INTO workout_sessions (id, date, template_id, started_at, exercises) VALUES (2, '2026-10-22', 'custom', '2026-10-22T17:00:00Z', '["leg-press","leg-curl"]')`),
      d1.prepare("INSERT INTO set_logs (session_id, exercise_id, position, set_number, weight_lb, reps, logged_at) VALUES (1, 'leg-press', 0, 1, 270, 12, '2026-10-21T17:05:00Z')"),
      d1.prepare("INSERT INTO exercise_checks (session_id, exercise_id) VALUES (1, 'leg-curl')"),
      d1.prepare("INSERT INTO exercise_checks (session_id, exercise_id) VALUES (2, 'leg-press')"),
    ]);

    await applyD1Migrations(d1, env.TEST_MIGRATIONS);

    expect(await d1.prepare("SELECT count(*) AS n FROM workout_sessions").first()).toEqual({ n: 2 });
    expect(await d1.prepare("SELECT session_key FROM set_logs").first()).toEqual({ session_key: "id:1" });
    expect((await d1.prepare("SELECT session_key FROM exercise_checks ORDER BY session_id").all()).results).toEqual([{ session_key: "id:1" }, { session_key: "id:2" }]);
    const custom = await d1.prepare("SELECT lifts, started_at FROM workout_sessions WHERE id = 2").first<{ lifts: string; started_at: string }>();
    expect(JSON.parse(custom!.lifts)).toEqual([
      { position: 0, exercise: "leg-press", repMin: 8, repMax: 12, from: "added" },
      { position: 1, exercise: "leg-curl", repMin: 8, repMax: 12, from: "added" },
    ]);
    expect(custom!.started_at).toBe("2026-10-22T17:00:00Z");
    expect(await d1.prepare("SELECT lifts FROM workout_sessions WHERE id = 1").first()).toEqual({ lifts: null });
  });
});
```

- [ ] **Step 3: Run it.**

```bash
npx vitest run --project workers tests/workers/workout-migration.test.ts
```

Expected: PASS. If it fails on a statement, fix that statement in `0006` or `0007`. The test exists to run the real SQL against old data.

- [ ] **Step 4: Add a trigger test.** In `tests/workers/sync-triggers.test.ts`, add:

```ts
  it("keys workouts by their phone id, checks by workout key and exercise, and logs notes", async () => {
    await env.DB.prepare("INSERT INTO workout_sessions (client_id, date, template_id, planned_at) VALUES ('w-t', '2026-10-28', 'wed-legs-shoulders', '2026-10-28T12:00:00Z')").run();
    await env.DB.prepare("INSERT INTO exercise_checks (session_id, session_key, exercise_id) VALUES (99, 'w-t', 'leg-curl')").run();
    await env.DB.prepare("INSERT INTO exercise_notes (exercise_id, note, updated_at) VALUES ('leg-press', 'seat on 4', '2026-10-28T12:00:00Z')").run();
    expect((await changes()).slice(-3)).toEqual([
      { table_name: "workout_sessions", row_key: "w-t", op: "put" },
      { table_name: "exercise_checks", row_key: "w-t|leg-curl", op: "put" },
      { table_name: "exercise_notes", row_key: "leg-press", op: "put" },
    ]);
  });
```

Run `npx vitest run --project workers tests/workers/sync-triggers.test.ts`. Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add vitest.config.ts tests/workers/env.d.ts tests/workers/workout-migration.test.ts tests/workers/sync-triggers.test.ts
git commit -m "Prove the workout migration keeps v1 history and the new triggers log"
```

---

### Task 4: Phones take a fresh snapshot after a key change

**Files:**
- Modify: `app/sync/store.ts`
- Test: `tests/unit/sync/store.test.ts`

- [ ] **Step 1: Write the failing test.** Add to `tests/unit/sync/store.test.ts` (import `SYNC_SCHEMA` from `~/sync/tables` and `SyncStore` if the file does not already):

```ts
  it("drops a copy saved under an older sync schema, keeping the waiting changes", async () => {
    const store = new SyncStore(() => ({ now: "2026-10-27T16:00:00.000Z", today: "2026-10-27" }));
    await store.restore({
      schema: SYNC_SCHEMA - 1,
      version: 40,
      nextMutationId: 3,
      base: { exercise_checks: [{ session_id: 1, exercise_id: "leg-curl" }] },
      pending: [{ id: 2, name: "setVoice", args: { voice: "plain" } }],
    });
    expect(store.version).toBe(0);
    expect(store.rows("exercise_checks")).toEqual([]);
    expect(store.pending).toHaveLength(1);
    expect(store.nextMutationId).toBe(3);
    expect(store.save().schema).toBe(SYNC_SCHEMA);
  });
```

- [ ] **Step 2: Run it to make sure it fails.**

```bash
npx vitest run --project unit tests/unit/sync/store.test.ts
```

Expected: FAIL, with `version` still 40.

- [ ] **Step 3: Implement it.** In `app/sync/store.ts`:

1. Import `SYNC_SCHEMA` along with `keyOf` from `./tables`.
2. Add `schema?: number;` to `SavedState`, with the comment `/** The SYNC_SCHEMA the copy was saved under. Missing on copies saved before W1. */`.
3. `save()` returns `{ schema: SYNC_SCHEMA, version: ..., ... }`.
4. `restore(s)` becomes:

```ts
  async restore(s: SavedState): Promise<void> {
    this.nextMutationId = s.nextMutationId;
    this.pending = s.pending;
    // A copy saved before a row-key change would keep rows under keys the server no longer sends. Start over from a
    // snapshot; the waiting changes still replay on top.
    const current = s.schema === SYNC_SCHEMA;
    this.version = current ? s.version : 0;
    this.base = current ? new Map(Object.entries(s.base).map(([name, rows]) => [name, new Map(rows.map((r) => [keyOf(name, r), r]))])) : new Map();
    await this.rebase();
  }
```

- [ ] **Step 4: Run the store and client tests.**

```bash
npx vitest run --project unit tests/unit/sync/store.test.ts tests/unit/sync/client.test.ts
```

Expected: PASS. A client test that builds a `persisted` object without `schema` now restores to version 0. If one asserts the restored version, add `schema: SYNC_SCHEMA` to its fixture.

- [ ] **Step 5: Commit.**

```bash
git add app/sync/store.ts tests/unit/sync/store.test.ts tests/unit/sync/client.test.ts
git commit -m "Take a fresh snapshot when a table's row key changes"
```

---

### Task 5: The workout named changes

**Files:**
- Modify: `app/sync/mutators.ts`
- Test: `tests/unit/sync/workout-mutators.test.ts`

- [ ] **Step 1: Write the failing tests.** Create `tests/unit/sync/workout-mutators.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { exercises, plan } from "~/content";
import { runMutation } from "~/sync/mutators";
import { MemoryTx } from "~/sync/tx";

const ctx = { now: "2026-10-28T17:00:00.000Z", today: "2026-10-28" };
const run = (tx: MemoryTx, name: string, args: unknown) => runMutation(tx, name, args, ctx);
const W = "w-1";
const LEGS = "wed-legs-shoulders";
const FIRST = plan.templates[LEGS]!.exercises[0].exercise;
const OTHER = [...exercises.keys()].find((id) => id !== FIRST)!;
const fresh = () => new MemoryTx(new Map());

async function planned(tx = fresh()) {
  await run(tx, "planWorkout", { clientId: W, date: "2026-10-28", templateId: LEGS, at: ctx.now });
  return tx;
}

const set = (overrides: Record<string, unknown> = {}) => ({ clientId: "s-1", workout: W, position: 0, exercise: FIRST, setNumber: 1, weightLb: 280, reps: 11, at: ctx.now, ...overrides });

describe("workout mutators", () => {
  it("plans a workout without starting it, and retargets it before the start", async () => {
    const tx = await planned();
    expect(await tx.get("workout_sessions", W)).toMatchObject({ client_id: W, template_id: LEGS, started_at: null, planned_at: ctx.now, lifts: null });
    await run(tx, "setLifts", { workout: W, lifts: [{ position: 100, exercise: OTHER, repMin: 8, repMax: 12, from: "added" }] });
    await run(tx, "planWorkout", { clientId: "w-2", date: "2026-10-28", templateId: "mon-chest-back-arms", at: ctx.now });
    const rows = await tx.scan("workout_sessions");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ client_id: W, template_id: "mon-chest-back-arms", lifts: null });
  });

  it("refuses to switch a workout that has started", async () => {
    const tx = await planned();
    await run(tx, "startWorkout", { workout: W, at: ctx.now });
    await expect(run(tx, "planWorkout", { clientId: "w-2", date: "2026-10-28", templateId: "mon-chest-back-arms", at: ctx.now })).rejects.toThrow("already started");
  });

  it("logs a set keyed to its workout, starting the workout if needed", async () => {
    const tx = await planned();
    await run(tx, "logSet", set());
    expect(await tx.get("set_logs", "s-1")).toMatchObject({ session_key: W, exercise_id: FIRST, position: 0, set_number: 1, weight_lb: 280, reps: 11, logged_at: ctx.now });
    expect(await tx.get("workout_sessions", W)).toMatchObject({ started_at: ctx.now });
  });

  it("refuses a time more than 5 minutes ahead or 2 days back, and an unknown workout", async () => {
    const tx = await planned();
    await expect(run(tx, "logSet", set({ at: "2026-10-28T17:10:00.000Z" }))).rejects.toThrow("in the future");
    await expect(run(tx, "logSet", set({ at: "2026-10-25T17:00:00.000Z" }))).rejects.toThrow("too long ago");
    await expect(run(tx, "logSet", set({ workout: "nope" }))).rejects.toThrow("isn't saved");
  });

  it("edits and deletes a set", async () => {
    const tx = await planned();
    await run(tx, "logSet", set());
    await run(tx, "editSet", { key: "s-1", weightLb: 290, reps: 10 });
    expect(await tx.get("set_logs", "s-1")).toMatchObject({ weight_lb: 290, reps: 10 });
    await run(tx, "deleteSet", { key: "s-1" });
    expect(await tx.get("set_logs", "s-1")).toBeNull();
  });

  it("refuses a lift list that drops a lift with sets", async () => {
    const tx = await planned();
    await run(tx, "logSet", set());
    await expect(run(tx, "setLifts", { workout: W, lifts: [] })).rejects.toThrow("has sets logged");
  });

  it("checks a lift done without numbers, and undoes it", async () => {
    const tx = await planned();
    await run(tx, "checkLift", { workout: W, exercise: FIRST, done: true });
    expect(await tx.get("exercise_checks", `${W}|${FIRST}`)).toMatchObject({ session_key: W, exercise_id: FIRST });
    await run(tx, "checkLift", { workout: W, exercise: FIRST, done: false });
    expect(await tx.get("exercise_checks", `${W}|${FIRST}`)).toBeNull();
  });

  it("takes a feel only after the finish, and clears it with null", async () => {
    const tx = await planned();
    await expect(run(tx, "rateWorkout", { workout: W, feel: "hard" })).rejects.toThrow("Finish the workout first");
    await run(tx, "finishWorkout", { workout: W, at: ctx.now });
    await run(tx, "rateWorkout", { workout: W, feel: "hard" });
    expect(await tx.get("workout_sessions", W)).toMatchObject({ ended_at: ctx.now, started_at: ctx.now, feel: "hard" });
    await run(tx, "rateWorkout", { workout: W, feel: null });
    expect(await tx.get("workout_sessions", W)).toMatchObject({ feel: null });
  });

  it("saves a note, and deletes it when emptied", async () => {
    const tx = fresh();
    await run(tx, "setNote", { exercise: FIRST, note: "Seat on 4" });
    expect(await tx.get("exercise_notes", FIRST)).toMatchObject({ note: "Seat on 4", updated_at: ctx.now });
    await run(tx, "setNote", { exercise: FIRST, note: "  " });
    expect(await tx.get("exercise_notes", FIRST)).toBeNull();
  });

  it("trades two days' workouts, and refuses a day already logged", async () => {
    const tx = fresh();
    await run(tx, "moveWorkout", { a: "2026-10-28", b: "2026-10-29" });
    expect(await tx.scan("schedule_moves")).toEqual(
      expect.arrayContaining([
        { date: "2026-10-28", template_id: null },
        { date: "2026-10-29", template_id: LEGS },
      ]),
    );
    const logged = await planned();
    await run(logged, "logSet", set());
    await expect(run(logged, "moveWorkout", { a: "2026-10-28", b: "2026-10-30" })).rejects.toThrow("already logged");
  });

  it("saves an always-swap", async () => {
    const tx = fresh();
    await run(tx, "swapAlways", { templateId: LEGS, position: 0, exercise: OTHER });
    expect(await tx.get("exercise_overrides", `${LEGS}|0`)).toEqual({ template_id: LEGS, position: 0, exercise_id: OTHER });
  });
});
```

- [ ] **Step 2: Run them to make sure they fail.**

```bash
npx vitest run --project unit tests/unit/sync/workout-mutators.test.ts
```

Expected: FAIL with "Unknown change: planWorkout".

- [ ] **Step 3: Add the mutators.** In `app/sync/mutators.ts`:

1. Extend the imports:

```ts
import { exercises, meals, plan } from "~/content";
import { swapWorkouts, templateFor } from "~/domain/calendar";
import { addDays, daysBetween, weekStart } from "~/domain/dates";
import { CUSTOM_WORKOUT, SLOTS } from "~/domain/types";
import { keyOf } from "./tables";
```

(Keep `DEFAULT_REMINDERS`. Merge the `~/domain/dates` and `~/domain/types` names into the existing import lines rather than duplicating them.)

2. Above `const defs = {`, add the shared pieces:

```ts
const at = z.iso.datetime();
const workout = z.string().min(1).max(64);
const exerciseId = z.string().refine((id) => exercises.has(id), "That exercise isn't in the library.");
const templateId = z.string().refine((id) => id === CUSTOM_WORKOUT || id in plan.templates, "That workout isn't in the plan.");
const lift = z.object({
  position: z.number().int().min(0).max(199),
  exercise: exerciseId,
  repMin: z.number().int().min(1).max(50),
  repMax: z.number().int().min(1).max(50),
  from: z.enum(["plan", "swap", "added"]),
  replaces: z.string().optional(),
});

const MAX_AHEAD_MS = 5 * 60_000;
const MAX_BEHIND_MS = 2 * 86_400_000;

/** Workout times come from the phone, so an offline workout is dated when it happened. Bounded against our clock. */
function checkTime(time: string, ctx: MutationContext) {
  const diff = Date.parse(time) - Date.parse(ctx.now);
  if (diff > MAX_AHEAD_MS) throw new MutationRejected("That time is in the future.");
  if (diff < -MAX_BEHIND_MS) throw new MutationRejected("That time is too long ago.");
}

async function workoutRow(tx: Tx, key: string) {
  const row = await tx.get("workout_sessions", key);
  if (!row) throw new MutationRejected("That workout isn't saved.");
  return row;
}

/** Days with a workout done: finished, or with a set or a check. */
async function workoutDates(tx: Tx): Promise<Set<string>> {
  const sessions = await tx.scan("workout_sessions");
  const dateOf = new Map(sessions.map((r) => [keyOf("workout_sessions", r), r.date as string]));
  const out = new Set(sessions.filter((r) => r.ended_at).map((r) => r.date as string));
  for (const r of [...(await tx.scan("set_logs")), ...(await tx.scan("exercise_checks"))]) {
    const d = dateOf.get(r.session_key as string);
    if (d) out.add(d);
  }
  return out;
}
```

3. Add these entries inside `defs`, after `setVoice`:

```ts
  planWorkout: {
    args: z.object({ clientId, date, templateId, at }),
    async run(tx: Tx, a: { clientId: string; date: string; templateId: string; at: string }, ctx: MutationContext) {
      notFuture(a.date, ctx);
      checkTime(a.at, ctx);
      const open = (await tx.scan("workout_sessions")).find((r) => r.date === a.date && !r.ended_at);
      if (open?.started_at) {
        if (open.template_id === a.templateId) return;
        throw new MutationRejected("Today's workout has already started.");
      }
      if (open) {
        tx.put("workout_sessions", { ...open, template_id: a.templateId, lifts: open.template_id === a.templateId ? open.lifts : null });
        return;
      }
      tx.put("workout_sessions", {
        client_id: a.clientId,
        date: a.date,
        template_id: a.templateId,
        started_at: null,
        ended_at: null,
        exercises: null,
        planned_at: a.at,
        lifts: null,
        feel: null,
      });
    },
  },
  setLifts: {
    args: z.object({ workout, lifts: z.array(lift).max(30) }),
    async run(tx: Tx, a: { workout: string; lifts: z.infer<typeof lift>[] }) {
      const row = await workoutRow(tx, a.workout);
      if (new Set(a.lifts.map((l) => l.position)).size !== a.lifts.length) throw new MutationRejected("Two lifts share a place.");
      const kept = new Set(a.lifts.map((l) => l.position));
      const keptExercises = new Set(a.lifts.map((l) => l.exercise));
      const sets = (await tx.scan("set_logs")).filter((r) => r.session_key === a.workout);
      const checks = (await tx.scan("exercise_checks")).filter((r) => r.session_key === a.workout);
      if (sets.some((r) => !kept.has(r.position as number)) || checks.some((r) => !keptExercises.has(r.exercise_id as string))) {
        throw new MutationRejected("That lift has sets logged.");
      }
      tx.put("workout_sessions", { ...row, lifts: JSON.stringify(a.lifts) });
    },
  },
  startWorkout: {
    args: z.object({ workout, at }),
    async run(tx: Tx, a: { workout: string; at: string }, ctx: MutationContext) {
      checkTime(a.at, ctx);
      const row = await workoutRow(tx, a.workout);
      if (row.started_at) return;
      tx.put("workout_sessions", { ...row, started_at: a.at });
    },
  },
  logSet: {
    args: z.object({
      clientId,
      workout,
      position: z.number().int().min(0).max(199),
      exercise: exerciseId,
      setNumber: z.number().int().min(1).max(10),
      weightLb: z.number().min(0).max(2000),
      reps: z.number().int().min(0).max(100),
      at,
    }),
    async run(
      tx: Tx,
      a: { clientId: string; workout: string; position: number; exercise: string; setNumber: number; weightLb: number; reps: number; at: string },
      ctx: MutationContext,
    ) {
      checkTime(a.at, ctx);
      const row = await workoutRow(tx, a.workout);
      // Logging is what starts a workout someone forgot to start.
      if (!row.started_at) tx.put("workout_sessions", { ...row, started_at: a.at });
      tx.put("set_logs", {
        client_id: a.clientId,
        // The server has numbered the workout by now; the phone may not have, until its next pull.
        session_id: (row.id as number | undefined) ?? null,
        session_key: a.workout,
        exercise_id: a.exercise,
        position: a.position,
        set_number: a.setNumber,
        weight_lb: round1(a.weightLb),
        reps: a.reps,
        logged_at: a.at,
      });
    },
  },
  editSet: {
    args: z.object({ key, weightLb: z.number().min(0).max(2000), reps: z.number().int().min(0).max(100) }),
    async run(tx: Tx, a: { key: string; weightLb: number; reps: number }) {
      const row = await tx.get("set_logs", a.key);
      if (!row) throw new MutationRejected("That set isn't saved.");
      tx.put("set_logs", { ...row, weight_lb: round1(a.weightLb), reps: a.reps });
    },
  },
  deleteSet: {
    args: z.object({ key }),
    async run(tx: Tx, a: { key: string }) {
      tx.delete("set_logs", a.key);
    },
  },
  checkLift: {
    args: z.object({ workout, exercise: exerciseId, done: z.boolean() }),
    async run(tx: Tx, a: { workout: string; exercise: string; done: boolean }) {
      const row = await workoutRow(tx, a.workout);
      if (!a.done) return tx.delete("exercise_checks", `${a.workout}|${a.exercise}`);
      tx.put("exercise_checks", { session_id: (row.id as number | undefined) ?? null, session_key: a.workout, exercise_id: a.exercise });
    },
  },
  finishWorkout: {
    args: z.object({ workout, at }),
    async run(tx: Tx, a: { workout: string; at: string }, ctx: MutationContext) {
      checkTime(a.at, ctx);
      const row = await workoutRow(tx, a.workout);
      // A workout marked done without being started still counts, as in v1.
      tx.put("workout_sessions", { ...row, started_at: row.started_at ?? a.at, ended_at: a.at });
    },
  },
  rateWorkout: {
    args: z.object({ workout, feel: z.enum(["easy", "right", "hard"]).nullable() }),
    async run(tx: Tx, a: { workout: string; feel: string | null }) {
      const row = await workoutRow(tx, a.workout);
      if (!row.ended_at) throw new MutationRejected("Finish the workout first.");
      tx.put("workout_sessions", { ...row, feel: a.feel });
    },
  },
  setNote: {
    args: z.object({ exercise: exerciseId, note: z.string().max(200) }),
    async run(tx: Tx, a: { exercise: string; note: string }, ctx: MutationContext) {
      const note = a.note.trim();
      if (!note) return tx.delete("exercise_notes", a.exercise);
      tx.put("exercise_notes", { exercise_id: a.exercise, note, updated_at: ctx.now });
    },
  },
  moveWorkout: {
    args: z.object({ a: date, b: date }),
    async run(tx: Tx, a: { a: string; b: string }) {
      if (a.a === a.b || weekStart(a.a) !== weekStart(a.b)) throw new MutationRejected("Pick another day this week.");
      const moves: Record<string, string | null> = Object.fromEntries((await tx.scan("schedule_moves")).map((r) => [r.date as string, (r.template_id as string | null) ?? null]));
      if (templateFor(plan, a.a, moves) === null && templateFor(plan, a.b, moves) === null) throw new MutationRejected("Neither day has a workout.");
      const logged = await workoutDates(tx);
      if (logged.has(a.a) || logged.has(a.b)) throw new MutationRejected("That workout is already logged.");
      for (const d of swapWorkouts(plan, moves, a.a, a.b)) {
        if (d.usual) tx.delete("schedule_moves", d.date);
        else tx.put("schedule_moves", { date: d.date, template_id: d.templateId });
      }
    },
  },
  swapAlways: {
    args: z.object({ templateId: z.string().refine((id) => id in plan.templates, "That workout isn't in the plan."), position: z.number().int().min(0).max(30), exercise: exerciseId }),
    async run(tx: Tx, a: { templateId: string; position: number; exercise: string }) {
      tx.put("exercise_overrides", { template_id: a.templateId, position: a.position, exercise_id: a.exercise });
    },
  },
```

4. Add their labels to `MUTATION_LABELS`:

```ts
  planWorkout: "Workout plan",
  setLifts: "Lift change",
  startWorkout: "Workout start",
  logSet: "Set",
  editSet: "Set change",
  deleteSet: "Set removal",
  checkLift: "Lift check",
  finishWorkout: "Workout finish",
  rateWorkout: "How it felt",
  setNote: "Note",
  moveWorkout: "Workout move",
  swapAlways: "Swap",
```

`daysBetween` and `addDays` are already used by `notFuture` and `logMeal`. If typecheck reports one unused after your merge, remove it.

- [ ] **Step 4: Run the tests again.** Same command. Expected: PASS, 11 tests. Then run the existing mutator tests, which must still pass:

```bash
npx vitest run --project unit tests/unit/sync
```

- [ ] **Step 5: Commit.**

```bash
git add app/sync/mutators.ts tests/unit/sync/workout-mutators.test.ts
git commit -m "Named changes for planning, logging, finishing and rating a workout, notes, moves and swaps"
```

---

### Task 6: The server applies them

**Files:**
- Modify: `app/sync/server-tx.server.ts`
- Test: `tests/workers/sync-push.test.ts`

- [ ] **Step 1: Write the failing tests.** Add to `tests/workers/sync-push.test.ts`. Add `import { plan } from "~/content";` and keep `meals` if it is already imported:

```ts
  it("logs a set against a workout made in the same push, filling in the server's id", async () => {
    const at = now.toISOString();
    const exercise = plan.templates["wed-legs-shoulders"]!.exercises[0].exercise;
    const res = await processPush(
      env.DB,
      {
        clientId: "phone-gym",
        mutations: [
          { id: 1, name: "planWorkout", args: { clientId: "w-push", date: "2026-10-27", templateId: "wed-legs-shoulders", at } },
          { id: 2, name: "logSet", args: { clientId: "s-push", workout: "w-push", position: 0, exercise, setNumber: 1, weightLb: 280, reps: 11, at } },
        ],
      },
      now,
    );
    expect(res.rejected).toEqual([]);
    const w = await env.DB.prepare("SELECT id, started_at, planned_at FROM workout_sessions WHERE client_id = 'w-push'").first<{ id: number; started_at: string; planned_at: string }>();
    expect(w).toMatchObject({ started_at: at, planned_at: at });
    expect(await env.DB.prepare("SELECT session_id, session_key FROM set_logs WHERE client_id = 's-push'").first()).toEqual({ session_id: w!.id, session_key: "w-push" });
  });

  it("edits a v1 set that has no client id", async () => {
    const session = await env.DB.prepare("INSERT INTO workout_sessions (date, template_id, started_at) VALUES ('2026-10-26', 'mon-chest-back-arms', '2026-10-26T17:00:00Z') RETURNING id").first<{ id: number }>();
    const set = await env.DB.prepare("INSERT INTO set_logs (session_id, session_key, exercise_id, position, set_number, weight_lb, reps, logged_at) VALUES (?, ?, 'leg-press', 0, 1, 100, 8, '2026-10-26T17:05:00Z') RETURNING id")
      .bind(session!.id, `id:${session!.id}`)
      .first<{ id: number }>();
    const res = await processPush(env.DB, { clientId: "phone-edit", mutations: [{ id: 1, name: "editSet", args: { key: `id:${set!.id}`, weightLb: 105, reps: 8 } }] }, now);
    expect(res.rejected).toEqual([]);
    expect(await env.DB.prepare("SELECT count(*) AS n, max(weight_lb) AS w FROM set_logs WHERE session_id = ?").bind(session!.id).first()).toEqual({ n: 1, w: 105 });
  });
```

- [ ] **Step 2: Run them to make sure they fail.**

```bash
npx vitest run --project workers tests/workers/sync-push.test.ts
```

Expected: the first test may pass already. The second fails with a rejection ("It clashes with something already saved."), because the upsert targets `client_id` while the row's `id` already exists.

- [ ] **Step 3: Upsert a numbered row by its id.** In `app/sync/server-tx.server.ts`, in `put`, replace the line that builds `updates` and the `sql`:

```ts
    // A row the server already numbered is updated by that number. A v1 row has no client_id to match on.
    const conflict = row.id != null && def.conflict.includes("client_id") ? ["id"] : def.conflict;
    const updates = columns.filter((c) => !conflict.includes(c)).map((c) => `${c} = excluded.${c}`);
    const sql =
      `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})` +
      ` ON CONFLICT (${conflict.join(", ")}) DO ${updates.length ? `UPDATE SET ${updates.join(", ")}` : "NOTHING"}`;
```

- [ ] **Step 4: Run them again.** Same command. Expected: PASS, the earlier push tests included.

- [ ] **Step 5: Commit.**

```bash
git add app/sync/server-tx.server.ts tests/workers/sync-push.test.ts
git commit -m "Apply workout changes on the server, updating v1 rows by their id"
```

---

### Task 7: The v1 workout screen writes the new fields

**Files:**
- Modify: `app/server/workouts.server.ts`
- Test: `tests/workers/workouts.test.ts`

- [ ] **Step 1: Write the failing test.** Add to `tests/workers/workouts.test.ts`, using the file's existing imports and `db()` helper. Import `logSet`, `checkExercise` and `setCustomExercises` from `~/server/workouts.server` if not already, and `env` from `cloudflare:test`:

```ts
  it("keys v1 sets and checks to their workout, and keeps a custom list in lifts", async () => {
    const now = new Date("2026-10-28T17:00:00Z");
    await logSet(db(), { date: "2026-10-28", templateId: "wed-legs-shoulders", position: 0, exerciseId: "leg-press", setNumber: 1, weightLb: 270, reps: 12, clientId: "v1-set" }, now);
    await checkExercise(db(), "2026-10-28", "wed-legs-shoulders", "leg-curl", true, now);
    const session = await env.DB.prepare("SELECT id FROM workout_sessions WHERE template_id = 'wed-legs-shoulders' AND date = '2026-10-28'").first<{ id: number }>();
    expect(await env.DB.prepare("SELECT session_key FROM set_logs WHERE client_id = 'v1-set'").first()).toEqual({ session_key: `id:${session!.id}` });
    expect(await env.DB.prepare("SELECT session_key FROM exercise_checks WHERE exercise_id = 'leg-curl'").first()).toEqual({ session_key: `id:${session!.id}` });

    await setCustomExercises(db(), "2026-10-28", ["leg-press", "leg-curl"], now);
    const custom = await env.DB.prepare("SELECT lifts FROM workout_sessions WHERE template_id = 'custom'").first<{ lifts: string }>();
    expect(JSON.parse(custom!.lifts).map((l: { exercise: string; position: number }) => [l.position, l.exercise])).toEqual([[0, "leg-press"], [1, "leg-curl"]]);
  });
```

If `leg-press` or `leg-curl` is not an exercise id in `content/exercises.json`, use two that are.

- [ ] **Step 2: Run it to make sure it fails.**

```bash
npx vitest run --project workers tests/workers/workouts.test.ts
```

Expected: FAIL, with `session_key` equal to `""`.

- [ ] **Step 3: Write the fields.** In `app/server/workouts.server.ts`:

1. Add a helper under `findSession`:

```ts
/** The sync key a workout's sets and checks point at. */
const sessionKey = (s: Session) => s.clientId ?? `id:${s.id}`;
```

2. In `logSet`'s insert values, add `sessionKey: sessionKey(session),`.
3. In `checkExercise`, change the insert to `.values({ sessionId: session.id, sessionKey: sessionKey(session), exerciseId })`.
4. In `setCustomExercises`, replace the final update with:

```ts
  const list = [...new Set(next)];
  // W2 reads lifts. exercises stays for the v1 screen until W2 replaces it.
  const lifts = list.map((exercise, position) => ({ position, exercise, repMin: 8, repMax: 12, from: "added" as const }));
  await db.update(workoutSessions).set({ exercises: JSON.stringify(list), lifts: JSON.stringify(lifts) }).where(eq(workoutSessions.id, session.id));
```

- [ ] **Step 4: Run the workout tests.**

```bash
npx vitest run --project workers tests/workers/workouts.test.ts tests/workers/custom-workout.test.ts tests/workers/workout-route.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add app/server/workouts.server.ts tests/workers/workouts.test.ts
git commit -m "Keep the v1 workout screen writing the new keys and lift lists"
```

---

### Task 8: The rest clock

**Files:**
- Create: `app/rest/clock.ts`
- Test: `tests/unit/rest/clock.test.ts`

The logic is a plain class over a small storage interface, so it is unit-tested without a Durable Object.

- [ ] **Step 1: Write the failing test.** Create `tests/unit/rest/clock.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { RestClock, type AlarmStorage, type RestPing } from "~/rest/clock";

function memoryStorage(): AlarmStorage & { alarm: number | null; data: Map<string, unknown> } {
  const s = {
    alarm: null as number | null,
    data: new Map<string, unknown>(),
    async get<T>(k: string) {
      return s.data.get(k) as T | undefined;
    },
    async put(k: string, v: unknown) {
      s.data.set(k, v);
    },
    async delete(k: string) {
      return s.data.delete(k);
    },
    async setAlarm(t: number) {
      s.alarm = t;
    },
    async deleteAlarm() {
      s.alarm = null;
    },
  };
  return s;
}

const ping: RestPing = { binding: "DB", title: "Rest's up", body: "Set 2 of leg press" };

describe("RestClock", () => {
  it("schedules one ping, and a second schedule replaces it", async () => {
    const storage = memoryStorage();
    const clock = new RestClock(storage, () => 1_000_000, vi.fn());
    await clock.schedule(ping, 150);
    await clock.schedule({ ...ping, body: "Set 3 of leg press" }, 90);
    expect(storage.alarm).toBe(1_090_000);
    expect(storage.data.get("ping")).toEqual({ ...ping, body: "Set 3 of leg press" });
  });

  it("cancels", async () => {
    const storage = memoryStorage();
    const clock = new RestClock(storage, () => 0, vi.fn());
    await clock.schedule(ping, 60);
    await clock.cancel();
    expect(storage.alarm).toBeNull();
    expect(storage.data.has("ping")).toBe(false);
  });

  it("sends the ping once when the alarm fires, and nothing after a cancel", async () => {
    const storage = memoryStorage();
    const send = vi.fn(async () => 1);
    const clock = new RestClock(storage, () => 0, send);
    await clock.schedule(ping, 60);
    await clock.fire();
    await clock.fire();
    expect(send).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledWith(ping);
    await clock.schedule(ping, 60);
    await clock.cancel();
    await clock.fire();
    expect(send).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run it to make sure it fails.**

```bash
npx vitest run --project unit tests/unit/rest/clock.test.ts
```

Expected: FAIL with "Failed to resolve import "~/rest/clock"".

- [ ] **Step 3: Write `app/rest/clock.ts`:**

```ts
/** The parts of Durable Object storage the rest clock uses. */
export interface AlarmStorage {
  get<T>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<boolean>;
  setAlarm(scheduledTime: number): Promise<void>;
  deleteAlarm(): Promise<void>;
}

export interface RestPing {
  /** The person's D1 binding, so the ping goes to their push subscriptions. */
  binding: string;
  title: string;
  body: string;
}

/** One person's rest ping: at most one pending, and the latest schedule wins. */
export class RestClock {
  constructor(
    private readonly storage: AlarmStorage,
    private readonly now: () => number,
    private readonly send: (ping: RestPing) => Promise<unknown>,
  ) {}

  async schedule(ping: RestPing, seconds: number): Promise<void> {
    await this.storage.put("ping", ping);
    await this.storage.setAlarm(this.now() + seconds * 1000);
  }

  async cancel(): Promise<void> {
    await this.storage.deleteAlarm();
    await this.storage.delete("ping");
  }

  /** Runs on the alarm. The ping is removed before sending, so a retried alarm never pings twice. */
  async fire(): Promise<void> {
    const ping = await this.storage.get<RestPing>("ping");
    if (!ping) return;
    await this.storage.delete("ping");
    await this.send(ping);
  }
}
```

- [ ] **Step 4: Run the test again.** Same command. Expected: PASS, 3 tests.

- [ ] **Step 5: Commit.**

```bash
git add app/rest/clock.ts tests/unit/rest/clock.test.ts
git commit -m "A rest clock that keeps one pending ping and sends it once"
```

---

### Task 9: The RestTimer Durable Object

**Files:**
- Create: `app/server/rest-timer.server.ts`, `tests/workers/test-worker.ts`
- Modify: `workers/app.ts`, `wrangler.jsonc`, `vitest.config.ts`, `worker-configuration.d.ts` (regenerated)
- Test: `tests/workers/rest-timer.test.ts`

- [ ] **Step 1: Write the Durable Object.** Create `app/server/rest-timer.server.ts`:

```ts
import { DurableObject } from "cloudflare:workers";
import { getDb } from "~/db/client";
import { RestClock, type RestPing } from "~/rest/clock";
import { sendToAll } from "./push.server";
import type { PersonBinding } from "./users.server";

/** One per person (named by their D1 binding). Holds the next rest ping and sends it at the right second. */
export class RestTimer extends DurableObject<Env> {
  private readonly clock = new RestClock(this.ctx.storage, Date.now, (p) =>
    sendToAll(getDb(this.env[p.binding as PersonBinding]), { title: p.title, body: p.body, url: "/workout", tag: "rest" }),
  );

  schedule(ping: RestPing, seconds: number): Promise<void> {
    return this.clock.schedule(ping, seconds);
  }

  cancel(): Promise<void> {
    return this.clock.cancel();
  }

  async alarm(): Promise<void> {
    await this.clock.fire();
  }
}
```

- [ ] **Step 2: Export it from the Worker.** In `workers/app.ts`, add under the imports:

```ts
export { RestTimer } from "../app/server/rest-timer.server";
```

- [ ] **Step 3: Bind it.** In `wrangler.jsonc`, after `r2_buckets`, add:

```jsonc
	// One rest timer per person, so a locked phone still gets pinged when a rest ends.
	"durable_objects": { "bindings": [{ "name": "REST_TIMER", "class_name": "RestTimer" }] },
	"migrations": [{ "tag": "v1", "new_sqlite_classes": ["RestTimer"] }],
```

Then regenerate the types:

```bash
npm run cf-typegen
```

Expected: `Env` gains `REST_TIMER: DurableObjectNamespace<...RestTimer>`.

- [ ] **Step 4: Give the Worker tests an entry that exports the class.** Create `tests/workers/test-worker.ts`:

```ts
// The test Worker's main module. The app's real entry imports React Router's build, which tests cannot load, and the
// plugin needs every Durable Object class exported from main.
export { RestTimer } from "../../app/server/rest-timer.server";

export default {
  async fetch() {
    return new Response("test worker");
  },
} satisfies ExportedHandler<Env>;
```

In `vitest.config.ts`, in the workers `cloudflareTest({ ... })` options, add `main: "./tests/workers/test-worker.ts",` next to `wrangler`.

- [ ] **Step 5: Write the test.** Create `tests/workers/rest-timer.test.ts`:

```ts
import { env, runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";

const timer = () => env.REST_TIMER.get(env.REST_TIMER.idFromName("DB"));
const ping = { binding: "DB", title: "Rest's up", body: "Set 2 of leg press" };

describe("RestTimer", () => {
  it("holds one alarm that the latest schedule sets, and cancel clears", async () => {
    const stub = timer();
    await stub.schedule(ping, 150);
    await stub.schedule(ping, 90);
    const alarm = await runInDurableObject(stub, (_o, state) => state.storage.getAlarm());
    expect(alarm).toBeGreaterThan(Date.now() + 80_000);
    expect(alarm).toBeLessThan(Date.now() + 100_000);
    await stub.cancel();
    expect(await runInDurableObject(stub, (_o, state) => state.storage.getAlarm())).toBeNull();
  });

  it("sends and forgets the ping when the alarm runs", async () => {
    const stub = timer();
    await stub.schedule(ping, 1);
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    expect(await runInDurableObject(stub, (_o, state) => state.storage.get("ping"))).toBeUndefined();
  });
});
```

There are no push subscriptions in the test database, so sending reaches nobody. The unit test covers that it sends exactly once.

- [ ] **Step 6: Run it, and one existing Worker test file to be sure the new entry did not break the rest.**

```bash
npx vitest run --project workers tests/workers/rest-timer.test.ts tests/workers/sync-push.test.ts
```

Expected: PASS. If the plugin rejects `main`, say so in the report and keep the class export: its option schema (`node_modules/@cloudflare/vitest-plugin/dist/pool/index.d.mts`) lists `main` at the top level.

- [ ] **Step 7: Commit.**

```bash
git add app/server/rest-timer.server.ts workers/app.ts wrangler.jsonc worker-configuration.d.ts vitest.config.ts tests/workers/test-worker.ts tests/workers/rest-timer.test.ts
git commit -m "A per-person rest timer that pings a locked phone"
```

(If `cf-typegen` writes the types to another file name, add that file instead.)

---

### Task 10: `/api/rest`

**Files:**
- Create: `app/routes/api.rest.ts`
- Modify: `app/routes.ts`
- Test: `tests/workers/api-rest.test.ts`

- [ ] **Step 1: Write the failing test.** Create `tests/workers/api-rest.test.ts`:

```ts
import { env, runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { action } from "~/routes/api.rest";
import { routeArgs } from "./helpers";

const kameronTimer = () => env.REST_TIMER.get(env.REST_TIMER.idFromName("DB"));
const call = (method: string, body?: unknown) =>
  action(routeArgs(new Request("http://localhost/api/rest", { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) })));

describe("/api/rest", () => {
  it("schedules the signed-in person's ping, and DELETE cancels it", async () => {
    const res = await call("POST", { seconds: 150, title: "Rest's up", body: "Set 2 of leg press" });
    expect(res.status).toBe(204);
    expect(await runInDurableObject(kameronTimer(), (_o, state) => state.storage.getAlarm())).not.toBeNull();
    expect((await call("DELETE")).status).toBe(204);
    expect(await runInDurableObject(kameronTimer(), (_o, state) => state.storage.getAlarm())).toBeNull();
  });

  it("refuses a bad body", async () => {
    expect((await call("POST", { seconds: 0, title: "", body: "" })).status).toBe(400);
    expect((await call("POST", { seconds: 5000, title: "x", body: "" })).status).toBe(400);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails.**

```bash
npx vitest run --project workers tests/workers/api-rest.test.ts
```

Expected: FAIL, because the route module does not exist.

- [ ] **Step 3: Write `app/routes/api.rest.ts`:**

```ts
import { env } from "cloudflare:workers";
import { z } from "zod";
import type { Route } from "./+types/api.rest";
import { currentUser } from "~/server/current-user.server";

const Ping = z.object({ seconds: z.number().int().min(1).max(600), title: z.string().min(1).max(80), body: z.string().max(160) });

function timer() {
  return env.REST_TIMER.get(env.REST_TIMER.idFromName(currentUser().dbBinding));
}

export async function loader() {
  return new Response("Method not allowed", { status: 405 });
}

/** POST schedules the rest ping (replacing any earlier one); DELETE cancels it. */
export async function action({ request }: Route.ActionArgs) {
  if (request.method === "DELETE") {
    await timer().cancel();
    return new Response(null, { status: 204 });
  }
  const parsed = Ping.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return new Response(null, { status: 400 });
  const { seconds, title, body } = parsed.data;
  await timer().schedule({ binding: currentUser().dbBinding, title, body }, seconds);
  return new Response(null, { status: 204 });
}
```

In `app/routes.ts`, add `route("api/rest", "routes/api.rest.ts"),` after the `api/vitals` route.

- [ ] **Step 4: Run it again.** Same command. Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add app/routes/api.rest.ts app/routes.ts tests/workers/api-rest.test.ts
git commit -m "POST and DELETE /api/rest for the rest ping"
```

---

### Task 11: Full suite, PR, migrations, and the wire

- [ ] **Step 1: Run the whole suite once.**

```bash
npm run typecheck && npm test
```

Expected: all green. Fix only the failing files, then re-run those files only.

- [ ] **Step 2: Check the local app still works.** With `npm run dev`, sign in (temporary password, as in earlier plans; put the hash back after). Then:
1. Open today's workout on the v1 screen and log one set.
2. Settings still says "Sync: up to date", and a second visit to Today shows the set ("Resume").
3. Delete the set again.

Apply the local migrations first:

```bash
npx wrangler d1 migrations apply rocky-db --local && npx wrangler d1 migrations apply rocky-db-catherine --local
```

- [ ] **Step 3: Push and open the PR. Do not merge.**

```bash
git push -u origin v2/w1-workout-data
gh pr create --title "Rocky v2 W1: workout data, named changes, rest timer" --body "<what changed, the calls at the top of this plan, the deviations>"
```

- [ ] **Step 4: Production migrations (Kameron runs these). Print this block and wait.** They must run before the merge, because the new code reads the new columns. The old code keeps working against the new schema: it writes `started_at` and ignores the new columns.

```bash
npx wrangler d1 migrations apply rocky-db --remote
npx wrangler d1 migrations apply rocky-db-catherine --remote
npx wrangler d1 migrations list rocky-db --remote
```

Expected: the last command says "No migrations to apply!". The Durable Object's own migration (`v1` in `wrangler.jsonc`) runs on deploy; no command is needed.

- [ ] **Step 5: Report back and wait.** After Kameron merges, confirm the Workers Builds check on the merge commit is green:

```bash
gh api repos/kameronpduhon/rocky-the-coach/commits/$(git rev-parse origin/main)/check-runs --jq '.check_runs[] | "\(.name) \(.status) \(.conclusion)"'
```

- [ ] **Step 6: Verify on the wire.** Kameron does these and reports:
1. On the iPhone, open the app. Today and the workout screen look and work as before. The first open takes a full snapshot, so it may take a second longer once.
2. Log a set on the v1 workout screen. It lands with its key:

    ```bash
    npx wrangler d1 execute rocky-db --remote --command "select session_id, session_key from set_logs order by id desc limit 1"
    ```

    Expected: `session_key` is `id:<session_id>`.
3. With notifications on for the iPhone, open kampduh.com signed in on a laptop and run this in the browser console, then lock the phone. A "Rest's up" notification arrives about 20 seconds later.

    ```js
    fetch("/api/rest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ seconds: 20, title: "Rest's up", body: "Test ping from W1" }) })
    ```
