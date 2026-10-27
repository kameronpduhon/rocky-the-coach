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
