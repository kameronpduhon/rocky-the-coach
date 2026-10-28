import { env } from "cloudflare:test";
import { afterEach, describe, expect, it } from "vitest";
import { fakeAi, lastCall, seedCalls, setSwitch, USAGE, withFakeAi, withoutKey } from "./fake-ai";
import { api, CATHERINE, KAMERON } from "./helpers";

let restore = () => {};
afterEach(() => restore());

// Tests in this file share storage and run in order: the cap test is last.
describe("GET /api/ai/status", () => {
  it("is a 401 signed out", async () => {
    expect((await api("/api/ai/status")).status).toBe(401);
  });

  it("says unavailable with no key, even when asked to probe", async () => {
    restore = withoutKey();
    expect(await (await api("/api/ai/status", {}, KAMERON)).json()).toEqual({ available: false });
    expect(await (await api("/api/ai/status?probe=1", {}, KAMERON)).json()).toEqual({ available: false });
  });

  it("says available with a key, never cached, and makes no model call", async () => {
    const { client, calls } = fakeAi({});
    restore = withFakeAi(client);
    const res = await api("/api/ai/status", {}, KAMERON);
    expect(await res.json()).toEqual({ available: true });
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(calls).toEqual([]);
  });

  it("probes the model on ?probe=1 and logs the call with its usage", async () => {
    const { client, calls } = fakeAi({ probe: async () => ({ ok: true, value: "ready", usage: USAGE }) });
    restore = withFakeAi(client);
    expect(await (await api("/api/ai/status?probe=1", {}, KAMERON)).json()).toEqual({ available: true, probe: { ok: true, reason: null } });
    expect(calls).toEqual(["probe"]);
    expect(await lastCall(env.DB)).toEqual({ kind: "probe", ok: 1, reason: null, input_tokens: 40, output_tokens: 12, cache_read_tokens: 0 });
  });

  it("reports a failed probe and logs why", async () => {
    const { client } = fakeAi({ probe: async () => ({ ok: false, reason: "refusal", usage: null }) });
    restore = withFakeAi(client);
    expect(await (await api("/api/ai/status?probe=1", {}, KAMERON)).json()).toEqual({ available: true, probe: { ok: false, reason: "refusal" } });
    expect(await lastCall(env.DB)).toEqual({ kind: "probe", ok: 0, reason: "refusal", input_tokens: 0, output_tokens: 0, cache_read_tokens: 0 });
  });

  it("refuses a probe with the switch off, while plain status still answers", async () => {
    const { client, calls } = fakeAi({});
    restore = withFakeAi(client);
    await setSwitch(env.DB_CATHERINE, false);
    const res = await api("/api/ai/status?probe=1", {}, CATHERINE);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ fallback: "off" });
    expect(await (await api("/api/ai/status", {}, CATHERINE)).json()).toEqual({ available: true });
    expect(calls).toEqual([]);
    await setSwitch(env.DB_CATHERINE, true);
  });

  it("refuses a sixth probe in a day with a 429", async () => {
    const { client, calls } = fakeAi({});
    restore = withFakeAi(client);
    await seedCalls(env.DB, "probe", 5);
    const res = await api("/api/ai/status?probe=1", {}, KAMERON);
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ fallback: "cap" });
    expect(calls).toEqual([]);
  });
});
