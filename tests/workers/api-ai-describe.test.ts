import { env } from "cloudflare:test";
import { afterEach, describe, expect, it } from "vitest";
import { fakeAi, lastCall, seedCalls, setSwitch, withFakeAi, withoutKey } from "./fake-ai";
import { api, CATHERINE, KAMERON, postJson } from "./helpers";

const USAGE = { input: 8000, output: 800, cacheRead: 6700 };
const describeIt = (text: unknown, as: number = KAMERON) => api("/api/ai/describe", postJson({ text }), as);

let restore = () => {};
afterEach(() => restore());

// Tests in this file share storage and run in order: the cap test is last.
describe("POST /api/ai/describe", () => {
  it("is a 401 signed out", async () => {
    expect((await api("/api/ai/describe", postJson({ text: "rice" }))).status).toBe(401);
  });

  it("falls back with no key or the switch off, and asks the model nothing", async () => {
    const { client, calls } = fakeAi({});
    restore = withoutKey();
    expect((await describeIt("rice")).status).toBe(503);
    restore();
    restore = withFakeAi(client);
    await setSwitch(env.DB_CATHERINE, false);
    expect((await describeIt("rice", CATHERINE)).status).toBe(403);
    await setSwitch(env.DB_CATHERINE, true);
    expect(calls).toEqual([]);
  });

  it("refuses an empty or over-long description with a 400", async () => {
    const { client, calls } = fakeAi({});
    restore = withFakeAi(client);
    expect((await describeIt("   ")).status).toBe(400);
    expect((await describeIt("x".repeat(301))).status).toBe(400);
    expect(calls).toEqual([]);
  });

  it("returns the foods tidied to the food table, and logs the call with its cache reads", async () => {
    let asked = "";
    const { client } = fakeAi({
      describe: async (text: string) => {
        asked = text;
        return {
          ok: true,
          value: {
            name: "Chipotle bowl",
            category: "meal",
            items: [
              { label: "Black beans", foodId: "black-beans-cooked", grams: 120 },
              { label: "Coconut aminos", foodId: "coconut-aminos", grams: 15 },
              { label: "Rice", foodId: "white-rice-cooked", grams: 2500 },
            ],
          },
          usage: USAGE,
        };
      },
    });
    restore = withFakeAi(client);
    const res = await describeIt("  Chipotle bowl, black beans, rice  ");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toEqual({
      name: "Chipotle bowl",
      category: "meal",
      items: [
        { label: "Black beans", foodId: "black-beans-cooked", grams: 120 },
        { label: "Coconut aminos", foodId: null, grams: 15 },
        { label: "Rice", foodId: "white-rice-cooked", grams: 2000 },
      ],
    });
    expect(asked).toBe("Chipotle bowl, black beans, rice");
    expect(await lastCall(env.DB)).toEqual({ kind: "describe", ok: 1, reason: null, input_tokens: 8000, output_tokens: 800, cache_read_tokens: 6700 });
  });

  it("answers a model failure with no plate, 200, and logs why", async () => {
    const { client } = fakeAi({ describe: async () => ({ ok: false, reason: "bad-output", usage: USAGE }) });
    restore = withFakeAi(client);
    const res = await describeIt("rice");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ items: null });
    expect(await lastCall(env.DB)).toMatchObject({ kind: "describe", ok: 0, reason: "bad-output" });
  });

  it("refuses a 31st describe in a day with a 429", async () => {
    const { client, calls } = fakeAi({});
    restore = withFakeAi(client);
    await seedCalls(env.DB, "describe", 30);
    const res = await describeIt("rice");
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ fallback: "cap" });
    expect(calls).toEqual([]);
  });
});
