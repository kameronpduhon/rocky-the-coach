// The phone's side of the AI routes. Every failure (no key, switch off, cap, lost signal, slow model) comes back as
// null, and each screen shows its rule-written or typed path for null. No AI request is ever queued or retried.

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
