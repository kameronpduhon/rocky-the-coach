import { afterEach, describe, expect, it } from "vitest";
import { aiAvailable, cachedAiStatus, forgetAiStatus, postAi } from "~/ai/client";

afterEach(() => forgetAiStatus());

const answering = (body: unknown, status = 200) => (async () => Response.json(body, { status })) as typeof fetch;
const offline = (async () => {
  throw new TypeError("Failed to fetch");
}) as typeof fetch;

describe("aiAvailable", () => {
  it("asks the server once a page load, then answers from memory", async () => {
    let asks = 0;
    const send = (async () => {
      asks++;
      return Response.json({ available: true });
    }) as typeof fetch;
    expect(cachedAiStatus()).toBeNull();
    expect(await aiAvailable(send)).toBe(true);
    expect(await aiAvailable(send)).toBe(true);
    expect(asks).toBe(1);
    expect(cachedAiStatus()).toBe(true);
  });

  it("keeps the server's no", async () => {
    expect(await aiAvailable(answering({ available: false }))).toBe(false);
    expect(cachedAiStatus()).toBe(false);
  });

  it("answers null when it couldn't ask, and keeps nothing, so the next screen asks again", async () => {
    expect(await aiAvailable(offline)).toBeNull();
    expect(await aiAvailable(answering({ error: "Signed out" }, 401))).toBeNull();
    expect(cachedAiStatus()).toBeNull();
  });
});

describe("postAi", () => {
  it("posts JSON and returns the reply", async () => {
    let sent: RequestInit | undefined;
    const send = (async (_: unknown, init?: RequestInit) => {
      sent = init;
      return Response.json({ text: "Every day counted." });
    }) as typeof fetch;
    expect(await postAi("/api/ai/take", { weekStart: "2026-10-19" }, 1000, send)).toEqual({ text: "Every day counted." });
    expect(sent).toMatchObject({ method: "POST", headers: { "Content-Type": "application/json" }, body: '{"weekStart":"2026-10-19"}' });
  });

  it("returns null for a fallback status, a lost signal or a timeout", async () => {
    for (const [status, why] of [[503, "no-key"], [403, "off"], [429, "cap"]] as const) {
      expect(await postAi("/api/ai/take", {}, 1000, answering({ fallback: why }, status))).toBeNull();
    }
    expect(await postAi("/api/ai/take", {}, 1000, offline)).toBeNull();
    const never = ((_: unknown, init?: RequestInit) =>
      new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError"))))) as typeof fetch;
    expect(await postAi("/api/ai/take", {}, 20, never)).toBeNull();
  });
});
