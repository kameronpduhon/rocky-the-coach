// The one place the app talks to the model (spec section 1, "The model call"). Worker only: the key never reaches a
// phone. Every call comes back as an AiResult, never a throw, so each route falls back to the rules the same way.
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import { PROBE_SYSTEM, takeSystem, takeUser } from "./prompts.server";
import type { Voice } from "./take";

/** One constant, so a model change is one line. */
export const AI_MODEL = "claude-sonnet-5-5";

export type AiKind = "take" | "describe" | "label" | "tell" | "probe";
export type AiReason = "no-reply" | "refusal" | "max-tokens" | "bad-output" | "numbers" | "length" | "characters" | "rate-limit" | "error";

export interface AiUsage {
  input: number;
  output: number;
  cacheRead: number;
}

export type AiResult<T> = { ok: true; value: T; usage: AiUsage } | { ok: false; reason: AiReason; usage: AiUsage | null };

export interface TakeInput {
  lines: string[];
  voice: Voice;
  /** What Rocky knows, oldest first. */
  facts: string[];
}

/** The calls the AI routes make. Worker tests hand the routes a fake. Each step of project 5 adds its call here. */
export interface AiClient {
  /** A tiny call that proves the key and the model work, for the wire check. */
  probe(): Promise<AiResult<string>>;
  /** Rocky's take: plain text, checked by the route before it is stored. */
  take(input: TakeInput): Promise<AiResult<string>>;
}

export interface ClientOptions {
  /** Tests pass a fake, so no request leaves the machine. */
  fetch?: typeof fetch;
  maxRetries?: number;
}

/** Made per request: one retry, and 15 seconds a try. */
export function anthropic(key: string, opts: ClientOptions = {}): Anthropic {
  return new Anthropic({ apiKey: key, maxRetries: opts.maxRetries ?? 1, timeout: 15_000, ...(opts.fetch ? { fetch: opts.fetch } : {}) });
}

export interface CallSpec {
  system: Anthropic.TextBlockParam[];
  content: Anthropic.ContentBlockParam[];
  /** "low" for describe, label and tell; "medium" for the take. */
  effort: "low" | "medium";
  maxTokens: number;
}

const usageOf = (m: Anthropic.Message): AiUsage => ({ input: m.usage.input_tokens, output: m.usage.output_tokens, cacheRead: m.usage.cache_read_input_tokens ?? 0 });

/** Most specific first. In this SDK a connection error is also an APIError, so it is checked before it. */
function failureOf(err: unknown): AiReason {
  if (err instanceof Anthropic.RateLimitError) return "rate-limit";
  if (err instanceof Anthropic.APIConnectionError) return "error";
  if (err instanceof Anthropic.APIError) return "error";
  return "error";
}

// No temperature (a 400 on this API version) and no thinking parameter: Sonnet 5.5 runs adaptive thinking, and
// { type: "disabled" } is a 400 on it. Effort is the dial. No assistant prefill, which is a 400 too.
async function send(client: Anthropic, spec: CallSpec, format?: Anthropic.JSONOutputFormat): Promise<Anthropic.Message | AiReason> {
  try {
    return await client.messages.create({
      model: AI_MODEL,
      max_tokens: spec.maxTokens,
      system: spec.system,
      messages: [{ role: "user", content: spec.content }],
      output_config: format ? { effort: spec.effort, format } : { effort: spec.effort },
    });
  } catch (err) {
    return failureOf(err);
  }
}

function stopped(m: Anthropic.Message): AiReason | null {
  if (m.stop_reason === "refusal") return "refusal";
  if (m.stop_reason === "max_tokens") return "max-tokens";
  return null;
}

function firstText(m: Anthropic.Message): string | null {
  for (const block of m.content) if (block.type === "text") return block.text;
  return null;
}

/** A plain reply: the first text block, trimmed. */
export async function textCall(client: Anthropic, spec: CallSpec): Promise<AiResult<string>> {
  const m = await send(client, spec);
  if (typeof m === "string") return { ok: false, reason: m, usage: null };
  const usage = usageOf(m);
  const stop = stopped(m);
  if (stop) return { ok: false, reason: stop, usage };
  const text = firstText(m)?.trim();
  return text ? { ok: true, value: text, usage } : { ok: false, reason: "no-reply", usage };
}

/**
 * A reply in the schema's shape. The schema goes to the API as structured output, then the reply is parsed here with
 * the same schema, so bounds the API doesn't enforce (lengths, ranges) still hold. Parsed here rather than by
 * messages.parse, which throws on a refused or cut-off reply before its stop reason can be read.
 */
export async function structuredCall<S extends z.ZodType>(client: Anthropic, spec: CallSpec & { schema: S }): Promise<AiResult<z.infer<S>>> {
  const { type, schema } = zodOutputFormat(spec.schema);
  const m = await send(client, spec, { type, schema });
  if (typeof m === "string") return { ok: false, reason: m, usage: null };
  const usage = usageOf(m);
  const stop = stopped(m);
  if (stop) return { ok: false, reason: stop, usage };
  const text = firstText(m);
  if (!text) return { ok: false, reason: "no-reply", usage };
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, reason: "bad-output", usage };
  }
  const parsed = spec.schema.safeParse(json);
  return parsed.success ? { ok: true, value: parsed.data as z.infer<S>, usage } : { ok: false, reason: "bad-output", usage };
}

/** The real client, over the SDK. */
export function anthropicClient(key: string, opts: ClientOptions = {}): AiClient {
  const client = anthropic(key, opts);
  return {
    probe: () => textCall(client, { system: [{ type: "text", text: PROBE_SYSTEM }], content: [{ type: "text", text: "Are you there?" }], effort: "low", maxTokens: 1000 }),
    // Too small and too rare to cache.
    take: (i) => textCall(client, { system: [{ type: "text", text: takeSystem(i.voice) }], content: [{ type: "text", text: takeUser(i.lines, i.facts) }], effort: "medium", maxTokens: 2000 }),
  };
}
