import { describe, expect, it } from "vitest";
import { anthropicClient, type TellInput } from "~/ai/claude.server";
import { libraryBlock, tellRules, tellUser } from "~/ai/prompts.server";
import { COACH_NAME } from "~/brand";
import { fakeFetch, message, USAGE } from "./fake-anthropic";

const LEGS = "wed-legs-shoulders";
const NOTE = "My left shoulder is sore, no overhead pressing this week";
const INPUT: TellInput = {
  note: NOTE,
  today: "2026-10-27",
  context: {
    days: [
      { date: "2026-10-27", weekday: "Tuesday", workout: "rest", templateId: null, logged: false },
      { date: "2026-10-28", weekday: "Wednesday", workout: "Legs, Shoulders", templateId: LEGS, logged: false },
    ],
    templates: { [LEGS]: ["leg-press", "seated-dumbbell-shoulder-press"] },
  },
  facts: ["No squats or lunges."],
  hasPlan: true,
};
const REPLY = { proposals: [{ kind: "fact", templateId: null, replaces: null, exercise: null, scope: null, from: null, to: null, text: "Left shoulder sore" }] };

describe("AiClient.tell", () => {
  it("asks at low effort for the proposal schema, with the library as a cached block", async () => {
    const { sent, fetch } = fakeFetch(() => message({ content: [{ type: "text", text: JSON.stringify(REPLY) }] }));
    expect(await anthropicClient("k", { fetch, maxRetries: 0 }).tell(INPUT)).toEqual({ ok: true, value: REPLY, usage: USAGE });
    expect(sent[0].body).toMatchObject({
      max_tokens: 6000,
      output_config: { effort: "low", format: { type: "json_schema" } },
      system: [
        { type: "text", text: tellRules(true) },
        { type: "text", text: libraryBlock(), cache_control: { type: "ephemeral" } },
      ],
      messages: [{ role: "user", content: [{ type: "text", text: tellUser(INPUT) }] }],
    });
  });

  it("writes the day, the plan, what Rocky knows and the note", () => {
    expect(tellUser(INPUT)).toBe(
      [
        "Today is Tuesday, 2026-10-27.",
        "",
        "The next days:",
        "- 2026-10-27 Tuesday: rest",
        "- 2026-10-28 Wednesday: Legs, Shoulders (wed-legs-shoulders)",
        "",
        "Each workout's lifts, by position:",
        "- wed-legs-shoulders: leg-press, seated-dumbbell-shoulder-press",
        "",
        "What you know about the person:",
        "- No squats or lunges.",
        "",
        "The note:",
        NOTE,
      ].join("\n"),
    );
    expect(libraryBlock()).toContain("seated-dumbbell-shoulder-press | Seated dumbbell shoulder press | shoulder-press | dumbbell");
    expect(tellRules(true)).toContain(`You are ${COACH_NAME}`);
    expect(tellRules(true)).toContain('Set scope to "week" when the note is temporary');
  });

  it("asks for facts only, with no library, for someone with no plan", async () => {
    const { sent, fetch } = fakeFetch(() => message({ content: [{ type: "text", text: JSON.stringify({ proposals: [] }) }] }));
    const noPlan: TellInput = { ...INPUT, context: { days: [], templates: {} }, hasPlan: false };
    await anthropicClient("k", { fetch, maxRetries: 0 }).tell(noPlan);
    expect(sent[0].body.system).toEqual([{ type: "text", text: tellRules(false) }]);
    expect(tellRules(false)).not.toContain('"swap"');
    expect(tellUser(noPlan)).toBe(["Today is Tuesday, 2026-10-27.", "", "What you know about the person:", "- No squats or lunges.", "", "The note:", NOTE].join("\n"));
  });
});
