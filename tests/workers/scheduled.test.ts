import { createExecutionContext, createScheduledController, env, waitOnExecutionContext } from "cloudflare:test";
import { expect, it } from "vitest";
import worker from "../../workers/app";

it("backs up every database on the weekly cron", async () => {
  const ctx = createExecutionContext();
  await worker.scheduled(createScheduledController({ cron: "0 9 * * SUN", scheduledTime: Date.UTC(2026, 9, 18, 9) }), env, ctx);
  await waitOnExecutionContext(ctx);
  for (const name of ["kameron", "catherine", "core"]) expect(await env.MEDIA.get(`backups/${name}/2026-10-18.json`), name).not.toBeNull();
});

it("runs reminders on the 5-minute cron without throwing", async () => {
  const ctx = createExecutionContext();
  await worker.scheduled(createScheduledController({ cron: "*/5 * * * *", scheduledTime: Date.UTC(2026, 9, 18, 3) }), env, ctx);
  await waitOnExecutionContext(ctx);
});

it("prunes sync changes older than 30 days on the weekly cron", async () => {
  await env.DB.prepare("insert into changes (table_name, row_key, op, at) values ('weigh_ins', 'old', 'put', '2026-09-01T00:00:00.000Z'), ('weigh_ins', 'new', 'put', '2026-10-17T00:00:00.000Z')").run();
  const ctx = createExecutionContext();
  await worker.scheduled(createScheduledController({ cron: "0 9 * * SUN", scheduledTime: Date.UTC(2026, 9, 18, 9) }), env, ctx);
  await waitOnExecutionContext(ctx);
  const keys = (await env.DB.prepare("select row_key from changes where row_key in ('old', 'new')").all()).results.map((r) => r.row_key);
  expect(keys).toEqual(["new"]);
});
