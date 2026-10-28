import { describe, expect, it } from "vitest";
import { anthropicClient } from "~/ai/claude.server";
import { takeSystem } from "~/ai/prompts.server";
import { COACH_NAME } from "~/brand";
import { fakeFetch, message, USAGE } from "./fake-anthropic";

describe("AiClient.take", () => {
  it("asks at medium effort with the voice in the system prompt, and the lines and facts in the message", async () => {
    const { sent, fetch } = fakeFetch(() => message({ content: [{ type: "text", text: " Every day counted. " }] }));
    const lines = ["Week 3, Oct 19 to 25", "Trend weight 205.1 lb, down 0.4 lb this week"];
    expect(await anthropicClient("k", { fetch, maxRetries: 0 }).take({ lines, voice: "plain", facts: ["No squats or lunges."] })).toEqual({ ok: true, value: "Every day counted.", usage: USAGE });
    expect(sent[0].body).toMatchObject({
      max_tokens: 2000,
      output_config: { effort: "medium" },
      system: [{ type: "text", text: takeSystem("plain") }],
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: "The week:\n- Week 3, Oct 19 to 25\n- Trend weight 205.1 lb, down 0.4 lb this week\n\nWhat you know about the person:\n- No squats or lunges." }],
        },
      ],
    });
  });

  it("gives each voice its line and the same rules", () => {
    expect(takeSystem("corner")).toContain("Voice: Straight shooter, a little fight. One boxing image at most.");
    expect(takeSystem("plain")).toContain("Voice: Same advice, no boxing talk.");
    for (const voice of ["corner", "plain"] as const) {
      expect(takeSystem(voice)).toContain(`You are ${COACH_NAME}`);
      expect(takeSystem(voice)).toContain("At most four sentences, in this order: one win, one fix, the call and why, next week's focus.");
      expect(takeSystem(voice)).toContain("Use only numbers that appear in the week's lines, written as digits.");
    }
  });
});
