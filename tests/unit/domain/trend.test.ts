import { describe, expect, it } from "vitest";
import { roundLb, trendReading, trendSeries, weeklyTrendChange } from "~/domain/trend";

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

describe("trendReading", () => {
  // The trend: 200 on Oct 5, 199.9 on Oct 6, 199.71 on Oct 7, carried to Oct 8.
  const three = [{ date: "2026-10-05", weight: 200 }, { date: "2026-10-06", weight: 199 }, { date: "2026-10-07", weight: 198 }];

  it("reads the trend to 0.1 lb once there are 3 weigh-ins", () => {
    expect(trendReading(three, "2026-10-08")).toEqual({ weight: 199.7, sinceFrom: null });
    expect(trendReading(three, "2026-10-06")).toBeNull();
    expect(trendReading(three.slice(0, 2), "2026-10-08")).toBeNull();
  });

  it("measures the change from the trend on a start date, or from the first weigh-in after it", () => {
    expect(trendReading(three, "2026-10-08", "2026-10-05")).toEqual({ weight: 199.7, sinceFrom: -0.3 });
    expect(trendReading(three, "2026-10-08", "2026-10-01")).toEqual({ weight: 199.7, sinceFrom: -0.3 });
    // From Oct 6's 199.9: 199.71 - 199.9 = -0.19.
    expect(trendReading(three, "2026-10-08", "2026-10-06")).toEqual({ weight: 199.7, sinceFrom: -0.2 });
    expect(trendReading(three, "2026-10-08", "2026-10-08")).toEqual({ weight: 199.7, sinceFrom: null });
  });
});

describe("roundLb", () => {
  it("rounds to 0.1 lb", () => {
    expect(roundLb(205.1574)).toBe(205.2);
    expect(roundLb(-0.4068)).toBe(-0.4);
  });
});
