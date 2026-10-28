import { describe, expect, it } from "vitest";
import { anthropicClient } from "~/ai/claude.server";
import { labelSystem } from "~/ai/prompts.server";
import { APP_NAME } from "~/brand";
import { fakeFetch, message, USAGE } from "./fake-anthropic";

const READ = { readable: true, name: "Barebells protein bar, cookies and cream", servingText: "1 bar (55 g)", servingGrams: 55, kcal: 200, proteinG: 20 };

describe("AiClient.label", () => {
  it("sends the photo first, then the ask, at low effort with the label's schema", async () => {
    const { sent, fetch } = fakeFetch(() => message({ content: [{ type: "text", text: JSON.stringify(READ) }] }));
    expect(await anthropicClient("k", { fetch, maxRetries: 0 }).label("AAAA")).toEqual({ ok: true, value: READ, usage: USAGE });
    expect(sent[0]!.body).toMatchObject({
      max_tokens: 6000,
      system: [{ type: "text", text: labelSystem() }],
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: "AAAA" } },
            { type: "text", text: "Read this label." },
          ],
        },
      ],
      output_config: { effort: "low", format: { type: "json_schema" } },
    });
    expect((sent[0]!.body.system as { cache_control?: unknown }[])[0]).not.toHaveProperty("cache_control");
  });

  it("calls a reply with impossible numbers bad output", async () => {
    const { fetch } = fakeFetch(() => message({ content: [{ type: "text", text: JSON.stringify({ ...READ, kcal: 90000 }) }] }));
    expect(await anthropicClient("k", { fetch, maxRetries: 0 }).label("AAAA")).toEqual({ ok: false, reason: "bad-output", usage: USAGE });
  });

  it("tells the model to report only what is printed, per serving", () => {
    expect(labelSystem()).toContain(APP_NAME);
    expect(labelSystem()).toContain("Report only what is printed. Never estimate.");
    expect(labelSystem()).toContain("use the per serving column");
  });
});
