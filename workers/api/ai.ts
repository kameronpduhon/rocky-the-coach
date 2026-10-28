// The /api/ai/* routes (spec section 1, "Endpoints"). The router has already checked the session. Every route then
// runs aiGate (a key, the person's switch), parses its body, checks its daily cap, calls the model once, logs the
// call, and answers. A model failure is a 200 with the route's fallback shape; the phone treats it like a timeout.
import { env } from "cloudflare:workers";
import { anthropicClient, type AiClient, type AiKind, type AiReason, type AiResult } from "~/ai/claude.server";
import { aiSwitchOn, callsToday, DAILY_CAP, logAiCall } from "~/ai/calls.server";
import { serverNow } from "~/server/clock.server";
import { userD1 } from "~/server/current-user.server";

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

/** One ai_calls row for the call. A reply the route's own check turned down is logged with that check's reason. */
export async function logged<T>(call: AiCall, kind: AiKind, result: AiResult<T>, refused: AiReason | null = null): Promise<void> {
  await logAiCall(call.d1, { kind, at: call.now, ok: result.ok && refused === null, reason: result.ok ? refused : result.reason, usage: result.usage });
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
  if (await overCap(call, "probe")) return fallback("cap");
  const result = await call.ai.probe();
  await logged(call, "probe", result);
  return Response.json({ available, probe: { ok: result.ok, reason: result.ok ? null : result.reason } }, { headers: NO_STORE });
}
