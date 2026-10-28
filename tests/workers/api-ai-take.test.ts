import { env } from "cloudflare:test";
import { afterEach, describe, expect, it } from "vitest";
import type { TakeInput } from "~/ai/claude.server";
import { fakeAi, lastCall, seedCalls, setSwitch, withFakeAi, withoutKey } from "./fake-ai";
import { api, CATHERINE, KAMERON, postJson } from "./helpers";

const LINES = ["Week 3, Oct 19 to 25", "Trend weight 205.1 lb, down 0.4 lb this week", "The call: trim 100, from 2,400 to 2,300 cal a day from Monday"];
// takeHash(LINES, voice), worked out with node:crypto.
const CORNER = "c24a4bf682abf6ea";
const PLAIN = "a528a5f3f63943db";
const GOOD = "Trend down 0.4 lb this week. I'm trimming 100, so it's 2,300 from Monday.";
const USAGE = { input: 2500, output: 600, cacheRead: 0 };

const take = (weekStart: string, voice = "corner", as: number = KAMERON) => api("/api/ai/take", postJson({ weekStart, lines: LINES, voice }), as);
const takeRow = (week: string) => env.DB.prepare("SELECT text, hash, voice, writes FROM takes WHERE week_start = ?").bind(week).first();
const writes = (text: string) => async () => ({ ok: true as const, value: text, usage: USAGE });

let restore = () => {};
afterEach(() => restore());

describe("POST /api/ai/take", () => {
  it("is a 401 signed out", async () => {
    expect((await api("/api/ai/take", postJson({ weekStart: "2026-10-19", lines: LINES, voice: "corner" }))).status).toBe(401);
  });

  it("is a 503 with no key, a 403 with the switch off, and a 400 for a bad body, with no model call", async () => {
    restore = withoutKey();
    const noKey = await take("2026-10-19");
    expect(noKey.status).toBe(503);
    expect(await noKey.json()).toEqual({ fallback: "no-key" });
    restore();
    const { client, calls } = fakeAi({});
    restore = withFakeAi(client);
    await setSwitch(env.DB, false);
    const off = await take("2026-10-19");
    expect(off.status).toBe(403);
    expect(await off.json()).toEqual({ fallback: "off" });
    await setSwitch(env.DB, true);
    expect((await api("/api/ai/take", postJson({ weekStart: "2026-10-20", lines: [], voice: "loud" }), KAMERON)).status).toBe(400);
    expect(calls).toEqual([]);
  });

  it("writes the take with What Rocky knows, keeps it for the week, and logs the call", async () => {
    const at = "2026-10-20T15:00:00.000Z";
    await env.DB.prepare(`INSERT INTO facts (client_id, text, dated, created_at, updated_at) VALUES ('f-1', 'No squats or lunges.', 0, '${at}', '${at}')`).run();
    const seen: TakeInput[] = [];
    const { client, calls } = fakeAi({
      take: async (input: TakeInput) => {
        seen.push(input);
        return { ok: true, value: GOOD, usage: USAGE };
      },
    });
    restore = withFakeAi(client);

    expect(await (await take("2026-10-19")).json()).toEqual({ text: GOOD });
    expect(seen).toEqual([{ lines: LINES, voice: "corner", facts: ["No squats or lunges."] }]);
    expect(await takeRow("2026-10-19")).toEqual({ text: GOOD, hash: CORNER, voice: "corner", writes: 1 });
    expect(await lastCall(env.DB)).toEqual({ kind: "take", ok: 1, reason: null, input_tokens: 2500, output_tokens: 600, cache_read_tokens: 0 });

    // A reload with the same lines and voice reads the stored take, with no model call.
    expect(await (await take("2026-10-19")).json()).toEqual({ text: GOOD });
    expect(calls).toEqual(["take"]);
  });

  it("writes again for a new voice, up to 3 writes a week", async () => {
    const { client, calls } = fakeAi({ take: writes(GOOD) });
    restore = withFakeAi(client);
    await take("2026-10-12", "corner");
    await take("2026-10-12", "plain");
    expect(await takeRow("2026-10-12")).toEqual({ text: GOOD, hash: PLAIN, voice: "plain", writes: 2 });
    await take("2026-10-12", "corner");
    const fourth = await take("2026-10-12", "plain");
    expect(fourth.status).toBe(429);
    expect(await fourth.json()).toEqual({ fallback: "cap" });
    expect(await takeRow("2026-10-12")).toEqual({ text: GOOD, hash: CORNER, voice: "corner", writes: 3 });
    expect(calls).toEqual(["take", "take", "take"]);
  });

  it("stores nothing for a take with a number not in the lines, and logs why", async () => {
    const { client } = fakeAi({ take: writes("Trend down 0.4 lb. I'm trimming 150 from Monday.") });
    restore = withFakeAi(client);
    expect(await (await take("2026-10-05")).json()).toEqual({ text: null });
    expect(await takeRow("2026-10-05")).toBeNull();
    expect(await lastCall(env.DB)).toEqual({ kind: "take", ok: 0, reason: "numbers", input_tokens: 2500, output_tokens: 600, cache_read_tokens: 0 });
  });

  it("falls back when the model fails, and logs the reason", async () => {
    const { client } = fakeAi({ take: async () => ({ ok: false, reason: "refusal", usage: null }) });
    restore = withFakeAi(client);
    expect(await (await take("2026-09-28")).json()).toEqual({ text: null });
    expect(await lastCall(env.DB)).toEqual({ kind: "take", ok: 0, reason: "refusal", input_tokens: 0, output_tokens: 0, cache_read_tokens: 0 });
  });

  it("is a 429 past 6 take calls in a day", async () => {
    const { client, calls } = fakeAi({ take: writes(GOOD) });
    restore = withFakeAi(client);
    await seedCalls(env.DB_CATHERINE, "take", 6);
    const res = await take("2026-10-19", "corner", CATHERINE);
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ fallback: "cap" });
    expect(calls).toEqual([]);
  });
});
