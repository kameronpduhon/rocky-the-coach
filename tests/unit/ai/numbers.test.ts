import { describe, expect, it } from "vitest";
import { allowedNumbers, readNumbers, strayNumbers } from "~/ai/numbers";

describe("readNumbers", () => {
  it("reads digits with commas and decimals, and drops signs", () => {
    expect(readNumbers("Steps averaged 7,443, short of 8,000. Down 0.4 lb, -0.25 in.")).toEqual([7443, 8000, 0.4, 0.25]);
  });

  it("reads number words, half and quarter, and leaves one and a alone", () => {
    expect(readNumbers("Two lifts moved up, one more to go, a quarter inch off, half a pound, twenty-five minutes")).toEqual([2, 0.25, 0.5, 20, 5]);
    expect(readNumbers("A hundred calories, a thousand steps, Ninety days")).toEqual([100, 1000, 90]);
  });

  it("doesn't read a number word inside another word", () => {
    expect(readNumbers("Weight often settles.")).toEqual([]);
  });
});

describe("strayNumbers", () => {
  it("compares by value against every number in the lines", () => {
    const allowed = allowedNumbers(["Trend weight 205.1 lb, down 0.4 lb this week", "The call: trim 100, from 2,400 to 2,300 cal a day from Monday"]);
    expect(strayNumbers("Down 0.4, so I'm trimming a hundred to 2300.", allowed)).toEqual([]);
    expect(strayNumbers("Trimming 150 to 2,250.", allowed)).toEqual([150, 2250]);
  });
});
