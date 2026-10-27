# F2: Data Layer Implementation Plan

> **For agentic workers:** implement this plan task-by-task with the `executing-plans` skill. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every person's data has an on-phone copy that updates in the same frame as a tap and syncs with their D1 database in the background, including offline. Screens move onto it in F4, so this plan changes nothing on screen except one sync status line in Settings.

**Architecture:**
- **Changes log.** SQLite triggers on the 18 synced tables append to a `changes` log in each person database, so every write is recorded, v1 server actions and cron included.
- **Named changes.** Writes from new screens are named mutators in one shared module. The phone runs them against an in-memory store, persisted to IndexedDB. The server runs the same functions against D1 in an atomic `batch()`.
- **Sync loop.** The phone pushes its queue to `/api/sync/push` and pulls "everything since version N" from `/api/sync/pull`. It then rebases the changes still waiting on top of what came back.

**Tech Stack:** React Router 8.4, Cloudflare Workers + D1, Zod 4, IndexedDB (no library), `web-vitals` 6.2.3, Vitest 4.

**Spec:** `docs/superpowers/specs/2026-10-27-foundation-design.md`, section 2 and rollout step 2. **Branch:** `v2/f2-data-layer` (already created from `main` after F1 merged).

**Deviations from the spec, approved in chat:**
- The endpoints are `/api/sync/push` and `/api/sync/pull`, because `/api/push` sits too close to the existing `/api/push/subscribe`.
- Settings gets one diagnostic line ("Sync: up to date"), so the data layer can be checked on a phone before F4 uses it.

---

## Ground rules

- Everything from F1's ground rules applies:
    - `cloudflare:workers` env.
    - Workers tests are clean per file.
    - No em dashes.
    - No `Co-Authored-By`.
    - `npm run dev` for looking.
    - One full suite at the end.
- `app/sync/tables.ts`, `app/sync/tx.ts`, `app/sync/mutators.ts`, `app/sync/store.ts` must not import `cloudflare:workers` or anything `*.server.ts`. They run in the browser, in Node unit tests and in the Worker.
- Rows in the sync layer are raw D1 rows, with snake_case column names and booleans as `0`/`1`, on both sides. Never mix in Drizzle's camelCase shapes.

## Key formats

A row's key is a string, computed the same way in SQL (in triggers and pull) and in JS (in the store). `app/sync/tables.ts` is the single source.

| Table | Key | Upsert conflict columns |
|---|---|---|
| `meal_state` | `slug` | `slug` |
| `planned_meals` | `date|slot` | `date, slot` |
| `meal_logs` | `client_id`, else `id:<id>` | `client_id` |
| `batches` | `id:<id>` | `id` |
| `workout_sessions` | `id:<id>` | `id` |
| `exercise_checks` | `session_id|exercise_id` | `session_id, exercise_id` |
| `set_logs` | `client_id`, else `id:<id>` | `client_id` |
| `exercise_overrides` | `template_id|position` | `template_id, position` |
| `exercise_swaps` | `date|template_id|position` | `date, template_id, position` |
| `schedule_moves` | `date` | `date` |
| `weigh_ins` | `date` | `date` |
| `waist_logs` | `date` | `date` |
| `steps_daily` | `date` | `date` |
| `targets` | `effective_from` | `effective_from` |
| `check_ins` | `week_start` | `week_start` |
| `reminder_settings` | `kind` | `kind` |
| `grocery_checks` | `week_start|food_id` | `week_start, food_id` |
| `profile` | `id` | `id` |

`push_subscriptions`, `notifications_sent`, `login_attempts`, `changes`, `sync_clients` and `vitals` are not synced.

## File map

| Path | Change | Responsibility |
|---|---|---|
| `app/db/schema.ts` | Modify | Add `changes`, `sync_clients`, `profile`, `vitals` |
| `drizzle/0004_*.sql`, `drizzle/0005_sync_triggers.sql` | Create | Tables, then triggers |
| `scripts/gen-sync-triggers.ts` | Create | Writes the trigger SQL from the table registry |
| `app/sync/tables.ts` | Create | Synced tables, key SQL and JS, upsert targets |
| `app/sync/tx.ts` | Create | `Tx` interface and `MemoryTx` |
| `app/sync/mutators.ts` | Create | The named changes and their Zod args |
| `app/sync/server-tx.server.ts` | Create | `Tx` over D1 that buffers writes |
| `app/sync/push.server.ts`, `pull.server.ts` | Create | Push and pull |
| `app/routes/api.sync.push.ts`, `api.sync.pull.ts`, `api.vitals.ts` | Create | Endpoints |
| `app/sync/store.ts` | Create | Client store: base, pending queue, rebase |
| `app/sync/idb.ts` | Create | IndexedDB persistence |
| `app/sync/client.ts` | Create | Sync loop: push, pull, backoff, triggers |
| `app/sync/react.tsx` | Create | Provider, `useSyncClient`, `useTable`, `useSyncStatus` |
| `app/server/current-user.server.ts` | Modify | `userD1()` |
| `app/routes/app-layout.tsx`, `app/routes.ts` | Modify | Mount sync and vitals; register routes |
| `app/routes/settings.tsx` | Modify | Sync status line |
| `app/jobs/scheduled.ts` | Modify | Prune `changes` older than 30 days |

---

### Task 1: Tables and the table registry

**Files:**
- Modify: `app/db/schema.ts`
- Create: `app/sync/tables.ts`, `drizzle/0004_*.sql`
- Test: `tests/unit/sync/tables.test.ts`

- [ ] **Step 1: Add the tables.** Append to `app/db/schema.ts`:

```ts
/** Every write to a synced table, appended by triggers (drizzle/0005_sync_triggers.sql). Pull reads it. */
export const changes = sqliteTable("changes", {
  version: integer("version").primaryKey({ autoIncrement: true }),
  tableName: text("table_name").notNull(),
  rowKey: text("row_key").notNull(),
  op: text("op").notNull(),
  at: text("at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
});

/** One row per installed app: the last mutation the server applied from it. */
export const syncClients = sqliteTable("sync_clients", {
  clientId: text("client_id").primaryKey(),
  lastMutationId: integer("last_mutation_id").notNull(),
});

/** Personal settings that sync. One row, id "me". */
export const profile = sqliteTable("profile", {
  id: text("id").primaryKey(),
  voice: text("voice").notNull().default("corner"),
});

/** Real tap latency (INP) reported from phones. */
export const vitals = sqliteTable("vitals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  route: text("route").notNull(),
  inpMs: integer("inp_ms").notNull(),
  target: text("target"),
  at: text("at").notNull(),
});
```

Add `sql` to the existing `drizzle-orm` imports at the top of the file: `import { sql } from "drizzle-orm";`.

- [ ] **Step 2: Generate the migration.**

Run: `npm run db:generate`

Expected: `drizzle/0004_<name>.sql` creating the four tables.

- [ ] **Step 3: Write the failing test.** Create `tests/unit/sync/tables.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { SYNCED, keyOf, tableDef } from "~/sync/tables";

describe("sync tables", () => {
  it("keys rows the same way the SQL does", () => {
    expect(keyOf("weigh_ins", { date: "2026-10-27", weight_lb: 205 })).toBe("2026-10-27");
    expect(keyOf("planned_meals", { date: "2026-10-27", slot: "lunch" })).toBe("2026-10-27|lunch");
    expect(keyOf("meal_logs", { id: 7, client_id: null })).toBe("id:7");
    expect(keyOf("meal_logs", { id: 7, client_id: "c-1" })).toBe("c-1");
    expect(keyOf("exercise_swaps", { date: "2026-10-28", template_id: "wed", position: 2 })).toBe("2026-10-28|wed|2");
  });

  it("builds key SQL for triggers and lookups", () => {
    expect(tableDef("meal_logs").keySql("NEW.")).toBe("COALESCE(NEW.client_id, 'id:' || NEW.id)");
    expect(tableDef("grocery_checks").keySql("")).toBe("week_start || '|' || food_id");
  });

  it("syncs the 18 personal tables and nothing server-only", () => {
    expect(SYNCED).toHaveLength(18);
    for (const t of ["push_subscriptions", "notifications_sent", "login_attempts", "changes", "sync_clients", "vitals"]) {
      expect(SYNCED.map((d) => d.name)).not.toContain(t);
    }
  });
});
```

- [ ] **Step 4: Run it to make sure it fails.**

Run: `npx vitest run --project unit tests/unit/sync/tables.test.ts`

Expected: FAIL, module not found.

- [ ] **Step 5: Implement.** Create `app/sync/tables.ts`:

```ts
// Which tables sync, and how a row's key is built. Triggers, pull and the client store must agree on keys,
// so this file is the only place they are defined. No Worker imports: the browser loads it too.

export type Row = Record<string, unknown>;

export interface TableDef {
  name: string;
  /** SQL for the row key. `p` is a column prefix such as "NEW." or "". */
  keySql: (p: string) => string;
  key: (r: Row) => string;
  /** Columns for INSERT ... ON CONFLICT when a mutator writes this table. */
  conflict: string[];
}

const cols = (...names: string[]): Pick<TableDef, "keySql" | "key" | "conflict"> => ({
  keySql: (p) => names.map((n) => `${p}${n}`).join(" || '|' || "),
  key: (r) => names.map((n) => String(r[n])).join("|"),
  conflict: names,
});

const byId: Pick<TableDef, "keySql" | "key" | "conflict"> = {
  keySql: (p) => `'id:' || ${p}id`,
  key: (r) => `id:${r.id}`,
  conflict: ["id"],
};

// Rows a phone creates carry a client_id before the server gives them an id, so that is their identity.
const byClientId: Pick<TableDef, "keySql" | "key" | "conflict"> = {
  keySql: (p) => `COALESCE(${p}client_id, 'id:' || ${p}id)`,
  key: (r) => (r.client_id as string | null) ?? `id:${r.id}`,
  conflict: ["client_id"],
};

export const SYNCED: TableDef[] = [
  { name: "meal_state", ...cols("slug") },
  { name: "planned_meals", ...cols("date", "slot") },
  { name: "meal_logs", ...byClientId },
  { name: "batches", ...byId },
  { name: "workout_sessions", ...byId },
  { name: "exercise_checks", ...cols("session_id", "exercise_id") },
  { name: "set_logs", ...byClientId },
  { name: "exercise_overrides", ...cols("template_id", "position") },
  { name: "exercise_swaps", ...cols("date", "template_id", "position") },
  { name: "schedule_moves", ...cols("date") },
  { name: "weigh_ins", ...cols("date") },
  { name: "waist_logs", ...cols("date") },
  { name: "steps_daily", ...cols("date") },
  { name: "targets", ...cols("effective_from") },
  { name: "check_ins", ...cols("week_start") },
  { name: "reminder_settings", ...cols("kind") },
  { name: "grocery_checks", ...cols("week_start", "food_id") },
  { name: "profile", ...cols("id") },
];

const BY_NAME = new Map(SYNCED.map((d) => [d.name, d]));

export function tableDef(name: string): TableDef {
  const def = BY_NAME.get(name);
  if (!def) throw new Error(`Not a synced table: ${name}`);
  return def;
}

export function keyOf(table: string, row: Row): string {
  return tableDef(table).key(row);
}
```

- [ ] **Step 6: Run the test.**

Run: `npx vitest run --project unit tests/unit/sync/tables.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit.**

```bash
git add app/db/schema.ts drizzle app/sync/tables.ts tests/unit/sync/tables.test.ts
git commit -m "Add the changes log, sync clients, profile and vitals tables and the sync table registry"
```

---

### Task 2: Triggers write the changes log

**Files:**
- Create: `scripts/gen-sync-triggers.ts`, `drizzle/0005_sync_triggers.sql`
- Test: `tests/workers/sync-triggers.test.ts`

- [ ] **Step 1: Write the generator.** Create `scripts/gen-sync-triggers.ts`:

```ts
// Prints the trigger migration for every synced table. Run it after changing app/sync/tables.ts:
//   npx tsx scripts/gen-sync-triggers.ts > drizzle/<n>_sync_triggers.sql
import { SYNCED } from "../app/sync/tables";

const out: string[] = [];
for (const { name, keySql } of SYNCED) {
  const neu = keySql("NEW.");
  const old = keySql("OLD.");
  out.push(
    `CREATE TRIGGER sync_${name}_ins AFTER INSERT ON ${name} BEGIN INSERT INTO changes (table_name, row_key, op) VALUES ('${name}', ${neu}, 'put'); END;`,
    // A key can change in an update (rare); the old key is then gone from the client's point of view.
    `CREATE TRIGGER sync_${name}_upd AFTER UPDATE ON ${name} BEGIN INSERT INTO changes (table_name, row_key, op) SELECT '${name}', ${old}, 'del' WHERE ${old} IS NOT ${neu}; INSERT INTO changes (table_name, row_key, op) VALUES ('${name}', ${neu}, 'put'); END;`,
    `CREATE TRIGGER sync_${name}_del AFTER DELETE ON ${name} BEGIN INSERT INTO changes (table_name, row_key, op) VALUES ('${name}', ${old}, 'del'); END;`,
  );
}
console.log(out.join("\n--> statement-breakpoint\n"));
```

- [ ] **Step 2: Generate the migration.**

```bash
npx drizzle-kit generate --custom --name sync_triggers
npx tsx scripts/gen-sync-triggers.ts > drizzle/0005_sync_triggers.sql
```

Expected: 54 `CREATE TRIGGER` statements separated by `--> statement-breakpoint`. Check the file name drizzle-kit created matches `0005_sync_triggers.sql`. If it numbered it differently, write to that name instead.

- [ ] **Step 3: Write the test.** Create `tests/workers/sync-triggers.test.ts`:

```ts
import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { logWeighIn, deleteWeighIn } from "~/server/body.server";
import { logOffPlan } from "~/server/meals.server";
import { db } from "./helpers";

const changes = async () =>
  (await env.DB.prepare("select table_name, row_key, op from changes order by version").all()).results;

describe("sync triggers", () => {
  it("logs puts and deletes made by v1 server code", async () => {
    await logWeighIn(db(), "2026-10-27", 205.1, new Date());
    await logWeighIn(db(), "2026-10-27", 204.9, new Date());
    await deleteWeighIn(db(), "2026-10-27");
    expect(await changes()).toEqual([
      { table_name: "weigh_ins", row_key: "2026-10-27", op: "put" },
      { table_name: "weigh_ins", row_key: "2026-10-27", op: "put" },
      { table_name: "weigh_ins", row_key: "2026-10-27", op: "del" },
    ]);
  });

  it("keys rows without a client id by their id", async () => {
    await logOffPlan(db(), "2026-10-27", { name: "Ranch Water", category: "drink", kcal: 100, proteinG: 0, relaxed: false }, new Date());
    const last = (await changes()).at(-1) as { row_key: string };
    expect(last.row_key).toMatch(/^id:\d+$/);
  });

  it("does not log tables that do not sync", async () => {
    const before = (await changes()).length;
    await env.DB.prepare("insert into notifications_sent (kind, date) values ('weigh-in', '2026-10-27')").run();
    expect((await changes()).length).toBe(before);
  });
});
```

- [ ] **Step 4: Run it.**

Run: `npx vitest run --project workers tests/workers/sync-triggers.test.ts`

Expected: PASS. If the migration fails to apply, open `drizzle/0005_sync_triggers.sql` and confirm each trigger is a single statement between breakpoints.

- [ ] **Step 5: Commit.**

```bash
git add scripts/gen-sync-triggers.ts drizzle tests/workers/sync-triggers.test.ts
git commit -m "Log every write to a synced table with triggers"
```

---

### Task 3: The `Tx` interface and the named changes

**Files:**
- Create: `app/sync/tx.ts`, `app/sync/mutators.ts`
- Test: `tests/unit/sync/mutators.test.ts`

- [ ] **Step 1: Write the failing test.** Create `tests/unit/sync/mutators.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { MemoryTx } from "~/sync/tx";
import { MutationRejected, runMutation, type MutationContext } from "~/sync/mutators";

const ctx: MutationContext = { now: "2026-10-27T16:00:00.000Z", today: "2026-10-27" };
const fresh = () => new MemoryTx(new Map());

describe("mutators", () => {
  it("logs, edits and deletes a weigh-in", async () => {
    const tx = fresh();
    await runMutation(tx, "logWeighIn", { date: "2026-10-27", weightLb: 205.14 }, ctx);
    expect(await tx.get("weigh_ins", "2026-10-27")).toEqual({ date: "2026-10-27", weight_lb: 205.1, logged_at: ctx.now });
    await runMutation(tx, "editWeighIn", { date: "2026-10-27", weightLb: 204.8 }, { ...ctx, now: "2026-10-27T18:00:00.000Z" });
    expect(await tx.get("weigh_ins", "2026-10-27")).toMatchObject({ weight_lb: 204.8, logged_at: ctx.now });
    await runMutation(tx, "deleteWeighIn", { date: "2026-10-27" }, ctx);
    expect(await tx.get("weigh_ins", "2026-10-27")).toBeNull();
  });

  it("logs a planned meal once, with its macros, and uses a batch portion", async () => {
    const tx = fresh();
    tx.put("batches", { id: 3, meal_slug: "chicken-and-rice-bowl", portions: 3, cooked_weight_g: 495, portion_g: 165, created_on: "2026-10-26", portions_left: 2 });
    await runMutation(tx, "logMeal", { clientId: "c-1", date: "2026-10-27", slot: "lunch", mealSlug: "chicken-and-rice-bowl" }, ctx);
    await runMutation(tx, "logMeal", { clientId: "c-2", date: "2026-10-27", slot: "lunch", mealSlug: "chicken-and-rice-bowl" }, ctx);
    const logs = await tx.scan("meal_logs");
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ client_id: "c-1", slot: "lunch", category: "planned", name: "Chicken and rice bowl" });
    expect(logs[0].kcal).toBeGreaterThan(0);
    expect(await tx.get("batches", "id:3")).toMatchObject({ portions_left: 1 });
  });

  it("logs and removes an off-plan item", async () => {
    const tx = fresh();
    await runMutation(tx, "logOffPlan", { clientId: "c-9", date: "2026-10-27", name: "Ranch Water", category: "drink", kcal: 100, proteinG: 0, relaxed: false }, ctx);
    expect(await tx.get("meal_logs", "c-9")).toMatchObject({ name: "Ranch Water", slot: null, relaxed: 0 });
    await runMutation(tx, "deleteOffPlan", { key: "c-9" }, ctx);
    expect(await tx.get("meal_logs", "c-9")).toBeNull();
  });

  it("saves a reminder and the voice", async () => {
    const tx = fresh();
    await runMutation(tx, "setReminder", { kind: "weigh-in", enabled: false, time: "07:15" }, ctx);
    expect(await tx.get("reminder_settings", "weigh-in")).toEqual({ kind: "weigh-in", enabled: 0, time: "07:15" });
    await runMutation(tx, "setVoice", { voice: "plain" }, ctx);
    expect(await tx.get("profile", "me")).toEqual({ id: "me", voice: "plain" });
  });

  it("rejects bad args, unknown names, unknown meals and far-future dates", async () => {
    const tx = fresh();
    await expect(runMutation(tx, "logWeighIn", { date: "2026-10-27", weightLb: 20 }, ctx)).rejects.toBeInstanceOf(MutationRejected);
    await expect(runMutation(tx, "nope", {}, ctx)).rejects.toBeInstanceOf(MutationRejected);
    await expect(runMutation(tx, "logMeal", { clientId: "c", date: "2026-10-27", slot: "lunch", mealSlug: "pizza" }, ctx)).rejects.toBeInstanceOf(MutationRejected);
    await expect(runMutation(tx, "logWeighIn", { date: "2026-11-05", weightLb: 200 }, ctx)).rejects.toBeInstanceOf(MutationRejected);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails.**

Run: `npx vitest run --project unit tests/unit/sync/mutators.test.ts`

Expected: FAIL, modules missing.

- [ ] **Step 3: Implement the `Tx`.** Create `app/sync/tx.ts`:

```ts
import { keyOf, type Row } from "./tables";

/** What a mutator can do to the data. Implemented over the client store (MemoryTx) and over D1 (ServerTx). */
export interface Tx {
  get(table: string, key: string): Promise<Row | null>;
  scan(table: string): Promise<Row[]>;
  put(table: string, row: Row): void;
  delete(table: string, key: string): void;
}

export type Tables = Map<string, Map<string, Row>>;

export class MemoryTx implements Tx {
  constructor(readonly tables: Tables) {}

  private table(name: string): Map<string, Row> {
    let t = this.tables.get(name);
    if (!t) this.tables.set(name, (t = new Map()));
    return t;
  }

  async get(table: string, key: string) {
    return this.table(table).get(key) ?? null;
  }

  async scan(table: string) {
    return [...this.table(table).values()];
  }

  put(table: string, row: Row) {
    this.table(table).set(keyOf(table, row), row);
  }

  delete(table: string, key: string) {
    this.table(table).delete(key);
  }
}
```

- [ ] **Step 4: Implement the mutators.** Create `app/sync/mutators.ts`:

```ts
import { z } from "zod";
import { meals } from "~/content";
import { addDays, daysBetween } from "~/domain/dates";
import { DEFAULT_REMINDERS } from "~/domain/reminders";
import { SLOTS } from "~/domain/types";
import type { Tx } from "./tx";

export class MutationRejected extends Error {}

export interface MutationContext {
  /** ISO time the change was made. The server uses its own clock. */
  now: string;
  /** Today in Chicago. */
  today: string;
}

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const clientId = z.string().min(1).max(64);
const key = z.string().min(1).max(64);
const round1 = (n: number) => Math.round(n * 10) / 10;

function notFuture(d: string, ctx: MutationContext) {
  if (daysBetween(ctx.today, d) > 1) throw new MutationRejected("That date is in the future.");
}

const defs = {
  logWeighIn: {
    args: z.object({ date, weightLb: z.number().min(80).max(500) }),
    async run(tx: Tx, a: { date: string; weightLb: number }, ctx: MutationContext) {
      notFuture(a.date, ctx);
      tx.put("weigh_ins", { date: a.date, weight_lb: round1(a.weightLb), logged_at: ctx.now });
    },
  },
  editWeighIn: {
    args: z.object({ date, weightLb: z.number().min(80).max(500) }),
    async run(tx: Tx, a: { date: string; weightLb: number }, ctx: MutationContext) {
      notFuture(a.date, ctx);
      const prev = await tx.get("weigh_ins", a.date);
      tx.put("weigh_ins", { date: a.date, weight_lb: round1(a.weightLb), logged_at: (prev?.logged_at as string | undefined) ?? ctx.now });
    },
  },
  deleteWeighIn: {
    args: z.object({ date }),
    async run(tx: Tx, a: { date: string }) {
      tx.delete("weigh_ins", a.date);
    },
  },
  logMeal: {
    args: z.object({ clientId, date, slot: z.enum(SLOTS as [string, ...string[]]), mealSlug: z.string().min(1) }),
    async run(tx: Tx, a: { clientId: string; date: string; slot: string; mealSlug: string }, ctx: MutationContext) {
      notFuture(a.date, ctx);
      const meal = meals.get(a.mealSlug);
      if (!meal) throw new MutationRejected("That meal isn't in the library.");
      const logs = await tx.scan("meal_logs");
      if (logs.some((l) => l.date === a.date && l.slot === a.slot && l.category === "planned")) return;
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
      // Same rule as openBatch in meals.server.ts: the newest batch of this meal with portions left, cooked up to 3 days ago.
      const batch = (await tx.scan("batches"))
        .filter((b) => b.meal_slug === meal.slug && (b.portions_left as number) > 0 && (b.created_on as string) >= addDays(a.date, -3) && (b.created_on as string) <= a.date)
        .sort((x, y) => (y.id as number) - (x.id as number))[0];
      if (batch) tx.put("batches", { ...batch, portions_left: (batch.portions_left as number) - 1 });
    },
  },
  unlogMeal: {
    args: z.object({ key }),
    async run(tx: Tx, a: { key: string }) {
      tx.delete("meal_logs", a.key);
    },
  },
  logOffPlan: {
    args: z.object({
      clientId,
      date,
      name: z.string().trim().min(1).max(80),
      category: z.enum(["meal", "snack", "dessert", "drink"]),
      kcal: z.number().int().min(0).max(5000),
      proteinG: z.number().int().min(0).max(400),
      relaxed: z.boolean(),
    }),
    async run(
      tx: Tx,
      a: { clientId: string; date: string; name: string; category: string; kcal: number; proteinG: number; relaxed: boolean },
      ctx: MutationContext,
    ) {
      notFuture(a.date, ctx);
      tx.put("meal_logs", {
        client_id: a.clientId,
        date: a.date,
        slot: null,
        meal_slug: null,
        name: a.name,
        category: a.category,
        kcal: a.kcal,
        protein_g: a.proteinG,
        relaxed: a.relaxed ? 1 : 0,
        portions: 1,
        logged_at: ctx.now,
      });
    },
  },
  deleteOffPlan: {
    args: z.object({ key }),
    async run(tx: Tx, a: { key: string }) {
      tx.delete("meal_logs", a.key);
    },
  },
  setReminder: {
    args: z.object({
      kind: z.enum(DEFAULT_REMINDERS.map((r) => r.kind) as [string, ...string[]]),
      enabled: z.boolean(),
      time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    }),
    async run(tx: Tx, a: { kind: string; enabled: boolean; time: string }) {
      tx.put("reminder_settings", { kind: a.kind, enabled: a.enabled ? 1 : 0, time: a.time });
    },
  },
  setVoice: {
    args: z.object({ voice: z.enum(["corner", "plain"]) }),
    async run(tx: Tx, a: { voice: string }) {
      tx.put("profile", { id: "me", voice: a.voice });
    },
  },
};

export type MutationName = keyof typeof defs;
export const MUTATION_NAMES = Object.keys(defs) as MutationName[];

/** Validates the args and applies one named change. Throws MutationRejected for anything the change refuses. */
export async function runMutation(tx: Tx, name: string, args: unknown, ctx: MutationContext): Promise<void> {
  const def = (defs as Record<string, { args: z.ZodType; run: (tx: Tx, a: never, ctx: MutationContext) => Promise<void> }>)[name];
  if (!def) throw new MutationRejected(`Unknown change: ${name}`);
  const parsed = def.args.safeParse(args);
  if (!parsed.success) throw new MutationRejected(parsed.error.issues[0]?.message ?? "Bad input");
  await def.run(tx, parsed.data as never, ctx);
}
```

- [ ] **Step 5: Run the test.**

Run: `npx vitest run --project unit tests/unit/sync/mutators.test.ts`

Expected: PASS (5 tests).

- [ ] **Step 6: Commit.**

```bash
git add app/sync/tx.ts app/sync/mutators.ts tests/unit/sync/mutators.test.ts
git commit -m "Add the Foundation's named changes, shared by phone and server"
```

---

### Task 4: Push

**Files:**
- Create: `app/sync/server-tx.server.ts`, `app/sync/push.server.ts`, `app/routes/api.sync.push.ts`
- Modify: `app/server/current-user.server.ts`, `app/routes.ts`
- Test: `tests/workers/sync-push.test.ts`

- [ ] **Step 1: Write the failing test.** Create `tests/workers/sync-push.test.ts`:

```ts
import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { processPush } from "~/sync/push.server";

const now = new Date("2026-10-27T16:00:00Z");

describe("push", () => {
  it("applies mutations in order and records the last one", async () => {
    const res = await processPush(env.DB, {
      clientId: "phone-a",
      mutations: [
        { id: 1, name: "logWeighIn", args: { date: "2026-10-27", weightLb: 205.2 } },
        { id: 2, name: "editWeighIn", args: { date: "2026-10-27", weightLb: 205.0 } },
      ],
    }, now);
    expect(res).toEqual({ lastMutationId: 2, rejected: [] });
    expect(await env.DB.prepare("select weight_lb from weigh_ins where date = '2026-10-27'").first()).toEqual({ weight_lb: 205 });
  });

  it("skips mutations it already applied", async () => {
    const body = { clientId: "phone-b", mutations: [{ id: 1, name: "logOffPlan", args: { clientId: "x-1", date: "2026-10-27", name: "Chips", category: "snack", kcal: 160, proteinG: 2, relaxed: false } }] };
    await processPush(env.DB, body, now);
    await processPush(env.DB, body, now);
    expect(await env.DB.prepare("select count(*) as n from meal_logs where client_id = 'x-1'").first()).toEqual({ n: 1 });
  });

  it("reports a rejected mutation and still moves past it", async () => {
    const res = await processPush(env.DB, {
      clientId: "phone-c",
      mutations: [
        { id: 1, name: "logWeighIn", args: { date: "2026-10-27", weightLb: 10 } },
        { id: 2, name: "setVoice", args: { voice: "plain" } },
      ],
    }, now);
    expect(res.lastMutationId).toBe(2);
    expect(res.rejected).toEqual([{ id: 1, message: expect.any(String) }]);
    expect(await env.DB.prepare("select voice from profile where id = 'me'").first()).toEqual({ voice: "plain" });
  });

  it("writes to the database it is given and no other", async () => {
    await processPush(env.DB_CATHERINE, { clientId: "phone-d", mutations: [{ id: 1, name: "logWeighIn", args: { date: "2026-10-26", weightLb: 140 } }] }, now);
    expect(await env.DB_CATHERINE.prepare("select count(*) as n from weigh_ins where date = '2026-10-26'").first()).toEqual({ n: 1 });
    expect(await env.DB.prepare("select count(*) as n from weigh_ins where date = '2026-10-26'").first()).toEqual({ n: 0 });
  });
});
```

- [ ] **Step 2: Run it to make sure it fails.**

Run: `npx vitest run --project workers tests/workers/sync-push.test.ts`

Expected: FAIL, module missing.

- [ ] **Step 3: Implement the server `Tx`.** Create `app/sync/server-tx.server.ts`:

```ts
import { tableDef, type Row } from "./tables";
import type { Tx } from "./tx";

/**
 * A Tx over D1. D1 has no interactive transactions, so reads go to the database (overlaid with this Tx's own
 * pending writes) and writes are buffered, then committed with batch(), which is atomic.
 */
export class ServerTx implements Tx {
  readonly statements: D1PreparedStatement[] = [];
  private readonly overlay = new Map<string, Row | null>();

  constructor(private readonly d1: D1Database) {}

  private slot(table: string, key: string) {
    return `${table}\u0000${key}`;
  }

  async get(table: string, key: string): Promise<Row | null> {
    const slot = this.slot(table, key);
    if (this.overlay.has(slot)) return this.overlay.get(slot)!;
    return (await this.d1.prepare(`SELECT * FROM ${table} WHERE ${tableDef(table).keySql("")} = ?`).bind(key).first<Row>()) ?? null;
  }

  async scan(table: string): Promise<Row[]> {
    const def = tableDef(table);
    const rows = new Map<string, Row>();
    for (const row of (await this.d1.prepare(`SELECT * FROM ${table}`).all<Row>()).results) rows.set(def.key(row), row);
    for (const [slot, row] of this.overlay) {
      const [t, key] = slot.split("\u0000");
      if (t !== table) continue;
      if (row === null) rows.delete(key);
      else rows.set(key, row);
    }
    return [...rows.values()];
  }

  put(table: string, row: Row): void {
    const def = tableDef(table);
    this.overlay.set(this.slot(table, def.key(row)), row);
    const columns = Object.keys(row);
    const updates = columns.filter((c) => !def.conflict.includes(c)).map((c) => `${c} = excluded.${c}`);
    const sql =
      `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})` +
      ` ON CONFLICT (${def.conflict.join(", ")}) DO ${updates.length ? `UPDATE SET ${updates.join(", ")}` : "NOTHING"}`;
    this.statements.push(this.d1.prepare(sql).bind(...columns.map((c) => row[c] ?? null)));
  }

  delete(table: string, key: string): void {
    this.overlay.set(this.slot(table, key), null);
    this.statements.push(this.d1.prepare(`DELETE FROM ${table} WHERE ${tableDef(table).keySql("")} = ?`).bind(key));
  }
}
```

- [ ] **Step 4: Implement push.** Create `app/sync/push.server.ts`:

```ts
import { z } from "zod";
import { localDate } from "~/domain/dates";
import { MutationRejected, runMutation } from "./mutators";
import { ServerTx } from "./server-tx.server";

export const PushBody = z.object({
  clientId: z.string().min(8).max(64),
  mutations: z.array(z.object({ id: z.number().int().positive(), name: z.string(), args: z.unknown() })).max(500),
});
export type PushBody = z.infer<typeof PushBody>;
export type PushResult = { lastMutationId: number; rejected: { id: number; message: string }[] };

export async function lastMutationId(d1: D1Database, clientId: string): Promise<number> {
  return (await d1.prepare("SELECT last_mutation_id AS n FROM sync_clients WHERE client_id = ?").bind(clientId).first<{ n: number }>())?.n ?? 0;
}

/** Applies a phone's queued changes to one person's database, each in its own atomic batch. */
export async function processPush(d1: D1Database, body: PushBody, now: Date): Promise<PushResult> {
  let last = await lastMutationId(d1, body.clientId);
  const rejected: PushResult["rejected"] = [];
  const ctx = { now: now.toISOString(), today: localDate(now) };
  for (const m of [...body.mutations].sort((a, b) => a.id - b.id)) {
    if (m.id <= last) continue;
    const tx = new ServerTx(d1);
    try {
      await runMutation(tx, m.name, m.args, ctx);
    } catch (err) {
      if (!(err instanceof MutationRejected)) throw err;
      rejected.push({ id: m.id, message: err.message });
      tx.statements.length = 0;
    }
    const ack = d1
      .prepare("INSERT INTO sync_clients (client_id, last_mutation_id) VALUES (?, ?) ON CONFLICT (client_id) DO UPDATE SET last_mutation_id = excluded.last_mutation_id")
      .bind(body.clientId, m.id);
    await d1.batch([...tx.statements, ack]);
    last = m.id;
  }
  return { lastMutationId: last, rejected };
}
```

- [ ] **Step 5: Add `userD1()`.** Append to `app/server/current-user.server.ts`:

```ts
/** The signed-in person's own D1 database, for raw SQL such as the sync endpoints. */
export function userD1(): D1Database {
  return env[currentUser().dbBinding];
}
```

- [ ] **Step 6: Add the endpoint.** Create `app/routes/api.sync.push.ts`:

```ts
import type { Route } from "./+types/api.sync.push";
import { userD1 } from "~/server/current-user.server";
import { serverNow } from "~/server/clock.server";
import { PushBody, processPush } from "~/sync/push.server";

export async function loader() {
  return new Response("Method not allowed", { status: 405 });
}

export async function action({ request }: Route.ActionArgs) {
  const parsed = PushBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Bad push" }, { status: 400 });
  return Response.json(await processPush(userD1(), parsed.data, serverNow()));
}
```

In `app/routes.ts`, after the `api/ingest/steps` route, add:

```ts
  route("api/sync/push", "routes/api.sync.push.ts"),
  route("api/sync/pull", "routes/api.sync.pull.ts"),
  route("api/vitals", "routes/api.vitals.ts"),
```

These are outside the public paths, so the root middleware requires a session and scopes the request to the signed-in person's database. Task 5 and Task 9 create the other two files. Until then, typegen may complain, so create them as stubs now that return 405 from `loader` and `action`.

- [ ] **Step 7: Run the test.**

Run: `npx vitest run --project workers tests/workers/sync-push.test.ts`

Expected: PASS (4 tests).

- [ ] **Step 8: Commit.**

```bash
git add app/sync/server-tx.server.ts app/sync/push.server.ts app/routes/api.sync.push.ts app/routes/api.sync.pull.ts app/routes/api.vitals.ts app/routes.ts app/server/current-user.server.ts tests/workers/sync-push.test.ts
git commit -m "Apply a phone's queued changes on the server"
```

---

### Task 5: Pull

**Files:**
- Create: `app/sync/pull.server.ts`
- Rewrite: `app/routes/api.sync.pull.ts`
- Test: `tests/workers/sync-pull.test.ts`

- [ ] **Step 1: Write the failing test.** Create `tests/workers/sync-pull.test.ts`:

```ts
import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { logWeighIn, deleteWeighIn } from "~/server/body.server";
import { processPull } from "~/sync/pull.server";
import { processPush } from "~/sync/push.server";
import { db } from "./helpers";

describe("pull", () => {
  it("returns a full snapshot from version 0", async () => {
    await logWeighIn(db(), "2026-10-20", 206, new Date());
    const res = await processPull(env.DB, 0, "phone-a");
    expect(res.snapshot).toBe(true);
    expect(res.puts.weigh_ins).toEqual([expect.objectContaining({ date: "2026-10-20", weight_lb: 206 })]);
    expect(res.version).toBeGreaterThan(0);
  });

  it("returns only what changed after a version, including deletes", async () => {
    const start = (await processPull(env.DB, 0, "phone-a")).version;
    await logWeighIn(db(), "2026-10-21", 205.5, new Date());
    await deleteWeighIn(db(), "2026-10-20");
    const res = await processPull(env.DB, start, "phone-a");
    expect(res.snapshot).toBe(false);
    expect(res.puts.weigh_ins).toEqual([expect.objectContaining({ date: "2026-10-21" })]);
    expect(res.dels.weigh_ins).toEqual(["2026-10-20"]);
    expect(res.puts.meal_logs).toBeUndefined();
  });

  it("tells the phone the last change it applied", async () => {
    await processPush(env.DB, { clientId: "phone-z", mutations: [{ id: 4, name: "setVoice", args: { voice: "plain" } }] }, new Date());
    expect((await processPull(env.DB, 0, "phone-z")).lastMutationId).toBe(4);
  });

  it("falls back to a snapshot when the log no longer reaches back far enough", async () => {
    await logWeighIn(db(), "2026-10-22", 205, new Date());
    const { version } = await processPull(env.DB, 0, "phone-a");
    await env.DB.prepare("delete from changes where version <= ?").bind(version).run();
    await logWeighIn(db(), "2026-10-23", 204.8, new Date());
    expect((await processPull(env.DB, 1, "phone-a")).snapshot).toBe(true);
  });

  it("only ever reads the database it is given", async () => {
    await logWeighIn(db(), "2026-10-24", 204.6, new Date());
    const res = await processPull(env.DB_CATHERINE, 0, "phone-c");
    expect(res.puts.weigh_ins ?? []).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails.**

Run: `npx vitest run --project workers tests/workers/sync-pull.test.ts`

Expected: FAIL, module missing.

- [ ] **Step 3: Implement.** Create `app/sync/pull.server.ts`:

```ts
import { lastMutationId } from "./push.server";
import { SYNCED, tableDef, type Row } from "./tables";

export type PullResult = {
  version: number;
  lastMutationId: number;
  snapshot: boolean;
  puts: Record<string, Row[]>;
  dels: Record<string, string[]>;
};

// D1 allows 100 bound parameters per statement.
const CHUNK = 90;

/** Everything in one person's database that changed after `since`, or all of it when `since` is 0 or too old. */
export async function processPull(d1: D1Database, since: number, clientId: string): Promise<PullResult> {
  // Read the version first: a write landing during this pull is either included or sent again next time.
  const head = await d1
    .prepare("SELECT (SELECT seq FROM sqlite_sequence WHERE name = 'changes') AS seq, (SELECT MIN(version) FROM changes) AS oldest")
    .first<{ seq: number | null; oldest: number | null }>();
  const version = head?.seq ?? 0;
  const ackedThrough = await lastMutationId(d1, clientId);
  const oldestKept = head?.oldest ?? version + 1;
  const snapshot = since <= 0 || since < oldestKept - 1;

  if (snapshot) {
    const results = await d1.batch(SYNCED.map((t) => d1.prepare(`SELECT * FROM ${t.name}`)));
    const puts: Record<string, Row[]> = {};
    SYNCED.forEach((t, i) => (puts[t.name] = results[i].results as Row[]));
    return { version, lastMutationId: ackedThrough, snapshot: true, puts, dels: {} };
  }

  const changed = (
    await d1
      .prepare("SELECT DISTINCT table_name, row_key FROM changes WHERE version > ? AND version <= ?")
      .bind(since, version)
      .all<{ table_name: string; row_key: string }>()
  ).results;
  const byTable = new Map<string, string[]>();
  for (const c of changed) byTable.set(c.table_name, [...(byTable.get(c.table_name) ?? []), c.row_key]);

  const puts: Record<string, Row[]> = {};
  const dels: Record<string, string[]> = {};
  for (const [table, keys] of byTable) {
    const def = tableDef(table);
    const found = new Map<string, Row>();
    for (let i = 0; i < keys.length; i += CHUNK) {
      const part = keys.slice(i, i + CHUNK);
      const rows = (
        await d1
          .prepare(`SELECT * FROM ${table} WHERE ${def.keySql("")} IN (${part.map(() => "?").join(", ")})`)
          .bind(...part)
          .all<Row>()
      ).results;
      for (const row of rows) found.set(def.key(row), row);
    }
    // A key whose row is gone was deleted, whatever the log's op says.
    const present = keys.filter((k) => found.has(k));
    const gone = keys.filter((k) => !found.has(k));
    if (present.length) puts[table] = present.map((k) => found.get(k)!);
    if (gone.length) dels[table] = gone;
  }
  return { version, lastMutationId: ackedThrough, snapshot: false, puts, dels };
}
```

- [ ] **Step 4: Replace the stub endpoint.** Replace `app/routes/api.sync.pull.ts`:

```ts
import type { Route } from "./+types/api.sync.pull";
import { userD1 } from "~/server/current-user.server";
import { processPull } from "~/sync/pull.server";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const since = Number(url.searchParams.get("since") ?? "0");
  const clientId = url.searchParams.get("clientId") ?? "";
  if (!Number.isInteger(since) || since < 0 || clientId.length < 8) return Response.json({ error: "Bad pull" }, { status: 400 });
  return Response.json(await processPull(userD1(), since, clientId), { headers: { "Cache-Control": "no-store" } });
}
```

- [ ] **Step 5: Run the tests.**

Run: `npx vitest run --project workers tests/workers/sync-pull.test.ts tests/workers/sync-push.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add app/sync/pull.server.ts app/routes/api.sync.pull.ts tests/workers/sync-pull.test.ts
git commit -m "Send a phone everything that changed since its last pull"
```

---

### Task 6: The client store and rebase

**Files:**
- Create: `app/sync/store.ts`
- Test: `tests/unit/sync/store.test.ts`

- [ ] **Step 1: Write the failing test.** Create `tests/unit/sync/store.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { SyncStore } from "~/sync/store";

const ctx = () => ({ now: "2026-10-27T16:00:00.000Z", today: "2026-10-27" });

describe("SyncStore", () => {
  it("shows a change the moment it is made", async () => {
    const store = new SyncStore(ctx);
    await store.mutate("logWeighIn", { date: "2026-10-27", weightLb: 205 });
    expect(store.rows("weigh_ins")).toEqual([expect.objectContaining({ date: "2026-10-27", weight_lb: 205 })]);
    expect(store.pending).toHaveLength(1);
  });

  it("keeps unconfirmed changes on top of what the server sends", async () => {
    const store = new SyncStore(ctx);
    await store.mutate("logWeighIn", { date: "2026-10-27", weightLb: 205 });
    await store.mutate("setVoice", { voice: "plain" });
    await store.applyPull({ version: 10, lastMutationId: 1, snapshot: true, puts: { weigh_ins: [{ date: "2026-10-27", weight_lb: 205, logged_at: "x" }] }, dels: {} });
    expect(store.pending.map((m) => m.name)).toEqual(["setVoice"]);
    expect(store.rows("profile")).toEqual([{ id: "me", voice: "plain" }]);
    expect(store.version).toBe(10);
  });

  it("applies deltas and deletes", async () => {
    const store = new SyncStore(ctx);
    await store.applyPull({ version: 1, lastMutationId: 0, snapshot: true, puts: { weigh_ins: [{ date: "a", weight_lb: 1 }, { date: "b", weight_lb: 2 }] }, dels: {} });
    await store.applyPull({ version: 2, lastMutationId: 0, snapshot: false, puts: { weigh_ins: [{ date: "c", weight_lb: 3 }] }, dels: { weigh_ins: ["a"] } });
    expect(store.rows("weigh_ins").map((r) => r.date).sort()).toEqual(["b", "c"]);
  });

  it("replaces the phone's copy of a new row with the server's", async () => {
    const store = new SyncStore(ctx);
    await store.mutate("logOffPlan", { clientId: "c-1", date: "2026-10-27", name: "Chips", category: "snack", kcal: 160, proteinG: 2, relaxed: false });
    await store.applyPull({ version: 3, lastMutationId: 1, snapshot: false, puts: { meal_logs: [{ id: 41, client_id: "c-1", name: "Chips", kcal: 160 }] }, dels: {} });
    expect(store.rows("meal_logs")).toEqual([expect.objectContaining({ id: 41, client_id: "c-1" })]);
  });

  it("refuses a change the mutator rejects without queueing it", async () => {
    const store = new SyncStore(ctx);
    await expect(store.mutate("logWeighIn", { date: "2026-10-27", weightLb: 5 })).rejects.toThrow();
    expect(store.pending).toHaveLength(0);
  });

  it("notifies subscribers and round-trips through a saved state", async () => {
    const store = new SyncStore(ctx);
    let calls = 0;
    store.subscribe(() => calls++);
    await store.mutate("setVoice", { voice: "plain" });
    expect(calls).toBeGreaterThan(0);
    const copy = new SyncStore(ctx);
    await copy.restore(store.save());
    expect(copy.rows("profile")).toEqual([{ id: "me", voice: "plain" }]);
    expect(copy.pending).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails.**

Run: `npx vitest run --project unit tests/unit/sync/store.test.ts`

Expected: FAIL, module missing.

- [ ] **Step 3: Implement.** Create `app/sync/store.ts`:

```ts
import { runMutation, type MutationContext } from "./mutators";
import { keyOf, type Row } from "./tables";
import { MemoryTx, type Tables } from "./tx";

export interface PendingMutation {
  id: number;
  name: string;
  args: unknown;
}

export interface PullPayload {
  version: number;
  lastMutationId: number;
  snapshot: boolean;
  puts: Record<string, Row[]>;
  dels: Record<string, string[]>;
}

export interface SavedState {
  version: number;
  nextMutationId: number;
  base: Record<string, Row[]>;
  pending: PendingMutation[];
}

const clone = (t: Tables): Tables => new Map([...t].map(([name, rows]) => [name, new Map(rows)]));

/**
 * The phone's copy of one person's data. `base` is what the server last confirmed. `view` is base plus the changes
 * still waiting to be confirmed, replayed in order. Screens read `view`.
 */
export class SyncStore {
  version = 0;
  nextMutationId = 1;
  pending: PendingMutation[] = [];
  private base: Tables = new Map();
  private view: Tables = new Map();
  private listeners = new Set<() => void>();
  private snapshots = new Map<string, Row[]>();

  constructor(private readonly context: () => MutationContext) {}

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Rows of one table. The same array is returned until that table changes, so React can compare it cheaply. */
  rows(table: string): Row[] {
    let rows = this.snapshots.get(table);
    if (!rows) this.snapshots.set(table, (rows = [...(this.view.get(table)?.values() ?? [])]));
    return rows;
  }

  /** Applies a change now and queues it for the server. Throws, and queues nothing, if the change is refused. */
  async mutate(name: string, args: unknown): Promise<PendingMutation> {
    const next = clone(this.view);
    await runMutation(new MemoryTx(next), name, args, this.context());
    const m = { id: this.nextMutationId++, name, args };
    this.pending.push(m);
    this.view = next;
    this.changed();
    return m;
  }

  async applyPull(p: PullPayload): Promise<void> {
    if (p.snapshot) this.base = new Map();
    for (const [table, rows] of Object.entries(p.puts)) {
      let t = this.base.get(table);
      if (!t) this.base.set(table, (t = new Map()));
      for (const row of rows) t.set(keyOf(table, row), row);
    }
    for (const [table, keys] of Object.entries(p.dels)) for (const k of keys) this.base.get(table)?.delete(k);
    this.version = p.version;
    this.pending = this.pending.filter((m) => m.id > p.lastMutationId);
    await this.rebase();
  }

  private async rebase(): Promise<void> {
    const next = clone(this.base);
    const tx = new MemoryTx(next);
    for (const m of this.pending) {
      // A waiting change that no longer applies (the server will reject it too) is skipped here, not dropped.
      await runMutation(tx, m.name, m.args, this.context()).catch(() => undefined);
    }
    this.view = next;
    this.changed();
  }

  save(): SavedState {
    const base: Record<string, Row[]> = {};
    for (const [name, rows] of this.base) base[name] = [...rows.values()];
    return { version: this.version, nextMutationId: this.nextMutationId, base, pending: this.pending };
  }

  async restore(s: SavedState): Promise<void> {
    this.version = s.version;
    this.nextMutationId = s.nextMutationId;
    this.pending = s.pending;
    this.base = new Map(Object.entries(s.base).map(([name, rows]) => [name, new Map(rows.map((r) => [keyOf(name, r), r]))]));
    await this.rebase();
  }

  private changed(): void {
    this.snapshots.clear();
    for (const fn of this.listeners) fn();
  }
}
```

In the "round-trips" test, `save()` before any pull has an empty base and one pending change. After `restore`, the rebase replays it, so the profile row appears. That's the behaviour the test pins.

- [ ] **Step 4: Run the test.**

Run: `npx vitest run --project unit tests/unit/sync/store.test.ts`

Expected: PASS (6 tests).

- [ ] **Step 5: Commit.**

```bash
git add app/sync/store.ts tests/unit/sync/store.test.ts
git commit -m "Keep the phone's copy of the data and rebase waiting changes on each pull"
```

---

### Task 7: The sync loop and persistence

**Files:**
- Create: `app/sync/idb.ts`, `app/sync/client.ts`
- Test: `tests/unit/sync/client.test.ts`

- [ ] **Step 1: Write the failing test.** Create `tests/unit/sync/client.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { SyncClient, type Persistence, type Transport } from "~/sync/client";
import type { SavedState } from "~/sync/store";

function memoryPersistence(): Persistence & { saved: (SavedState & { clientId: string }) | null } {
  const p = {
    saved: null as (SavedState & { clientId: string }) | null,
    async load() {
      return p.saved;
    },
    async save(s: SavedState & { clientId: string }) {
      p.saved = s;
    },
  };
  return p;
}

const ctx = () => ({ now: "2026-10-27T16:00:00.000Z", today: "2026-10-27" });

describe("SyncClient", () => {
  it("pushes a change, then pulls, and ends with nothing waiting", async () => {
    let serverLast = 0;
    const transport: Transport = {
      push: vi.fn(async (body) => {
        serverLast = body.mutations.at(-1)!.id;
        return { ok: true, status: 200, result: { lastMutationId: serverLast, rejected: [] } };
      }),
      pull: vi.fn(async () => ({ ok: true, status: 200, result: { version: 5, lastMutationId: serverLast, snapshot: true, puts: { weigh_ins: [{ date: "2026-10-27", weight_lb: 205 }] }, dels: {} } })),
    };
    const client = new SyncClient({ transport, persistence: memoryPersistence(), context: ctx });
    await client.start();
    await client.mutate("logWeighIn", { date: "2026-10-27", weightLb: 205 });
    await client.idle();
    expect(transport.push).toHaveBeenCalledTimes(1);
    expect(client.store.pending).toHaveLength(0);
    expect(client.status().waiting).toBe(0);
  });

  it("keeps changes when offline and sends them later", async () => {
    let online = false;
    const transport: Transport = {
      push: vi.fn(async (body) => (online ? { ok: true, status: 200, result: { lastMutationId: body.mutations.at(-1)!.id, rejected: [] } } : Promise.reject(new TypeError("offline")))),
      pull: vi.fn(async () => (online ? { ok: true, status: 200, result: { version: 1, lastMutationId: 1, snapshot: true, puts: {}, dels: {} } } : Promise.reject(new TypeError("offline")))),
    };
    const persistence = memoryPersistence();
    const client = new SyncClient({ transport, persistence, context: ctx, retryMs: () => 0 });
    await client.start();
    await client.mutate("setVoice", { voice: "plain" });
    await client.idle();
    expect(client.status().waiting).toBe(1);
    expect(persistence.saved?.pending).toHaveLength(1);
    online = true;
    await client.sync();
    expect(client.status().waiting).toBe(0);
  });

  it("restores a saved queue on start", async () => {
    const persistence = memoryPersistence();
    persistence.saved = { clientId: "saved-client-1", version: 3, nextMutationId: 2, base: {}, pending: [{ id: 1, name: "setVoice", args: { voice: "plain" } }] };
    const transport: Transport = {
      push: vi.fn(async () => ({ ok: true, status: 200, result: { lastMutationId: 1, rejected: [] } })),
      pull: vi.fn(async () => ({ ok: true, status: 200, result: { version: 4, lastMutationId: 1, snapshot: false, puts: { profile: [{ id: "me", voice: "plain" }] }, dels: {} } })),
    };
    const client = new SyncClient({ transport, persistence, context: ctx });
    await client.start();
    await client.idle();
    expect(transport.push).toHaveBeenCalledWith({ clientId: "saved-client-1", mutations: [{ id: 1, name: "setVoice", args: { voice: "plain" } }] });
    expect(client.store.rows("profile")).toEqual([{ id: "me", voice: "plain" }]);
  });

  it("reports rejected changes", async () => {
    const transport: Transport = {
      push: vi.fn(async () => ({ ok: true, status: 200, result: { lastMutationId: 1, rejected: [{ id: 1, message: "That date is in the future." }] } })),
      pull: vi.fn(async () => ({ ok: true, status: 200, result: { version: 1, lastMutationId: 1, snapshot: true, puts: {}, dels: {} } })),
    };
    const client = new SyncClient({ transport, persistence: memoryPersistence(), context: ctx });
    await client.start();
    await client.mutate("setVoice", { voice: "plain" });
    await client.idle();
    expect(client.status().rejected).toEqual(["That date is in the future."]);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails.**

Run: `npx vitest run --project unit tests/unit/sync/client.test.ts`

Expected: FAIL, module missing.

- [ ] **Step 3: Implement the loop.** Create `app/sync/client.ts`:

```ts
import type { MutationContext } from "./mutators";
import { SyncStore, type PendingMutation, type PullPayload, type SavedState } from "./store";

export type Persisted = SavedState & { clientId: string };

export interface Persistence {
  load(): Promise<Persisted | null>;
  save(state: Persisted): Promise<void>;
}

type Reply<T> = { ok: boolean; status: number; result: T };
export interface Transport {
  push(body: { clientId: string; mutations: PendingMutation[] }): Promise<Reply<{ lastMutationId: number; rejected: { id: number; message: string }[] }>>;
  pull(since: number, clientId: string): Promise<Reply<PullPayload>>;
}

export interface SyncStatus {
  waiting: number;
  online: boolean;
  lastSyncedAt: string | null;
  rejected: string[];
}

export interface SyncClientOptions {
  transport: Transport;
  persistence: Persistence;
  context: () => MutationContext;
  /** Delay before retry number n (0-based). Defaults to 1, 2, 4 ... 60 seconds. */
  retryMs?: (n: number) => number;
  onSignedOut?: () => void;
}

const newClientId = () => crypto.randomUUID();

export class SyncClient {
  readonly store: SyncStore;
  private clientId = "";
  private running: Promise<void> | null = null;
  private again = false;
  private failures = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private state: SyncStatus = { waiting: 0, online: true, lastSyncedAt: null, rejected: [] };
  private statusListeners = new Set<() => void>();

  constructor(private readonly opts: SyncClientOptions) {
    this.store = new SyncStore(opts.context);
  }

  async start(): Promise<void> {
    const saved = await this.opts.persistence.load().catch(() => null);
    this.clientId = saved?.clientId ?? newClientId();
    if (saved) await this.store.restore(saved);
    this.updateStatus({});
    void this.sync();
  }

  async mutate(name: string, args: unknown): Promise<void> {
    await this.store.mutate(name, args);
    this.updateStatus({});
    await this.persist();
    void this.sync();
  }

  /** Pushes anything waiting, then pulls. Overlapping calls coalesce into one more round. */
  sync(): Promise<void> {
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.running = (async () => {
      do {
        this.again = false;
        await this.round();
      } while (this.again);
    })().finally(() => (this.running = null));
    return this.running;
  }

  /** Resolves when no round is running. For tests and for code that wants to wait for a quiet moment. */
  async idle(): Promise<void> {
    while (this.running) await this.running;
  }

  status(): SyncStatus {
    return this.state;
  }

  onStatus(fn: () => void): () => void {
    this.statusListeners.add(fn);
    return () => this.statusListeners.delete(fn);
  }

  private async round(): Promise<void> {
    try {
      if (this.store.pending.length) {
        const res = await this.opts.transport.push({ clientId: this.clientId, mutations: this.store.pending });
        if (res.status === 401) return this.signedOut();
        if (!res.ok) throw new Error(`push ${res.status}`);
        if (res.result.rejected.length) this.updateStatus({ rejected: [...this.state.rejected, ...res.result.rejected.map((r) => r.message)] });
      }
      const pulled = await this.opts.transport.pull(this.store.version, this.clientId);
      if (pulled.status === 401) return this.signedOut();
      if (!pulled.ok) throw new Error(`pull ${pulled.status}`);
      await this.store.applyPull(pulled.result);
      await this.persist();
      this.failures = 0;
      this.updateStatus({ online: true, lastSyncedAt: new Date().toISOString() });
    } catch {
      this.updateStatus({ online: false });
      this.scheduleRetry();
    }
  }

  private scheduleRetry(): void {
    if (this.retryTimer) return;
    const delay = (this.opts.retryMs ?? ((n) => Math.min(60_000, 1000 * 2 ** n)))(this.failures++);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.sync();
    }, delay);
  }

  private signedOut(): void {
    this.opts.onSignedOut?.();
  }

  private async persist(): Promise<void> {
    await this.opts.persistence.save({ clientId: this.clientId, ...this.store.save() }).catch(() => undefined);
  }

  private updateStatus(patch: Partial<SyncStatus>): void {
    this.state = { ...this.state, ...patch, waiting: this.store.pending.length };
    for (const fn of this.statusListeners) fn();
  }

  /** Clears the rejected-change messages once a screen has shown them. */
  dismissRejected(): void {
    this.updateStatus({ rejected: [] });
  }

  /** Cancels a scheduled retry. Called when the app unmounts the client. */
  stop(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }
}
```

In the offline test, `retryMs: () => 0` keeps retrying while `online` is false. Each failed round ends before its retry timer fires, so `idle()` returns between them.

- [ ] **Step 4: Implement persistence.** Create `app/sync/idb.ts`:

```ts
import type { Persisted, Persistence } from "./client";

// One small IndexedDB database per person, holding the whole sync state under one key.
export function idbPersistence(userId: number): Persistence {
  const open = () =>
    new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(`rocky-sync-${userId}`, 1);
      req.onupgradeneeded = () => req.result.createObjectStore("state");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  let dbp: Promise<IDBDatabase> | null = null;
  const db = () => (dbp ??= open());
  let saving: ReturnType<typeof setTimeout> | null = null;
  let latest: Persisted | null = null;

  return {
    async load() {
      const d = await db();
      return new Promise<Persisted | null>((resolve, reject) => {
        const req = d.transaction("state").objectStore("state").get("sync");
        req.onsuccess = () => resolve((req.result as Persisted | undefined) ?? null);
        req.onerror = () => reject(req.error);
      });
    },
    // Saves at most every 250 ms. The last state always wins.
    async save(state) {
      latest = state;
      if (saving) return;
      saving = setTimeout(async () => {
        saving = null;
        const d = await db();
        d.transaction("state", "readwrite").objectStore("state").put(latest, "sync");
      }, 250);
    },
  };
}
```

- [ ] **Step 5: Run the test.**

Run: `npx vitest run --project unit tests/unit/sync/client.test.ts`

Expected: PASS (4 tests).

- [ ] **Step 6: Commit.**

```bash
git add app/sync/client.ts app/sync/idb.ts tests/unit/sync/client.test.ts
git commit -m "Sync the phone's copy in the background and keep changes made offline"
```

---

### Task 8: Mount it in the app

**Files:**
- Create: `app/sync/react.tsx`
- Modify: `app/routes/app-layout.tsx`, `app/routes/settings.tsx`

- [ ] **Step 1: Add the React bindings.** Create `app/sync/react.tsx`:

```tsx
import { createContext, useContext, useEffect, useState, useSyncExternalStore } from "react";
import { localDate } from "~/domain/dates";
import { SyncClient } from "./client";
import { idbPersistence } from "./idb";
import type { Row } from "./tables";

const SyncContext = createContext<SyncClient | null>(null);

async function asReply<T>(res: Response) {
  return { ok: res.ok, status: res.status, result: (res.ok ? await res.json() : null) as T };
}

function createClient(userId: number): SyncClient {
  return new SyncClient({
    context: () => ({ now: new Date().toISOString(), today: localDate(new Date()) }),
    persistence: idbPersistence(userId),
    transport: {
      push: (body) =>
        fetch("/api/sync/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(asReply),
      pull: (since, clientId) => fetch(`/api/sync/pull?since=${since}&clientId=${encodeURIComponent(clientId)}`).then(asReply),
    },
    onSignedOut: () => window.location.assign("/login"),
  });
}

/** Starts the person's sync client in the browser. Renders children immediately; nothing waits on sync. */
export function SyncProvider({ userId, children }: { userId: number; children: React.ReactNode }) {
  const [client, setClient] = useState<SyncClient | null>(null);
  useEffect(() => {
    const c = createClient(userId);
    void c.start();
    void navigator.storage?.persist?.().catch(() => undefined);
    const resync = () => document.visibilityState === "visible" && void c.sync();
    const timer = window.setInterval(resync, 60_000);
    document.addEventListener("visibilitychange", resync);
    window.addEventListener("online", resync);
    setClient(c);
    return () => {
      c.stop();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", resync);
      window.removeEventListener("online", resync);
    };
  }, [userId]);
  return <SyncContext.Provider value={client}>{children}</SyncContext.Provider>;
}

export function useSyncClient(): SyncClient | null {
  return useContext(SyncContext);
}

const EMPTY: Row[] = [];

export function useTable(table: string): Row[] {
  const client = useSyncClient();
  return useSyncExternalStore(
    (fn) => client?.store.subscribe(fn) ?? (() => undefined),
    () => client?.store.rows(table) ?? EMPTY,
    () => EMPTY,
  );
}

export function useSyncStatus() {
  const client = useSyncClient();
  return useSyncExternalStore(
    (fn) => client?.onStatus(fn) ?? (() => undefined),
    () => client?.status() ?? null,
    () => null,
  );
}
```

- [ ] **Step 2: Mount the provider.** In `app/routes/app-layout.tsx`:

Add a loader:

```tsx
export async function loader() {
  return { userId: currentUser().id };
}
```

Change the component to take `{ loaderData }: Route.ComponentProps` and wrap its whole returned `<div>` in `<SyncProvider userId={loaderData.userId}>`. Import it with `import { SyncProvider } from "~/sync/react";`.

- [ ] **Step 3: Show the sync line in Settings.** In `app/routes/settings.tsx`:

1. Add the component:

    ```tsx
    import { useSyncStatus } from "~/sync/react";

    function SyncLine() {
      const s = useSyncStatus();
      if (!s) return null;
      const when = s.lastSyncedAt ? new Date(s.lastSyncedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : null;
      const text = !s.online
        ? `Sync: offline, ${s.waiting} change${s.waiting === 1 ? "" : "s"} waiting`
        : s.waiting
          ? `Sync: sending ${s.waiting} change${s.waiting === 1 ? "" : "s"}`
          : `Sync: up to date${when ? `, ${when}` : ""}`;
      return <p className="px-1 text-[13px] text-label-2">{text}</p>;
    }
    ```

2. Render `<SyncLine />` as the last element inside the Settings `<Screen>`, above Sign out.

- [ ] **Step 4: Check it in the running app.**
1. Run `npm run dev` and sign in.
2. Settings shows "Sync: up to date, <time>".
3. In devtools > Application > IndexedDB, `rocky-sync-1` has a `state` entry with `base.weigh_ins` holding your weigh-ins.
4. Set devtools to Offline and change a reminder time in Settings. This still uses the v1 server action, so it fails offline. That's expected for v1 screens.
5. Go back online and reload. The line reads "up to date" again.

- [ ] **Step 5: Commit.**

```bash
git add app/sync/react.tsx app/routes/app-layout.tsx app/routes/settings.tsx
git commit -m "Start syncing in the app and show its status in Settings"
```

---

### Task 9: Real tap latency and pruning the log

**Files:**
- Rewrite: `app/routes/api.vitals.ts`
- Modify: `app/routes/app-layout.tsx`, `app/jobs/scheduled.ts`, `package.json`
- Test: `tests/workers/vitals.test.ts`, `tests/workers/scheduled.test.ts`

- [ ] **Step 1: Install web-vitals.**

Run: `npm install web-vitals@6.2.3`

If npm crashes with `edgesOut`, add `--legacy-peer-deps`.

- [ ] **Step 2: Write the failing tests.** Create `tests/workers/vitals.test.ts`:

```ts
import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { action } from "~/routes/api.vitals";
import { routeArgs } from "./helpers";

const beacon = (body: unknown) => new Request("http://localhost/api/vitals", { method: "POST", body: JSON.stringify(body) });

describe("vitals", () => {
  it("stores a reported tap latency", async () => {
    const res = (await action(routeArgs(beacon({ route: "/", inp: 72, target: "button.btn-prominent" })))) as Response;
    expect(res.status).toBe(204);
    expect(await env.DB.prepare("select route, inp_ms, target from vitals").first()).toEqual({ route: "/", inp_ms: 72, target: "button.btn-prominent" });
  });

  it("ignores junk", async () => {
    expect(((await action(routeArgs(beacon({ route: "/", inp: -1 })))) as Response).status).toBe(400);
    expect(((await action(routeArgs(beacon("nope")))) as Response).status).toBe(400);
  });
});
```

In `tests/workers/scheduled.test.ts`, append:

```ts
it("prunes sync changes older than 30 days on the weekly cron", async () => {
  await env.DB.prepare("insert into changes (table_name, row_key, op, at) values ('weigh_ins', 'old', 'put', '2026-09-01T00:00:00.000Z'), ('weigh_ins', 'new', 'put', '2026-10-17T00:00:00.000Z')").run();
  const ctx = createExecutionContext();
  await worker.scheduled(createScheduledController({ cron: "0 9 * * SUN", scheduledTime: Date.UTC(2026, 9, 18, 9) }), env, ctx);
  await waitOnExecutionContext(ctx);
  const keys = (await env.DB.prepare("select row_key from changes where row_key in ('old', 'new')").all()).results.map((r) => r.row_key);
  expect(keys).toEqual(["new"]);
});
```

- [ ] **Step 3: Run them to make sure they fail.**

Run: `npx vitest run --project workers tests/workers/vitals.test.ts tests/workers/scheduled.test.ts`

Expected: FAIL. The stub returns 405, and nothing prunes.

- [ ] **Step 4: Implement the endpoint.** Replace `app/routes/api.vitals.ts`:

```ts
import { z } from "zod";
import type { Route } from "./+types/api.vitals";
import { userD1 } from "~/server/current-user.server";

const Beacon = z.object({ route: z.string().max(200), inp: z.number().int().min(0).max(60_000), target: z.string().max(200).optional() });

export async function loader() {
  return new Response("Method not allowed", { status: 405 });
}

export async function action({ request }: Route.ActionArgs) {
  const parsed = Beacon.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return new Response(null, { status: 400 });
  const { route, inp, target } = parsed.data;
  await userD1().prepare("INSERT INTO vitals (route, inp_ms, target, at) VALUES (?, ?, ?, ?)").bind(route, inp, target ?? null, new Date().toISOString()).run();
  return new Response(null, { status: 204 });
}
```

- [ ] **Step 5: Report INP from the app.** In `app/routes/app-layout.tsx`, inside the component, add:

```tsx
useEffect(() => {
  // Real tap latency from this phone, sent once per page view when the browser reports it (Safari 26.2+).
  void import("web-vitals/attribution").then(({ onINP }) =>
    onINP((m) => {
      const body = JSON.stringify({ route: location.pathname, inp: Math.round(m.value), target: m.attribution.interactionTarget || undefined });
      navigator.sendBeacon("/api/vitals", new Blob([body], { type: "application/json" }));
    }),
  );
}, []);
```

Import `useEffect` from `react`.

- [ ] **Step 6: Prune on the weekly cron.** In `app/jobs/scheduled.ts`, inside the `BACKUP_CRON` branch, after each person's backup line, add:

```ts
        // Pull falls back to a full snapshot for anyone whose last pull is older than what is kept.
        await env[person.dbBinding].prepare("DELETE FROM changes WHERE at < ?").bind(new Date(now.getTime() - 30 * 86_400_000).toISOString()).run();
```

- [ ] **Step 7: Run the tests.**

Run: `npx vitest run --project workers tests/workers/vitals.test.ts tests/workers/scheduled.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit.**

```bash
git add package.json package-lock.json app/routes/api.vitals.ts app/routes/app-layout.tsx app/jobs/scheduled.ts tests/workers/vitals.test.ts tests/workers/scheduled.test.ts
git commit -m "Record real tap latency and prune the sync log weekly"
```

---

### Task 10: Full suite, deploy and verify on the wire

- [ ] **Step 1: Run the whole suite once.**

```bash
npm run typecheck && npm test
```

Expected: all green. Fix only the failing files, then re-run those files only.

- [ ] **Step 2: Push the branch and check the build.**

```bash
git push -u origin v2/f2-data-layer
```

The Workers Builds check on the branch must go green. Branch builds now run `npm run build` and `npx wrangler versions upload`, set in the dashboard on 2026-10-27. If it fails, read the log in the Cloudflare dashboard (Workers > rocky > Deployments > the build) before changing anything.

- [ ] **Step 3: Production migration (Kameron runs these).** Print this block and wait:

```bash
npx wrangler d1 migrations apply rocky-db --remote
npx wrangler d1 migrations apply rocky-db-catherine --remote
```

Both apply `0004` (tables) and `0005` (triggers). `rocky-core` has no new migrations.

- [ ] **Step 4: Open the PR, merge after Kameron's OK, and confirm the production build goes green.**

```bash
gh pr create --title "Rocky v2 F2: on-phone data layer" --body "<what changed, the migration Kameron ran, and the wire checks>"
```

- [ ] **Step 5: Verify on the wire (Kameron's iPhone).**
1. Open the installed app and go to Settings. It shows "Sync: up to date, <time>".
2. Log a weigh-in on Today (the v1 form). Within a minute, the server's change log has it:

    ```bash
    npx wrangler d1 execute rocky-db --remote --command "select version, table_name, row_key, op from changes order by version desc limit 3"
    ```

3. After using the app for a day:

    ```bash
    npx wrangler d1 execute rocky-db --remote --command "select route, count(*) n, max(inp_ms) worst from vitals group by route"
    ```

    Expected: rows from his phone.
4. Kameron's weigh-in count is unchanged from before the migration, apart from the new weigh-in.
