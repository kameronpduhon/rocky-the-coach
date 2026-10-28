import { z } from "zod";
import { getDb } from "~/db/client";
import { daysBetween, isISODate, localDate, weekStart } from "~/domain/dates";
import { ensureWeekPlan } from "~/server/meal-plan.server";
import { MutationRejected, runMutation, type MutationContext } from "./mutators";
import { ServerTx, StorageError } from "./server-tx.server";

export const PushBody = z.object({
  clientId: z.string().min(8).max(64),
  mutations: z.array(z.object({ id: z.number().int().positive(), name: z.string(), args: z.unknown() })).max(500),
});
export type PushBody = z.infer<typeof PushBody>;
export type PushResult = { lastMutationId: number; rejected: { id: number; message: string }[] };

export async function lastMutationId(d1: D1Database, clientId: string): Promise<number> {
  return (await d1.prepare("SELECT last_mutation_id AS n FROM sync_clients WHERE client_id = ?").bind(clientId).first<{ n: number }>())?.n ?? 0;
}

// These write planned_meals rows. ensureWeekPlan takes a week with any row as generated, so a row landing in a week
// nobody has opened yet would stop the rest of it being planned. Generate the week first.
const WRITES_PLANNED_MEALS = new Set(["swapMeal", "startBatch"]);

async function generateWeekFirst(d1: D1Database, name: string, args: unknown, ctx: MutationContext): Promise<void> {
  if (!WRITES_PLANNED_MEALS.has(name)) return;
  const date = (args as { date?: unknown } | null)?.date;
  // A date the change refuses anyway (malformed, or past tomorrow) generates nothing.
  if (!isISODate(date) || daysBetween(ctx.today, date) > 1) return;
  try {
    await ensureWeekPlan(getDb(d1), weekStart(date));
  } catch (err) {
    throw new StorageError(String(err));
  }
}

/** Applies a phone's queued changes to one person's database, each in its own atomic batch. */
export async function processPush(d1: D1Database, body: PushBody, now: Date, run: typeof runMutation = runMutation): Promise<PushResult> {
  let last = await lastMutationId(d1, body.clientId);
  const rejected: PushResult["rejected"] = [];
  const ctx = { now: now.toISOString(), today: localDate(now) };
  for (const m of [...body.mutations].sort((a, b) => a.id - b.id)) {
    if (m.id <= last) continue;
    await generateWeekFirst(d1, m.name, m.args, ctx);
    const tx = new ServerTx(d1);
    try {
      await run(tx, m.name, m.args, ctx);
    } catch (err) {
      if (err instanceof StorageError) throw err;
      // A change that crashes its mutator would otherwise fail every push from that phone forever.
      if (!(err instanceof MutationRejected)) console.error(`[sync] ${m.name} crashed`, err);
      rejected.push({ id: m.id, message: err instanceof MutationRejected ? err.message : "Something went wrong saving it." });
      tx.statements.length = 0;
    }
    const ack = d1
      .prepare("INSERT INTO sync_clients (client_id, last_mutation_id) VALUES (?, ?) ON CONFLICT (client_id) DO UPDATE SET last_mutation_id = excluded.last_mutation_id")
      .bind(body.clientId, m.id);
    try {
      await d1.batch([...tx.statements, ack]);
    } catch (err) {
      // A constraint is the change's own fault and will fail the same way every time. Anything else is retried.
      if (tx.statements.length === 0 || !/constraint/i.test(String(err))) throw err;
      console.error(`[sync] ${m.name} hit a constraint`, err);
      rejected.push({ id: m.id, message: "It clashes with something already saved." });
      await d1.batch([ack]);
    }
    last = m.id;
  }
  return { lastMutationId: last, rejected };
}
