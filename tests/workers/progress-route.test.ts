import { describe, expect, it } from "vitest";
import { addDays, localDate } from "~/domain/dates";
import { action, loader } from "~/routes/progress";
import { logWeighIn, weighInEntry } from "~/server/body.server";
import { db, post, routeArgs } from "./helpers";

describe("progress route", () => {
  const day = addDays(localDate(), -3);

  it("corrects a past weigh-in and keeps when it was logged", async () => {
    await logWeighIn(db(), day, 250.8, new Date("2026-10-04T12:30:00Z"));
    const res = await action(routeArgs(post("http://localhost/progress", { intent: "weigh-in", date: day, weight: "205.8" })));
    expect(res).toEqual({ ok: true });
    expect(await weighInEntry(db(), day)).toEqual({ weightLb: 205.8, loggedAt: "2026-10-04T12:30:00.000Z" });
  });

  it("deletes a weigh-in", async () => {
    await logWeighIn(db(), day, 205.8, new Date());
    await action(routeArgs(post("http://localhost/progress", { intent: "delete-weigh-in", date: day })));
    expect(await weighInEntry(db(), day)).toBeNull();
  });

  it("refuses future days and nonsense weights", async () => {
    expect(await action(routeArgs(post("http://localhost/progress", { intent: "weigh-in", date: addDays(localDate(), 1), weight: "205" })))).toEqual({ error: "Pick a day that has happened." });
    expect(await action(routeArgs(post("http://localhost/progress", { intent: "weigh-in", date: day, weight: "20" })))).toEqual({ error: "Enter your weight in pounds." });
  });

  it("lists recent weigh-ins newest first", async () => {
    await logWeighIn(db(), addDays(localDate(), -1), 205, new Date());
    await logWeighIn(db(), localDate(), 204.6, new Date());
    const { p } = await loader(routeArgs(new Request("http://localhost/progress")));
    expect(p.recentWeighIns.slice(0, 2).map((w) => w.weight)).toEqual([204.6, 205]);
  });
});
