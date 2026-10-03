import { createExecutionContext, createScheduledController, env, waitOnExecutionContext } from "cloudflare:test";
import { expect, it } from "vitest";
import worker from "../../workers/app";

it("runs the backup on the weekly cron", async () => {
  const ctx = createExecutionContext();
  await worker.scheduled(createScheduledController({ cron: "0 9 * * SUN", scheduledTime: Date.UTC(2026, 9, 18, 9) }), env, ctx);
  await waitOnExecutionContext(ctx);
  expect(await env.MEDIA.get("backups/2026-10-18.json")).not.toBeNull();
});

it("runs reminders on the 5-minute cron without throwing", async () => {
  const ctx = createExecutionContext();
  await worker.scheduled(createScheduledController({ cron: "*/5 * * * *", scheduledTime: Date.UTC(2026, 9, 18, 3) }), env, ctx);
  await waitOnExecutionContext(ctx);
});
