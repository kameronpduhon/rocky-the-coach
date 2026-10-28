import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AiResult } from "~/ai/claude.server";
import { callsToday, DAILY_CAP } from "~/ai/calls.server";
import { fakeAi, lastCall, seedCalls, withFakeAi } from "./fake-ai";
import { api, CATHERINE, postJson } from "./helpers";

const LINES = ["Week 3, Oct 19 to 25", "Trend weight 205.1 lb, down 0.4 lb this week"];
const USAGE = { input: 2500, output: 600, cacheRead: 0 };

/** A model call that stays out until the test settles it, as if the phone gave up and the Worker was cancelled. */
function hanging<T>() {
  let asked!: () => void;
  let settle!: (r: AiResult<T>) => void;
  const out = new Promise<void>((r) => (asked = r));
  const run = () => {
    asked();
    return new Promise<AiResult<T>>((r) => (settle = r));
  };
  return { out, run, settle: (r: AiResult<T>) => settle(r) };
}

let restore = () => {};
afterEach(() => restore());
beforeEach(async () => {
  await env.DB_CATHERINE.prepare("DELETE FROM ai_calls").run();
});

describe("a model call that hasn't answered", () => {
  it("already counts toward the take's daily cap, and its row is finished when it answers", async () => {
    const call = hanging<string>();
    const { client, calls } = fakeAi({ take: call.run });
    restore = withFakeAi(client);
    await seedCalls(env.DB_CATHERINE, "take", DAILY_CAP.take - 1);

    const first = api("/api/ai/take", postJson({ weekStart: "2026-10-19", lines: LINES, voice: "corner" }), CATHERINE);
    await call.out;
    expect(await callsToday(env.DB_CATHERINE, "take", new Date())).toBe(DAILY_CAP.take);
    expect(await lastCall(env.DB_CATHERINE)).toEqual({ kind: "take", ok: 0, reason: "unfinished", input_tokens: 0, output_tokens: 0, cache_read_tokens: 0 });
    const second = await api("/api/ai/take", postJson({ weekStart: "2026-10-26", lines: LINES, voice: "corner" }), CATHERINE);
    expect(second.status).toBe(429);
    expect(calls).toEqual(["take"]);

    call.settle({ ok: false, reason: "error", usage: null });
    await first;
    expect(await callsToday(env.DB_CATHERINE, "take", new Date())).toBe(DAILY_CAP.take);
    expect(await lastCall(env.DB_CATHERINE)).toEqual({ kind: "take", ok: 0, reason: "error", input_tokens: 0, output_tokens: 0, cache_read_tokens: 0 });
  });

  it("already counts toward describe's daily cap, and logs its usage once it answers", async () => {
    const call = hanging<{ name: string; category: "meal"; items: [] }>();
    const { client } = fakeAi({ describe: call.run });
    restore = withFakeAi(client);
    await seedCalls(env.DB_CATHERINE, "describe", DAILY_CAP.describe - 1);

    const first = api("/api/ai/describe", postJson({ text: "rice" }), CATHERINE);
    await call.out;
    expect((await api("/api/ai/describe", postJson({ text: "beans" }), CATHERINE)).status).toBe(429);

    call.settle({ ok: true, value: { name: "Rice", category: "meal", items: [] }, usage: USAGE });
    await first;
    expect(await callsToday(env.DB_CATHERINE, "describe", new Date())).toBe(DAILY_CAP.describe);
    expect(await lastCall(env.DB_CATHERINE)).toEqual({ kind: "describe", ok: 1, reason: null, input_tokens: 2500, output_tokens: 600, cache_read_tokens: 0 });
  });
});
