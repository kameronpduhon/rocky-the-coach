import { describe, expect, it } from "vitest";
import { meals } from "~/content";
import { logPlannedMeal, logsForDate } from "~/server/meals.server";
import { db } from "./helpers";

describe("clientId", () => {
  it("logs a meal once even when the same request is sent twice", async () => {
    const meal = meals.get("protein-shake")!;
    await logPlannedMeal(db(), "2026-10-14", "snack", meal, new Date(), "abc-123");
    await logPlannedMeal(db(), "2026-10-14", "snack", meal, new Date(), "abc-123");
    expect(await logsForDate(db(), "2026-10-14")).toHaveLength(1);
  });
});
