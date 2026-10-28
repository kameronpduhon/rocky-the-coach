// The one place the app talks to the model (spec section 1, "The model call"). Worker only: the key never reaches a
// phone. Every call comes back as an AiResult, never a throw, so each route falls back to the rules the same way.
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import { PROBE_SYSTEM, takeSystem, takeUser } from "./prompts.server";
import type { Voice } from "./take";
import type { ISODate } from "~/domain/types";
import { libraryBlock, tellRules, tellUser } from "./prompts.server";
import { TellReply, type TellContext } from "./proposals";
import { LabelSchema, type LabelRead } from "./label";
import { describeSystem, labelSystem } from "./prompts.server";
import { DescribeSchema, type DescribeReply } from "./describe";
import { foodPromptBlock } from "./food-table";

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

export interface TellInput {
  note: string;
  today: ISODate;
  context: TellContext;
  /** What Rocky knows, oldest first. */
  facts: string[];
  hasPlan: boolean;
}

/** The calls the AI routes make. Worker tests hand the routes a fake. Each step of project 5 adds its call here. */
export interface AiClient {
  /** A tiny call that proves the key and the model work, for the wire check. */
  probe(): Promise<AiResult<string>>;
  /** Rocky's take: plain text, checked by the route before it is stored. */
  take(input: TakeInput): Promise<AiResult<string>>;
  /** Tell Rocky: proposals in TellReply's shape, checked by the route before they reach the phone. */
  tell(input: TellInput): Promise<AiResult<TellReply>>;
  /** A nutrition label from a base64 JPEG. The photo goes in this one request and is kept nowhere. */
  label(image: string): Promise<AiResult<LabelRead>>;
  /** A described meal as foods with grams and food-table ids. The route tidies it to the table. */
  describe(text: string): Promise<AiResult<DescribeReply>>;
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
    tell: (i) =>
      structuredCall(client, {
        // The library is the same for every note, so it is cached; a second note inside 5 minutes reads it from cache.
        system: i.hasPlan ? [{ type: "text", text: tellRules(true) }, { type: "text", text: libraryBlock(), cache_control: { type: "ephemeral" } }] : [{ type: "text", text: tellRules(false) }],
        content: [{ type: "text", text: tellUser(i) }],
        effort: "low",
        maxTokens: 3000,
        schema: TellReply,
      }),
    // Too small and too rare to cache. The image block comes before the text, as the vision docs advise.
    label: (image) =>
      structuredCall(client, {
        system: [{ type: "text", text: labelSystem() }],
        content: [
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data: image } },
          { type: "text", text: "Read this label." },
        ],
        effort: "low",
        maxTokens: 2000,
        schema: LabelSchema,
      }),
    // The food table (about 6,700 tokens) is cached, so the plate's "Edit" re-asks cheaply inside 5 minutes.
    describe: (text) =>
      structuredCall(client, {
        system: [
          { type: "text", text: describeSystem() },
          { type: "text", text: foodPromptBlock(), cache_control: { type: "ephemeral" } },
        ],
        content: [{ type: "text", text }],
        effort: "low",
        maxTokens: 4000,
        schema: DescribeSchema,
      }),
  };
}
