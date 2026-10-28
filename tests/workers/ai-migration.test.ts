import { applyD1Migrations, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("the P5a migration", () => {
  it("reads an existing profile as AI on, logs facts and takes, and never logs ai_calls", async () => {
    const d1 = env.MIGRATION_TEST;
    const split = env.TEST_MIGRATIONS.findIndex((m) => m.name.startsWith("0012"));
    await applyD1Migrations(d1, env.TEST_MIGRATIONS.slice(0, split));
    await d1.prepare("INSERT INTO profile (id, voice) VALUES ('me', 'plain')").run();

    await applyD1Migrations(d1, env.TEST_MIGRATIONS);

    expect(await d1.prepare("SELECT id, voice, ai FROM profile").first()).toEqual({ id: "me", voice: "plain", ai: 1 });
    const before = (await d1.prepare("SELECT COUNT(*) AS n FROM changes").first<{ n: number }>())!.n;
    const at = "2026-10-25T23:00:00.000Z";
    await d1.prepare(`INSERT INTO facts (client_id, text, dated, created_at, updated_at) VALUES ('f-1', 'No squats or lunges.', 0, '${at}', '${at}')`).run();
    await d1.prepare("UPDATE facts SET text = 'No squats.' WHERE client_id = 'f-1'").run();
    await d1.prepare("DELETE FROM facts").run();
    await d1.prepare(`INSERT INTO takes (week_start, text, hash, voice, writes, written_at) VALUES ('2026-10-19', 'Every day counted.', 'c52e7c8afc0ec966', 'corner', 1, '${at}')`).run();
    await d1.prepare(`INSERT INTO ai_calls (at, kind, ok, reason, input_tokens, output_tokens, cache_read_tokens) VALUES ('${at}', 'take', 1, NULL, 2500, 600, 0)`).run();
    expect((await d1.prepare("SELECT table_name, row_key, op FROM changes ORDER BY version").all()).results.slice(before)).toEqual([
      { table_name: "facts", row_key: "f-1", op: "put" },
      { table_name: "facts", row_key: "f-1", op: "put" },
      { table_name: "facts", row_key: "f-1", op: "del" },
      { table_name: "takes", row_key: "2026-10-19", op: "put" },
    ]);
  });
});
