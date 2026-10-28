import { env } from "cloudflare:test";
import { expect, it } from "vitest";

it("creates every table", async () => {
  const { results } = await env.DB.prepare("select name from sqlite_master where type = 'table' and name not like '\\_%' escape '\\' and name != 'sqlite_sequence' and name != 'd1_migrations' order by name").all<{ name: string }>();
  expect(results.map((r) => r.name)).toEqual([
    "ai_calls", "batches", "changes", "check_ins", "exercise_checks", "exercise_notes", "exercise_overrides", "exercise_swaps", "facts", "grocery_checks", "lift_drops", "login_attempts",
    "meal_logs", "meal_state", "notifications_sent", "planned_meals", "profile", "push_subscriptions", "reminder_settings",
    "schedule_moves", "set_logs", "steps_daily", "sync_clients", "takes", "targets", "usual_orders", "vitals", "waist_logs", "weigh_ins", "workout_sessions",
  ]);
});
