// The server's own AI bookkeeping (spec section 6, "ai_calls"): the person's switch, the daily caps, and one row per
// model call. Counts and reasons only: never a request, a note, a photo or a reply.
import { localDate } from "~/domain/dates";
import type { AiKind, AiReason, AiUsage } from "./claude.server";

/**
 * Model calls a person may make in a Chicago day. The take also stops at 3 stored writes a week (P5b); its daily cap
 * bounds a week of opens whose take keeps failing its check. The probe is the wire check's.
 */
export const DAILY_CAP: Record<AiKind, number> = { take: 6, describe: 30, label: 20, tell: 20, probe: 5 };

/** The person's AI switch. No row, or a row from before the switch, reads on. */
export async function aiSwitchOn(d1: D1Database): Promise<boolean> {
  const row = await d1.prepare("SELECT ai FROM profile WHERE id = 'me'").first<{ ai: number | null }>();
  return row?.ai !== 0;
}

/** Calls of a kind on `now`'s Chicago date. A Chicago day is 23 to 25 hours, so 26 hours back covers it. */
export async function callsToday(d1: D1Database, kind: AiKind, now: Date): Promise<number> {
  const since = new Date(now.getTime() - 26 * 3_600_000).toISOString();
  const { results } = await d1.prepare("SELECT at FROM ai_calls WHERE kind = ? AND at >= ?").bind(kind, since).all<{ at: string }>();
  const today = localDate(now);
  return results.filter((r) => localDate(new Date(r.at)) === today).length;
}

/**
 * The row for a call about to be made, written before the request leaves. The phone gives up after its wait and a
 * Worker whose client went away is cancelled, so a row written only after the reply would leave a billed call
 * uncounted. "unfinished" stays as the reason when no reply ever came back.
 */
export async function openAiCall(d1: D1Database, kind: AiKind, at: Date): Promise<number> {
  const row = await d1.prepare("INSERT INTO ai_calls (at, kind, ok, reason) VALUES (?, ?, 0, 'unfinished') RETURNING id").bind(at.toISOString(), kind).first<{ id: number }>();
  return row!.id;
}

/** The call's outcome, onto the row openAiCall wrote. */
export async function finishAiCall(d1: D1Database, id: number, call: { ok: boolean; reason: AiReason | null; usage: AiUsage | null }): Promise<void> {
  await d1
    .prepare("UPDATE ai_calls SET ok = ?, reason = ?, input_tokens = ?, output_tokens = ?, cache_read_tokens = ? WHERE id = ?")
    .bind(call.ok ? 1 : 0, call.reason, call.usage?.input ?? 0, call.usage?.output ?? 0, call.usage?.cacheRead ?? 0, id)
    .run();
}
