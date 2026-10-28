import { describe, expect, it } from "vitest";
import { meals } from "~/content";
import { workoutSessions } from "~/db/schema";
import { logWeighIn } from "~/server/body.server";
import { logPlannedMeal } from "~/server/meals.server";
import { runReminders } from "~/server/reminders.server";
import type { PushMessage } from "~/server/push.server";
import { chicago, db } from "./helpers";

function collector() {
  const sent: PushMessage[] = [];
  return { sent, send: async (_db: unknown, m: PushMessage) => (sent.push(m), 1) };
}

describe("runReminders", () => {
  it("sends the weigh-in reminder once in its window", async () => {
    const c = collector();
    await runReminders(db(), chicago("2026-10-13", "07:30"), c.send);
    await runReminders(db(), chicago("2026-10-13", "07:35"), c.send);
    expect(c.sent.map((m) => m.title)).toEqual(["Weigh-in"]);
    expect(c.sent[0].url).toBe("/");
  });

  it("skips the weigh-in reminder once weighed in", async () => {
    await logWeighIn(db(), "2026-10-14", 205.8, new Date());
    const c = collector();
    await runReminders(db(), chicago("2026-10-14", "07:30"), c.send);
    expect(c.sent).toEqual([]);
  });

  it("sends Plan B on a training day afternoon with no sets", async () => {
    const c = collector();
    await runReminders(db(), chicago("2026-10-16", "17:00"), c.send);
    expect(c.sent.map((m) => m.title)).toContain("Plan B tonight");
    expect(c.sent.find((m) => m.title === "Plan B tonight")?.url).toBe("/workout?plan=b");
  });

  it("stays quiet on a holiday", async () => {
    const c = collector();
    // Nov 26 is CST (UTC-6), so this is 7:30am local, inside the weigh-in window.
    await runReminders(db(), new Date("2026-11-26T07:30:00-06:00"), c.send);
    expect(c.sent).toEqual([]);
  });

  it("still sends the lift reminder when the workout was only planned", async () => {
    await db().insert(workoutSessions).values({ date: "2026-10-28", templateId: "wed-legs-shoulders", clientId: "planned-only", plannedAt: "2026-10-28T13:00:00Z" });
    const c = collector();
    await runReminders(db(), chicago("2026-10-28", "11:30"), c.send);
    expect(c.sent.map((m) => m.title)).toContain("Lift at noon");
  });

  it("asks to close out at 9:15pm, opening the sheet, while meals are unmarked", async () => {
    await logPlannedMeal(db(), "2026-10-20", "lunch", meals.get("chicken-and-rice-bowl")!, new Date());
    const c = collector();
    await runReminders(db(), chicago("2026-10-20", "21:15"), c.send);
    expect(c.sent).toEqual([{ title: "Close out today", body: "4 meals aren't marked. One tap closes out today.", url: "/?closeout=today", tag: "close-out" }]);
  });

  it("doesn't ask to close out a day with nothing logged", async () => {
    const c = collector();
    await runReminders(db(), chicago("2026-10-22", "21:15"), c.send);
    expect(c.sent).toEqual([]);
  });
});
