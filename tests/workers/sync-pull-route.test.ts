import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { addDays, mealDate, weekStart } from "~/domain/dates";
import { loader } from "~/routes/api.sync.pull";
import { runAsUser } from "~/server/current-user.server";
import { userById } from "~/server/users.server";
import { routeArgs } from "./helpers";

const planned = async (d1: D1Database, monday: string) =>
  (await d1.prepare("SELECT COUNT(*) AS n FROM planned_meals WHERE date BETWEEN ? AND ?").bind(monday, addDays(monday, 6)).first<{ n: number }>())!.n;
const pull = (clientId: string) => routeArgs(new Request(`http://localhost/api/sync/pull?since=0&clientId=${clientId}`));

describe("pull", () => {
  it("makes this week's plan before it reads, for someone with a plan", async () => {
    const monday = weekStart(mealDate(new Date()));
    const res = (await loader(pull("phone-pull-k"))) as Response;
    expect(res.status).toBe(200);
    expect(await planned(env.DB, monday)).toBe(35);
    const body = (await res.json()) as { puts: Record<string, { date: string }[]> };
    expect(body.puts.planned_meals.filter((r) => r.date >= monday && r.date <= addDays(monday, 6))).toHaveLength(35);
  });

  it("makes no plan for someone without one", async () => {
    const catherine = (await userById(2))!;
    await runAsUser(catherine, () => loader(pull("phone-pull-c")));
    expect(await planned(env.DB_CATHERINE, weekStart(mealDate(new Date())))).toBe(0);
  });
});
