import { describe, expect, it } from "vitest";
import { anthropicClient } from "~/ai/claude.server";
import { foodPromptBlock } from "~/ai/food-table";
import { describeSystem } from "~/ai/prompts.server";
import { APP_NAME } from "~/brand";
import { fakeFetch, message, USAGE } from "./fake-anthropic";

const PLATE = { name: "Chipotle bowl", category: "meal", items: [{ label: "Black beans", foodId: "black-beans-cooked", grams: 120 }] };

describe("AiClient.describe", () => {
  it("sends the instructions, then the food table cached, then the description, at low effort", async () => {
    const { sent, fetch } = fakeFetch(() => message({ content: [{ type: "text", text: JSON.stringify(PLATE) }] }));
    expect(await anthropicClient("k", { fetch, maxRetries: 0 }).describe("Chipotle bowl, black beans")).toEqual({ ok: true, value: PLATE, usage: USAGE });
    expect(sent[0]!.body).toMatchObject({
      max_tokens: 6000,
      system: [
        { type: "text", text: describeSystem() },
        { type: "text", text: foodPromptBlock(), cache_control: { type: "ephemeral" } },
      ],
      messages: [{ role: "user", content: [{ type: "text", text: "Chipotle bowl, black beans" }] }],
      output_config: { effort: "low", format: { type: "json_schema" } },
    });
    expect((sent[0]!.body.system as { cache_control?: unknown }[])[0]).not.toHaveProperty("cache_control");
  });

  it("tells the model it maps foods and never counts", () => {
    expect(describeSystem()).toContain(APP_NAME);
    expect(describeSystem()).toContain("Never write a calorie or protein number.");
    expect(describeSystem()).toContain("foodId: the id of the closest food in the food table, or null");
  });
});
