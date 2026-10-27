import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { loader } from "~/routes/app-layout";
import { runAsUser } from "~/server/current-user.server";
import { userById } from "~/server/users.server";
import { addDays, mealDate, weekStart } from "~/domain/dates";

const plannedThisWeek = (d1: D1Database) => {
  const monday = weekStart(mealDate());
  return d1.prepare("SELECT count(*) AS n FROM planned_meals WHERE date BETWEEN ? AND ?").bind(monday, addDays(monday, 6)).first<{ n: number }>();
};

describe("app layout loader", () => {
  it("gives Kameron's id and plan, and plans this week's meals", async () => {
    const kameron = (await userById(1))!;
    expect(await runAsUser(kameron, () => loader())).toEqual({ userId: 1, name: "Kameron", hasPlan: true });
    expect((await plannedThisWeek(env.DB))?.n).toBe(35);
  });

  it("gives Catherine no plan and plans nothing for her", async () => {
    const catherine = (await userById(2))!;
    expect(await runAsUser(catherine, () => loader())).toEqual({ userId: 2, name: "Catherine", hasPlan: false });
    expect((await plannedThisWeek(env.DB_CATHERINE))?.n).toBe(0);
  });
});
