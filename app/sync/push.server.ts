import { z } from "zod";
import { localDate } from "~/domain/dates";
import { MutationRejected, runMutation } from "./mutators";
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

/** Applies a phone's queued changes to one person's database, each in its own atomic batch. */
export async function processPush(d1: D1Database, body: PushBody, now: Date, run: typeof runMutation = runMutation): Promise<PushResult> {
  let last = await lastMutationId(d1, body.clientId);
  const rejected: PushResult["rejected"] = [];
  const ctx = { now: now.toISOString(), today: localDate(now) };
  for (const m of [...body.mutations].sort((a, b) => a.id - b.id)) {
    if (m.id <= last) continue;
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
