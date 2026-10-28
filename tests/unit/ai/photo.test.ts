import { describe, expect, it } from "vitest";
import { fitLongEdge } from "~/ai/photo";

describe("fitLongEdge", () => {
  it("brings an iPhone photo's long edge to 1,568 px either way up", () => {
    expect(fitLongEdge(4032, 3024)).toEqual({ width: 1568, height: 1176 });
    expect(fitLongEdge(3024, 4032)).toEqual({ width: 1176, height: 1568 });
  });

  it("leaves a smaller photo alone", () => {
    expect(fitLongEdge(1000, 800)).toEqual({ width: 1000, height: 800 });
  });
});
