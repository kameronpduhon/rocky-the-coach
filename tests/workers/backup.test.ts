import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { logWeighIn } from "~/server/body.server";
import { runBackup } from "~/server/backup.server";
import { db } from "./helpers";

describe("backup", () => {
  it("writes every table to R2 as JSON", async () => {
    await logWeighIn(db(), "2026-10-12", 205.8, new Date());
    const key = await runBackup(env.DB, env.MEDIA, new Date("2026-10-18T09:00:00Z"));
    expect(key).toBe("backups/2026-10-18.json");
    const dump = (await (await env.MEDIA.get(key))!.json()) as Record<string, unknown[]>;
    expect(dump.weigh_ins).toEqual([expect.objectContaining({ date: "2026-10-12", weight_lb: 205.8 })]);
    expect(Object.keys(dump)).toContain("meal_logs");
    expect(Object.keys(dump)).not.toContain("d1_migrations");
  });

  it("names the file by the Chicago date, not the UTC one", async () => {
    // 9:30pm Sunday in Chicago is already Monday in UTC.
    expect(await runBackup(env.DB, env.MEDIA, new Date("2026-10-19T02:30:00Z"))).toBe("backups/2026-10-18.json");
  });

  it("keeps only the 12 newest backups", async () => {
    for (let i = 0; i < 14; i++) await runBackup(env.DB, env.MEDIA, new Date(Date.UTC(2027, 0, 3 + i * 7, 9)));
    const listed = await env.MEDIA.list({ prefix: "backups/" });
    expect(listed.objects).toHaveLength(12);
    expect(listed.objects.map((o) => o.key)).not.toContain("backups/2026-10-18.json");
  });
});
