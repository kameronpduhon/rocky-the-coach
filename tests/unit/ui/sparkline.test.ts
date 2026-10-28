import { describe, expect, it } from "vitest";
import { sparkPoints } from "~/ui/Sparkline";

const fixed = (pts: [number, number][]) => pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");

describe("sparkPoints", () => {
  it("spreads the sessions across 58 px and the weights across 16", () => {
    // 52 px between the 3 px pads, in steps of 52 / 3. 45 sits on the bottom pad (19) and 55 on the top (3).
    expect(fixed(sparkPoints([45, 50, 50, 55]))).toBe("3.0,19.0 20.3,11.0 37.7,11.0 55.0,3.0");
  });

  it("keeps a flat run in the middle", () => {
    expect(fixed(sparkPoints([15, 15]))).toBe("3.0,11.0 55.0,11.0");
  });
});
