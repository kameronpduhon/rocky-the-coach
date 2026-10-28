// The phone's side of the AI routes. Every failure (no key, switch off, cap, lost signal, slow model) comes back as
// null, and each screen shows its rule-written or typed path for null. No AI request is ever queued or retried.
import { z } from "zod";
import type { Product } from "./barcode";
import { DescribeSchema, type DescribeReply } from "./describe";
import { LabelSchema, type LabelRead } from "./label";
import { PHONE_WAIT_MS } from "./waits";

const STATUS_WAIT_MS = 5_000;
let known: boolean | null = null;

/** Whether the server has a key, as last heard this page load. Null until it has answered. */
export function cachedAiStatus(): boolean | null {
  return known;
}

/** For tests: forget the answer, as a new page load would. */
export function forgetAiStatus(): void {
  known = null;
}

/**
 * Asks /api/ai/status once a page load. The server's answer is kept; a failed ask (offline, signed out, slow) is null
 * and isn't kept, so the next screen asks again.
 */
export async function aiAvailable(send: typeof fetch = fetch): Promise<boolean | null> {
  if (known !== null) return known;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), STATUS_WAIT_MS);
  try {
    const res = await send("/api/ai/status", { signal: ctrl.signal });
    if (!res.ok) return null;
    known = ((await res.json()) as { available?: unknown }).available === true;
    return known;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** POSTs to an AI route and waits up to `timeoutMs`. Null for any status but 200, no signal, or no answer in time. */
export async function postAi<T>(path: string, body: unknown, timeoutMs: number, send: typeof fetch = fetch): Promise<T | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await send(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ctrl.signal });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const BARCODE_MS = 10_000;
const LABEL_MS = PHONE_WAIT_MS.label;

/** JSON from a GET, or null for no signal, a timeout, a non-200 answer or a body that isn't JSON. */
async function getWithin(path: string, timeoutMs: number, send: typeof fetch): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await send(path, { signal: ctrl.signal });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const ProductSchema = z.object({
  code: z.string(),
  name: z.string(),
  servingText: z.string().nullable(),
  kcal: z.number(),
  proteinG: z.number(),
  drink: z.boolean(),
});
const BarcodeSchema = z.union([z.object({ found: z.literal(true), product: ProductSchema }), z.object({ found: z.literal(false), down: z.boolean().optional() })]);

export type BarcodeLookup = { found: true; product: Product } | { found: false; down: boolean };

/** A scanned code looked up through the Worker. No signal and a slow Open Food Facts both read as down. */
export async function findBarcode(code: string, timeoutMs = BARCODE_MS, send: typeof fetch = fetch): Promise<BarcodeLookup> {
  const parsed = BarcodeSchema.safeParse(await getWithin(`/api/food/barcode/${code}`, timeoutMs, send));
  if (!parsed.success) return { found: false, down: true };
  return parsed.data.found ? parsed.data : { found: false, down: parsed.data.down === true };
}

/** What the label photo says, or null for any fallback: the caller shows "Couldn't read that label." */
export async function readLabel(image: string, timeoutMs = LABEL_MS, send: typeof fetch = fetch): Promise<LabelRead | null> {
  const parsed = LabelSchema.safeParse(await postAi<unknown>("/api/ai/label", { image }, timeoutMs, send));
  return parsed.success ? parsed.data : null;
}

const DESCRIBE_MS = PHONE_WAIT_MS.describe;

/** The model's foods for a description, or null for any fallback (P5a's postAi) or no plate. The phone computes every number from the table. */
export async function describeMeal(text: string, timeoutMs = DESCRIBE_MS, send: typeof fetch = fetch): Promise<DescribeReply | null> {
  const parsed = DescribeSchema.safeParse(await postAi<unknown>("/api/ai/describe", { text }, timeoutMs, send));
  return parsed.success ? parsed.data : null;
}
