// The /api/ai/* routes (spec section 1, "Endpoints"). The router has already checked the session. Every route then
// runs aiGate (a key, the person's switch), parses its body, claims its ai_calls row under the daily cap, calls the
// model once, finishes the row, and answers. A model failure is a 200 with the route's fallback shape; the phone treats it like a timeout.
import { env } from "cloudflare:workers";
import { z } from "zod";
import { checkProposals } from "~/ai/proposals";
import { checkTake, takeHash } from "~/ai/take";
import { anthropicClient, type AiClient, type AiKind, type AiReason, type AiResult } from "~/ai/claude.server";
import { aiSwitchOn, callsToday, DAILY_CAP, finishAiCall, openAiCall } from "~/ai/calls.server";
import { UNREADABLE } from "~/ai/label";
import { NO_PLATE, tidyDescribe } from "~/ai/describe";
import { isFoodId } from "~/ai/food-table";
import { isISODate, weekday } from "~/domain/dates";
import { serverNow } from "~/server/clock.server";
import { currentUser, userD1 } from "~/server/current-user.server";

export interface AiDeps {
  key: () => string | undefined;
  client: (key: string) => AiClient;
}

const REAL: AiDeps = { key: () => env.ANTHROPIC_API_KEY || undefined, client: (key) => anthropicClient(key) };
let deps: AiDeps = REAL;

/** Tests swap in a fake model or a missing key. Returns the restore. */
export function setAiDeps(next: Partial<AiDeps>): () => void {
  deps = { ...deps, ...next };
  return () => {
    deps = REAL;
  };
}

export const NO_STORE = { "Cache-Control": "no-store" } as const;

const FALLBACK_STATUS = { "no-key": 503, off: 403, cap: 429 } as const;

export function fallback(why: keyof typeof FALLBACK_STATUS): Response {
  return Response.json({ fallback: why }, { status: FALLBACK_STATUS[why], headers: NO_STORE });
}

export interface AiCall {
  ai: AiClient;
  /** The signed-in person's database. */
  d1: D1Database;
  now: Date;
}

/** A key, then the person's switch. Removing the secret turns every AI path off within one request. */
export async function aiGate(): Promise<AiCall | Response> {
  const key = deps.key();
  if (!key) return fallback("no-key");
  const d1 = userD1();
  if (!(await aiSwitchOn(d1))) return fallback("off");
  return { ai: deps.client(key), d1, now: serverNow() };
}

export async function overCap(call: AiCall, kind: AiKind): Promise<boolean> {
  return (await callsToday(call.d1, kind, call.now)) >= DAILY_CAP[kind];
}

/**
 * Null past the kind's daily cap. Otherwise the id of this call's ai_calls row, written before the model is asked so a
 * call the phone gave up on (and the Worker was cancelled mid-way through) still counts toward the cap.
 */
export async function claim(call: AiCall, kind: AiKind): Promise<number | null> {
  if (await overCap(call, kind)) return null;
  return openAiCall(call.d1, kind, call.now);
}

/** The call's outcome onto its row. A reply the route's own check turned down is logged with that check's reason. */
export async function logged<T>(call: AiCall, row: number, result: AiResult<T>, refused: AiReason | null = null): Promise<void> {
  await finishAiCall(call.d1, row, { ok: result.ok && refused === null, reason: result.ok ? refused : result.reason, usage: result.usage });
}

/**
 * Whether the server has a key, with no model call; the phone keeps the answer for the page's life. `?probe=1` also
 * makes one tiny call through the same gate, so a deploy can be checked against Anthropic itself.
 */
export async function aiStatus(request: Request): Promise<Response> {
  const available = Boolean(deps.key());
  if (!available || new URL(request.url).searchParams.get("probe") !== "1") return Response.json({ available }, { headers: NO_STORE });
  const call = await aiGate();
  if (call instanceof Response) return call;
  const row = await claim(call, "probe");
  if (row === null) return fallback("cap");
  const result = await call.ai.probe();
  await logged(call, row, result);
  return Response.json({ available, probe: { ok: result.ok, reason: result.ok ? null : result.reason } }, { headers: NO_STORE });
}

// A label photo is at most 5,000,000 base64 characters (the schema's limit); the rest is a few bytes of JSON.
const LABEL_BODY_BYTES = 7_000_000;
const BODY_BYTES = 64 * 1024;

/**
 * The parsed JSON body, null when it isn't JSON, or a 413 past `max` bytes. Content-Length is checked before anything
 * is read; a body sent without one is measured as it arrives.
 */
async function jsonBody(request: Request, max = BODY_BYTES): Promise<{ json: unknown } | Response> {
  const tooBig = () => Response.json({ error: "Too big" }, { status: 413, headers: NO_STORE });
  if (Number(request.headers.get("Content-Length") ?? 0) > max) return tooBig();
  const bytes = await request.arrayBuffer().catch(() => null);
  if (!bytes) return { json: null };
  if (bytes.byteLength > max) return tooBig();
  try {
    return { json: JSON.parse(new TextDecoder().decode(bytes)) };
  } catch {
    return { json: null };
  }
}

/** What Rocky knows, oldest first, for a prompt. */
export async function factTexts(d1: D1Database): Promise<string[]> {
  return (await d1.prepare("SELECT text FROM facts ORDER BY created_at, client_id").all<{ text: string }>()).results.map((f) => f.text);
}

const TAKE_WRITES_PER_WEEK = 3;

const TakeBody = z.object({
  weekStart: z.string().refine((d) => isISODate(d) && weekday(d) === 1, "Not a Monday"),
  lines: z.array(z.string().min(1).max(300)).min(1).max(16),
  voice: z.enum(["corner", "plain"]),
});

/**
 * Rocky's take for a week (spec section 2). The same lines and voice read the stored take with no model call. A new
 * take is checked before it is stored; sync carries the row to the phones.
 */
export async function aiTake(request: Request): Promise<Response> {
  const call = await aiGate();
  if (call instanceof Response) return call;
  const sent = await jsonBody(request);
  if (sent instanceof Response) return sent;
  const body = TakeBody.safeParse(sent.json);
  if (!body.success) return Response.json({ error: "Bad take" }, { status: 400 });
  const { weekStart, lines, voice } = body.data;
  const hash = await takeHash(lines, voice);
  const stored = await call.d1.prepare("SELECT text, hash, writes FROM takes WHERE week_start = ?").bind(weekStart).first<{ text: string; hash: string; writes: number }>();
  if (stored?.hash === hash) return Response.json({ text: stored.text }, { headers: NO_STORE });
  if ((stored?.writes ?? 0) >= TAKE_WRITES_PER_WEEK) return fallback("cap");
  const facts = await factTexts(call.d1);
  const row = await claim(call, "take");
  if (row === null) return fallback("cap");

  const result = await call.ai.take({ lines, voice, facts });
  const check = result.ok ? checkTake(result.value, lines) : "ok";
  const refused = check === "ok" ? null : check;
  await logged(call, row, result, refused);
  if (!result.ok || refused) return Response.json({ text: null }, { headers: NO_STORE });

  await call.d1
    .prepare(
      "INSERT INTO takes (week_start, text, hash, voice, writes, written_at) VALUES (?, ?, ?, ?, 1, ?) " +
        "ON CONFLICT (week_start) DO UPDATE SET text = excluded.text, hash = excluded.hash, voice = excluded.voice, writes = takes.writes + 1, written_at = excluded.written_at",
    )
    .bind(weekStart, result.value, hash, voice, call.now.toISOString())
    .run();
  return Response.json({ text: result.value }, { headers: NO_STORE });
}

const TellBody = z.object({
  text: z.string().trim().min(1).max(500),
  today: z.string().refine(isISODate, "Not a date"),
  context: z.object({
    days: z
      .array(z.object({ date: z.string().max(10), weekday: z.string().max(12), workout: z.string().max(80), templateId: z.string().max(64).nullable(), logged: z.boolean() }))
      .max(8),
    templates: z.record(z.string().max(64), z.array(z.string().max(64)).max(30)).refine((t) => Object.keys(t).length <= 8, "Too many templates"),
  }),
});

/**
 * Tell Rocky (spec section 4): the model proposes, the content checks drop anything outside the plan or the library,
 * and the phone checks the rest against its copy before showing them. Without a plan only facts are asked for.
 */
export async function aiTell(request: Request): Promise<Response> {
  const call = await aiGate();
  if (call instanceof Response) return call;
  const sent = await jsonBody(request);
  if (sent instanceof Response) return sent;
  const body = TellBody.safeParse(sent.json);
  if (!body.success) return Response.json({ error: "Bad note" }, { status: 400 });
  const hasPlan = Boolean(currentUser().planKey);
  const { text, today, context } = body.data;
  const facts = await factTexts(call.d1);
  const row = await claim(call, "tell");
  if (row === null) return fallback("cap");
  const result = await call.ai.tell({ note: text, today, context: hasPlan ? context : { days: [], templates: {} }, facts, hasPlan });
  await logged(call, row, result);
  if (!result.ok) return Response.json({ proposals: null }, { headers: NO_STORE });
  return Response.json({ proposals: checkProposals(result.value.proposals, text, hasPlan) }, { headers: NO_STORE });
}

// Base64 of a JPEG under 5 MB, Anthropic's per-image limit. The phone sends 1,568 px at 0.8, a few hundred KB.
const LabelBody = z.object({ image: z.string().min(4).max(5_000_000).regex(/^[A-Za-z0-9+/]+={0,2}$/) });

/** A nutrition label from a photo (spec section 3, "Read the label"). The photo goes to the model and is kept nowhere. */
export async function aiLabel(request: Request): Promise<Response> {
  const call = await aiGate();
  if (call instanceof Response) return call;
  const sent = await jsonBody(request, LABEL_BODY_BYTES);
  if (sent instanceof Response) return sent;
  const body = LabelBody.safeParse(sent.json);
  if (!body.success) return Response.json({ error: "Bad photo" }, { status: 400, headers: NO_STORE });
  const row = await claim(call, "label");
  if (row === null) return fallback("cap");
  const result = await call.ai.label(body.data.image);
  await logged(call, row, result);
  return Response.json(result.ok ? result.value : UNREADABLE, { headers: NO_STORE });
}

const DescribeBody = z.object({ text: z.string().trim().min(1).max(300) });

/** A described meal as food-table foods (spec section 3, "Describe it"). Every number on the plate comes from the table. */
export async function aiDescribe(request: Request): Promise<Response> {
  const call = await aiGate();
  if (call instanceof Response) return call;
  const sent = await jsonBody(request);
  if (sent instanceof Response) return sent;
  const body = DescribeBody.safeParse(sent.json);
  if (!body.success) return Response.json({ error: "Bad description" }, { status: 400, headers: NO_STORE });
  const row = await claim(call, "describe");
  if (row === null) return fallback("cap");
  const result = await call.ai.describe(body.data.text);
  await logged(call, row, result);
  return Response.json(result.ok ? tidyDescribe(result.value, isFoodId) : NO_PLATE, { headers: NO_STORE });
}
