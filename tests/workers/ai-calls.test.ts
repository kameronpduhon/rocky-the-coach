import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { aiSwitchOn, callsToday, finishAiCall, openAiCall } from "~/ai/calls.server";

describe("ai_calls", () => {
  it("logs counts only, and counts a kind's calls on today's Chicago date, finished or not", async () => {
    const noon = new Date("2026-10-28T17:00:00Z");
    // Oct 27 at 11:30pm in Chicago, so yesterday's.
    await finishAiCall(env.DB, await openAiCall(env.DB, "tell", new Date("2026-10-28T04:30:00Z")), { ok: true, reason: null, usage: { input: 3000, output: 600, cacheRead: 1200 } });
    // Oct 28 at 12:30am.
    await finishAiCall(env.DB, await openAiCall(env.DB, "tell", new Date("2026-10-28T05:30:00Z")), { ok: false, reason: "refusal", usage: null });
    await finishAiCall(env.DB, await openAiCall(env.DB, "take", noon), { ok: true, reason: null, usage: { input: 2500, output: 600, cacheRead: 0 } });
    // No answer yet, or the Worker was cancelled before one came.
    await openAiCall(env.DB, "take", noon);

    expect(await callsToday(env.DB, "tell", noon)).toBe(1);
    expect(await callsToday(env.DB, "take", noon)).toBe(2);
    expect(await callsToday(env.DB, "label", noon)).toBe(0);
    expect((await env.DB.prepare("SELECT at, kind, ok, reason, input_tokens, output_tokens, cache_read_tokens FROM ai_calls ORDER BY id").all()).results).toEqual([
      { at: "2026-10-28T04:30:00.000Z", kind: "tell", ok: 1, reason: null, input_tokens: 3000, output_tokens: 600, cache_read_tokens: 1200 },
      { at: "2026-10-28T05:30:00.000Z", kind: "tell", ok: 0, reason: "refusal", input_tokens: 0, output_tokens: 0, cache_read_tokens: 0 },
      { at: "2026-10-28T17:00:00.000Z", kind: "take", ok: 1, reason: null, input_tokens: 2500, output_tokens: 600, cache_read_tokens: 0 },
      { at: "2026-10-28T17:00:00.000Z", kind: "take", ok: 0, reason: "unfinished", input_tokens: 0, output_tokens: 0, cache_read_tokens: 0 },
    ]);
  });

  it("reads the switch on with no profile row, on by default, and off once set", async () => {
    const d1 = env.DB_CATHERINE;
    await d1.prepare("DELETE FROM profile").run();
    expect(await aiSwitchOn(d1)).toBe(true);
    await d1.prepare("INSERT INTO profile (id, voice) VALUES ('me', 'plain')").run();
    expect(await aiSwitchOn(d1)).toBe(true);
    await d1.prepare("UPDATE profile SET ai = 0").run();
    expect(await aiSwitchOn(d1)).toBe(false);
  });
});
