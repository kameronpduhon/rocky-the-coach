import { describe, expect, it } from "vitest";
import { action, loader } from "~/routes/today";
import { weighInFor, latestWeighIn } from "~/server/body.server";
import { logsForDate } from "~/server/meals.server";
import { localDate, mealDate } from "~/domain/dates";
import { db, post, routeArgs } from "./helpers";

describe("today route", () => {
  it("loads a summary and a Rocky message", async () => {
    const data = await loader(routeArgs(new Request("http://localhost/")));
    expect(data.day.slots).toHaveLength(5);
    expect(typeof data.message).toBe("string");
    expect(data.message.length).toBeGreaterThan(5);
  });

  it("logs a weigh-in for today", async () => {
    await action(routeArgs(post("http://localhost/?index", { intent: "weigh-in", weight: "205.8" })));
    expect(await weighInFor(db(), localDate())).toBe(205.8);
    expect((await latestWeighIn(db()))?.weightLb).toBe(205.8);
  });

  it("rejects a nonsense weigh-in", async () => {
    const res = await action(routeArgs(post("http://localhost/?index", { intent: "weigh-in", weight: "abc" })));
    expect(res).toEqual({ error: "Enter your weight in pounds." });
  });

  it("logs off-plan food", async () => {
    await action(routeArgs(post("http://localhost/?index", { intent: "off-plan", name: "Ranch Water", category: "drink", kcal: "100", protein: "0" })));
    const logs = await logsForDate(db(), mealDate());
    expect(logs.some((l) => l.name === "Ranch Water" && l.category === "drink")).toBe(true);
  });
});
