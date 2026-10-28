// A fake fetch for @anthropic-ai/sdk, so no unit test reaches Anthropic. Hand it to anthropic() or anthropicClient().

export type Sent = { url: string; body: Record<string, unknown> };

/** A fetch that records each request's URL and JSON body, and answers with `reply`. */
export function fakeFetch(reply: () => Response | Promise<Response>) {
  const sent: Sent[] = [];
  const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    sent.push({ url: String(input), body: JSON.parse(String(init?.body)) as Record<string, unknown> });
    return reply();
  }) as typeof globalThis.fetch;
  return { sent, fetch };
}

/** A Messages API reply: one text block, end_turn, and this usage, unless `over` changes them. */
export const message = (over: Record<string, unknown> = {}) =>
  Response.json({
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-sonnet-5-5",
    content: [{ type: "text", text: "Ready." }],
    stop_reason: "end_turn",
    stop_sequence: null,
    stop_details: null,
    usage: { input_tokens: 2500, output_tokens: 600, cache_read_input_tokens: 1200, cache_creation_input_tokens: 0 },
    ...over,
  });

/** The usage `message()` reports, as AiUsage. */
export const USAGE = { input: 2500, output: 600, cacheRead: 1200 };

/** An API error. x-should-retry: false, so the SDK's own retry doesn't re-ask the fake. */
export const apiError = (status: number, type: string) => Response.json({ type: "error", error: { type, message: "test" } }, { status, headers: { "x-should-retry": "false" } });
