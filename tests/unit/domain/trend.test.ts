import { describe, expect, it } from "vitest";
import { trendSeries, weeklyTrendChange } from "~/domain/trend";

describe("trendSeries", () => {
  it("starts at the first weigh-in and moves a tenth of the way toward each one", () => {
    const s = trendSeries([{ date: "2026-10-05", weight: 200 }, { date: "2026-10-06", weight: 210 }], "2026-10-06");
    expect(s.get("2026-10-05")).toBe(200);
    expect(s.get("2026-10-06")).toBeCloseTo(201);
  });

  it("carries the trend over days without a weigh-in", () => {
    const s = trendSeries([{ date: "2026-10-05", weight: 200 }, { date: "2026-10-08", weight: 190 }], "2026-10-09");
    expect(s.get("2026-10-06")).toBe(200);
    expect(s.get("2026-10-07")).toBe(200);
    expect(s.get("2026-10-08")).toBeCloseTo(199);
    expect(s.get("2026-10-09")).toBeCloseTo(199);
  });

  it("has nothing before the first weigh-in", () => {
    expect(trendSeries([], "2026-10-05").size).toBe(0);
    expect(trendSeries([{ date: "2026-10-05", weight: 200 }], "2026-10-04").size).toBe(0);
    expect(trendSeries([{ date: "2026-10-07", weight: 200 }], "2026-10-08").has("2026-10-06")).toBe(false);
  });
});

describe("weeklyTrendChange", () => {
  it("is this Sunday's trend minus last Sunday's, or null without both", () => {
    const s = new Map([["2026-10-18", 205.0], ["2026-10-25", 204.6]]);
    expect(weeklyTrendChange(s, "2026-10-25")).toBeCloseTo(-0.4);
    expect(weeklyTrendChange(s, "2026-10-18")).toBeNull();
  });
});
