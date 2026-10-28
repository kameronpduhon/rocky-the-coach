// A stand-in model for the AI route tests, so no test calls Anthropic. P5b to P5e use these too.
import type { AiClient, AiKind, AiUsage } from "~/ai/claude.server";
import { setAiDeps } from "../../workers/api/ai";

export const USAGE: AiUsage = { input: 40, output: 12, cacheRead: 0 };

/**
 * A fake AiClient. Each method answers from `answers`; any other method fails the test. `calls` names each call in
 * order, so a test can prove a route made no model call.
 */
export function fakeAi(answers: Partial<AiClient>): { client: AiClient; calls: string[] } {
  const calls: string[] = [];
  const table = answers as Record<string | symbol, ((...args: unknown[]) => unknown) | undefined>;
  const client = new Proxy({} as AiClient, {
    get: (_, name) => (...args: unknown[]) => {
      calls.push(String(name));
      const answer = table[name];
      if (!answer) throw new Error(`Unexpected model call: ${String(name)}`);
      return answer(...args);
    },
  });
  return { client, calls };
}

/** Points the AI routes at a fake model with a key. Returns the restore. */
export const withFakeAi = (client: AiClient) => setAiDeps({ key: () => "test-key", client: () => client });

/** As if ANTHROPIC_API_KEY were unset. Returns the restore. */
export const withoutKey = () => setAiDeps({ key: () => undefined });

export async function setSwitch(d1: D1Database, on: boolean): Promise<void> {
  await d1.prepare("INSERT INTO profile (id, voice, ai) VALUES ('me', 'corner', ?) ON CONFLICT (id) DO UPDATE SET ai = excluded.ai").bind(on ? 1 : 0).run();
}

/** `n` calls of a kind made just now, to reach a daily cap. */
export async function seedCalls(d1: D1Database, kind: AiKind, n: number): Promise<void> {
  const at = new Date().toISOString();
  for (let i = 0; i < n; i++) await d1.prepare("INSERT INTO ai_calls (at, kind, ok) VALUES (?, ?, 1)").bind(at, kind).run();
}

export async function lastCall(d1: D1Database): Promise<Record<string, unknown> | null> {
  return d1.prepare("SELECT kind, ok, reason, input_tokens, output_tokens, cache_read_tokens FROM ai_calls ORDER BY id DESC LIMIT 1").first();
}
