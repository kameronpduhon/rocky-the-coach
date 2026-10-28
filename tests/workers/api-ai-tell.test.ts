import { env } from "cloudflare:test";
import { afterEach, describe, expect, it } from "vitest";
import type { TellInput } from "~/ai/claude.server";
import type { RawProposal } from "~/ai/proposals";
import { fakeAi, lastCall, seedCalls, setSwitch, withFakeAi, withoutKey } from "./fake-ai";
import { api, CATHERINE, KAMERON, postJson } from "./helpers";

const LEGS = "wed-legs-shoulders";
const PRESS = "seated-dumbbell-shoulder-press";
const NOTE = "My left shoulder is sore, no overhead pressing this week";
const CONTEXT = {
  days: [{ date: "2026-10-28", weekday: "Wednesday", workout: "Legs, Shoulders", templateId: LEGS, logged: false }],
  templates: { [LEGS]: ["leg-press", "dumbbell-romanian-deadlift", "lying-leg-curl", "leg-extension", PRESS, "cable-lateral-raise"] },
};
const USAGE = { input: 3000, output: 600, cacheRead: 1100 };

const raw = (p: Partial<RawProposal>): RawProposal => ({ kind: "fact", templateId: null, replaces: null, exercise: null, scope: null, from: null, to: null, text: null, ...p });
const REPLY = [
  raw({ kind: "swap", templateId: LEGS, replaces: PRESS, exercise: "seated-lateral-raise", scope: "week" }),
  raw({ kind: "swap", templateId: LEGS, replaces: PRESS, exercise: "landmine-press", scope: "week" }),
  raw({ text: "Left shoulder sore, no overhead pressing" }),
];

const tell = (as: number = KAMERON, text = NOTE) => api("/api/ai/tell", postJson({ text, today: "2026-10-27", context: CONTEXT }), as);

let restore = () => {};
afterEach(() => restore());

describe("POST /api/ai/tell", () => {
  it("is a 401 signed out", async () => {
    expect((await api("/api/ai/tell", postJson({ text: NOTE, today: "2026-10-27", context: CONTEXT }))).status).toBe(401);
  });

  it("is a 503 with no key, a 403 with the switch off, and a 400 for an empty note, with no model call", async () => {
    restore = withoutKey();
    expect((await tell()).status).toBe(503);
    restore();
    const { client, calls } = fakeAi({});
    restore = withFakeAi(client);
    await setSwitch(env.DB, false);
    expect(await (await tell()).json()).toEqual({ fallback: "off" });
    await setSwitch(env.DB, true);
    expect((await tell(KAMERON, "   ")).status).toBe(400);
    expect(calls).toEqual([]);
  });

  it("returns only the proposals that pass the checks, and logs the call", async () => {
    const at = "2026-10-20T15:00:00.000Z";
    await env.DB.prepare(`INSERT INTO facts (client_id, text, dated, created_at, updated_at) VALUES ('f-1', 'No squats or lunges.', 0, '${at}', '${at}')`).run();
    const seen: TellInput[] = [];
    const { client } = fakeAi({
      tell: async (input: TellInput) => {
        seen.push(input);
        return { ok: true, value: { proposals: REPLY }, usage: USAGE };
      },
    });
    restore = withFakeAi(client);
    expect(await (await tell()).json()).toEqual({
      proposals: [
        { kind: "swap", templateId: LEGS, replaces: PRESS, exercise: "seated-lateral-raise", scope: "week" },
        { kind: "fact", text: "Left shoulder sore, no overhead pressing" },
      ],
    });
    expect(seen).toEqual([{ note: NOTE, today: "2026-10-27", context: CONTEXT, facts: ["No squats or lunges."], hasPlan: true }]);
    expect(await lastCall(env.DB)).toEqual({ kind: "tell", ok: 1, reason: null, input_tokens: 3000, output_tokens: 600, cache_read_tokens: 1100 });
  });

  it("asks only for facts, with no plan context, for someone with no plan", async () => {
    const seen: TellInput[] = [];
    const { client } = fakeAi({
      tell: async (input: TellInput) => {
        seen.push(input);
        return { ok: true, value: { proposals: REPLY }, usage: USAGE };
      },
    });
    restore = withFakeAi(client);
    expect(await (await tell(CATHERINE)).json()).toEqual({ proposals: [{ kind: "fact", text: "Left shoulder sore, no overhead pressing" }] });
    expect(seen[0]).toMatchObject({ hasPlan: false, context: { days: [], templates: {} } });
  });

  it("answers null proposals when the model fails, and logs why", async () => {
    const { client } = fakeAi({ tell: async () => ({ ok: false, reason: "bad-output", usage: USAGE }) });
    restore = withFakeAi(client);
    expect(await (await tell()).json()).toEqual({ proposals: null });
    expect(await lastCall(env.DB)).toEqual({ kind: "tell", ok: 0, reason: "bad-output", input_tokens: 3000, output_tokens: 600, cache_read_tokens: 1100 });
  });

  it("is a 429 past 20 notes in a day", async () => {
    const { client, calls } = fakeAi({});
    restore = withFakeAi(client);
    await seedCalls(env.DB, "tell", 20);
    const res = await tell();
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ fallback: "cap" });
    expect(calls).toEqual([]);
  });
});
