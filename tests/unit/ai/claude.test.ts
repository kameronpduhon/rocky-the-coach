import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { anthropic, anthropicClient, structuredCall, textCall, type CallSpec } from "~/ai/claude.server";
import { PROBE_SYSTEM } from "~/ai/prompts.server";
import { MODEL_WAIT_MS, PHONE_WAIT_MS } from "~/ai/waits";
import { apiError, fakeFetch, message, USAGE } from "./fake-anthropic";

const SPEC: CallSpec = { system: [{ type: "text", text: "Be brief." }], content: [{ type: "text", text: "Ready?" }], effort: "low", maxTokens: 1000, waitMs: 5_000 };

describe("textCall", () => {
  it("sends Sonnet 5.5 with an effort and no temperature or thinking, and reads the text and usage", async () => {
    const { sent, fetch } = fakeFetch(() => message());
    expect(await textCall(anthropic("test-key", { fetch, maxRetries: 0 }), SPEC)).toEqual({ ok: true, value: "Ready.", usage: USAGE });
    expect(sent).toHaveLength(1);
    expect(sent[0].url).toBe("https://api.anthropic.com/v1/messages");
    expect(sent[0].body).toMatchObject({
      model: "claude-sonnet-5-5",
      max_tokens: 1000,
      system: [{ type: "text", text: "Be brief." }],
      messages: [{ role: "user", content: [{ type: "text", text: "Ready?" }] }],
      output_config: { effort: "low" },
    });
    expect(sent[0].body).not.toHaveProperty("temperature");
    expect(sent[0].body).not.toHaveProperty("thinking");
  });

  it("falls back on a refusal, a cut-off reply and an empty one, keeping the usage", async () => {
    const call = (over: Record<string, unknown>) => textCall(anthropic("k", { fetch: fakeFetch(() => message(over)).fetch, maxRetries: 0 }), SPEC);
    expect(await call({ stop_reason: "refusal", stop_details: { type: "refusal", category: null, explanation: null } })).toEqual({ ok: false, reason: "refusal", usage: USAGE });
    expect(await call({ stop_reason: "max_tokens" })).toEqual({ ok: false, reason: "max-tokens", usage: USAGE });
    expect(await call({ content: [] })).toEqual({ ok: false, reason: "no-reply", usage: USAGE });
  });

  it("names a rate limit, a server error and a lost connection, with no usage", async () => {
    const call = (reply: () => Response | Promise<Response>) => textCall(anthropic("k", { fetch: fakeFetch(reply).fetch, maxRetries: 0 }), SPEC);
    expect(await call(() => apiError(429, "rate_limit_error"))).toEqual({ ok: false, reason: "rate-limit", usage: null });
    expect(await call(() => apiError(500, "api_error"))).toEqual({ ok: false, reason: "error", usage: null });
    expect(
      await call(() => {
        throw new TypeError("fetch failed");
      }),
    ).toEqual({ ok: false, reason: "error", usage: null });
  });
});

describe("structuredCall", () => {
  const Schema = z.object({ name: z.string().max(10) });

  it("asks for the schema as structured output and reads a reply in its shape", async () => {
    const { sent, fetch } = fakeFetch(() => message({ content: [{ type: "text", text: '{"name":"Quest bar"}' }] }));
    expect(await structuredCall(anthropic("k", { fetch, maxRetries: 0 }), { ...SPEC, schema: Schema })).toEqual({ ok: true, value: { name: "Quest bar" }, usage: USAGE });
    expect(sent[0].body.output_config).toMatchObject({ effort: "low", format: { type: "json_schema", schema: { type: "object" } } });
  });

  it("calls a reply out of bounds, or not JSON, bad output", async () => {
    const call = (text: string) => structuredCall(anthropic("k", { fetch: fakeFetch(() => message({ content: [{ type: "text", text }] })).fetch, maxRetries: 0 }), { ...SPEC, schema: Schema });
    expect(await call('{"name":"Far too long a name"}')).toEqual({ ok: false, reason: "bad-output", usage: USAGE });
    expect(await call("Here you go")).toEqual({ ok: false, reason: "bad-output", usage: USAGE });
  });

  it("reads a refusal by its stop reason, not as bad output", async () => {
    const { fetch } = fakeFetch(() => message({ stop_reason: "refusal", content: [{ type: "text", text: '{"na' }] }));
    expect(await structuredCall(anthropic("k", { fetch, maxRetries: 0 }), { ...SPEC, schema: Schema })).toEqual({ ok: false, reason: "refusal", usage: USAGE });
  });
});

describe("anthropicClient", () => {
  it("probes with a tiny low-effort call", async () => {
    const { sent, fetch } = fakeFetch(() => message());
    expect(await anthropicClient("k", { fetch, maxRetries: 0 }).probe()).toEqual({ ok: true, value: "Ready.", usage: USAGE });
    expect(sent[0].body).toMatchObject({ max_tokens: 1000, system: [{ type: "text", text: PROBE_SYSTEM }], output_config: { effort: "low" } });
  });
});

describe("the model's wait", () => {
  afterEach(() => vi.useRealTimers());

  /** A fetch that never answers, and fails once the SDK gives up on it. */
  function silent() {
    let tries = 0;
    const fetch = ((_: unknown, init?: RequestInit) => {
      tries++;
      return new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
    }) as typeof globalThis.fetch;
    return { fetch, tries: () => tries };
  }

  it("sits a couple of seconds under the phone's for each route", () => {
    for (const kind of ["take", "tell", "label", "describe"] as const) expect(MODEL_WAIT_MS[kind]).toBeLessThanOrEqual(PHONE_WAIT_MS[kind] - 2_000);
    expect(MODEL_WAIT_MS.take).toBe(8_000);
    expect(MODEL_WAIT_MS.tell).toBe(17_000);
  });

  it("gives up on a silent model at the route's wait, with no retry", async () => {
    vi.useFakeTimers();
    const lines = ["Week 3, Oct 19 to 25"];
    const cases = [
      ["take", 8_000, (c: ReturnType<typeof anthropicClient>) => c.take({ lines, voice: "plain", facts: [] })],
      ["describe", 17_000, (c: ReturnType<typeof anthropicClient>) => c.describe("rice")],
      ["label", 17_000, (c: ReturnType<typeof anthropicClient>) => c.label("AAAA")],
    ] as const;
    for (const [, wait, ask] of cases) {
      const s = silent();
      let done: unknown = null;
      void ask(anthropicClient("k", { fetch: s.fetch })).then((r) => (done = r));
      await vi.advanceTimersByTimeAsync(wait - 1);
      expect(done).toBeNull();
      await vi.advanceTimersByTimeAsync(5_000);
      expect(done).toEqual({ ok: false, reason: "error", usage: null });
      expect(s.tries()).toBe(1);
    }
  });
});
