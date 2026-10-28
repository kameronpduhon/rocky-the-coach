import type { Route } from "./+types/api.sync.pull";
import { mealDate, weekStart } from "~/domain/dates";
import { serverNow } from "~/server/clock.server";
import { currentUser, userD1, userDb } from "~/server/current-user.server";
import { ensureWeekPlan } from "~/server/meal-plan.server";
import { processPull } from "~/sync/pull.server";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const since = Number(url.searchParams.get("since") ?? "0");
  const clientId = url.searchParams.get("clientId") ?? "";
  if (!Number.isInteger(since) || since < 0 || clientId.length < 8) return Response.json({ error: "Bad pull" }, { status: 400 });
  // The week's plan is made before reading, so a phone that only syncs still gets this week's meals.
  if (currentUser().planKey) await ensureWeekPlan(userDb(), weekStart(mealDate(serverNow())));
  return Response.json(await processPull(userD1(), since, clientId), { headers: { "Cache-Control": "no-store" } });
}
