import { env } from "cloudflare:test";
import { afterEach, describe, expect, it } from "vitest";
import { UNREADABLE } from "~/ai/label";
import { fakeAi, lastCall, seedCalls, setSwitch, withFakeAi, withoutKey } from "./fake-ai";
import { api, CATHERINE, KAMERON, postJson } from "./helpers";

const READ = { readable: true, name: "Barebells protein bar, cookies and cream", servingText: "1 bar (55 g)", servingGrams: 55, kcal: 200, proteinG: 20 };
const USAGE = { input: 2000, output: 400, cacheRead: 0 };
const label = (image: unknown, as: number = KAMERON) => api("/api/ai/label", postJson({ image }), as);

let restore = () => {};
afterEach(() => restore());

// Tests in this file share storage and run in order: the cap test is last.
describe("POST /api/ai/label", () => {
  it("is a 401 signed out", async () => {
    expect((await api("/api/ai/label", postJson({ image: "AAAA" }))).status).toBe(401);
  });

  it("falls back with no key or the switch off, and asks the model nothing", async () => {
    const { client, calls } = fakeAi({});
    restore = withoutKey();
    expect((await label("AAAA")).status).toBe(503);
    restore();
    restore = withFakeAi(client);
    await setSwitch(env.DB_CATHERINE, false);
    const off = await label("AAAA", CATHERINE);
    expect(off.status).toBe(403);
    expect(await off.json()).toEqual({ fallback: "off" });
    await setSwitch(env.DB_CATHERINE, true);
    expect(calls).toEqual([]);
  });

  it("refuses a missing, non-base64 or oversized photo with a 400", async () => {
    const { client, calls } = fakeAi({});
    restore = withFakeAi(client);
    expect((await label(undefined)).status).toBe(400);
    expect((await label("not base64!")).status).toBe(400);
    expect((await label("A".repeat(5_000_004))).status).toBe(400);
    expect(calls).toEqual([]);
  });

  it("returns what the label says and logs the call with its usage", async () => {
    let sentImage = "";
    const { client } = fakeAi({
      label: async (image: string) => {
        sentImage = image;
        return { ok: true, value: READ, usage: USAGE };
      },
    });
    restore = withFakeAi(client);
    const res = await label("/9j/4AAQSkZJRg==");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toEqual(READ);
    expect(sentImage).toBe("/9j/4AAQSkZJRg==");
    expect(await lastCall(env.DB)).toEqual({ kind: "label", ok: 1, reason: null, input_tokens: 2000, output_tokens: 400, cache_read_tokens: 0 });
  });

  it("answers a model failure with an unreadable label, 200, and logs why", async () => {
    const { client } = fakeAi({ label: async () => ({ ok: false, reason: "refusal", usage: null }) });
    restore = withFakeAi(client);
    const res = await label("AAAA");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(UNREADABLE);
    expect(await lastCall(env.DB)).toMatchObject({ kind: "label", ok: 0, reason: "refusal" });
  });

  it("refuses a 21st label in a day with a 429", async () => {
    const { client, calls } = fakeAi({});
    restore = withFakeAi(client);
    await seedCalls(env.DB, "label", 20);
    const res = await label("AAAA");
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ fallback: "cap" });
    expect(calls).toEqual([]);
  });
});
