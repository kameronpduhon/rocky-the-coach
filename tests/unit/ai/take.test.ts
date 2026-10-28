import { describe, expect, it } from "vitest";
import { checkTake, chooseTake, takeHash, takeLines, type TakeState } from "~/ai/take";
import { buildDigest, type CheckInChoices, type CheckInDigest } from "~/checkin/digest";
import { ruleTake } from "~/checkin/take";
import { rowsOf, weekThree } from "../checkin/fixture";

const NONE: CheckInChoices = { hunger: null, energy: null, sleep: null, rest: null };
const weekThreeDigest = () => buildDigest(rowsOf(weekThree()), "2026-10-19", NONE);
const linesOf = (d: CheckInDigest) => takeLines(d, ruleTake(d));

const WEEK_THREE = [
  "Week 3, Oct 19 to 25",
  "7 of 7 days counted, 4 fully on plan",
  "Trend weight 205.1 lb, down 0.4 lb this week",
  "Waist 35.5 in, down 0.25 in",
  "Protein averaged 170 g a day, target 180 g",
  "Steps averaged 7,443 a day, goal 7,000. Lowest day Saturday, 5,900",
  "3 sessions, 2 of 3 planned. 2 lifts moved up. Seated dumbbell shoulder press stuck at 45 lb",
  "Burn estimate 2,680 a day, settling, steady by week 6",
  "The call: trim 100, from 2,400 to 2,300 cal a day from Monday",
  "Written win: Two lifts moved up. Incline dumbbell press goes to 55 lb.",
  "Written fix: Friday's workout was missed. Get the next one in.",
  "Written call: Trend down 0.4 lb. Burn is near 2,680, so calories go to 2,300 from Monday.",
];

// The CheckInWeek mock's take. Its numbers (three, 0.4, a quarter, 100) are all in week three's lines.
const MOCK =
  "Every day counted and three lifts moved up. Steps were the leak, mostly Saturday and Sunday. The scale only dropped 0.4, but your waist came down a quarter inch, so some of this is muscle going on. I'm trimming 100, not more.";

describe("takeLines", () => {
  it("writes week three as short labelled lines, ending with the rule take", () => {
    expect(linesOf(weekThreeDigest())).toEqual(WEEK_THREE);
  });

  it("leaves out a line the digest has no number for", () => {
    const d = weekThreeDigest();
    d.waist = { now: null, was: 35.75, wasDate: "2026-10-11", change: null };
    d.weight = { ...d.weight, trend: null, change: null };
    d.protein = { ...d.protein, avg: null };
    const lines = linesOf(d);
    expect(lines.filter((l) => /^(Waist|Trend weight|Protein)/.test(l))).toEqual([]);
    expect(lines).toHaveLength(9);
  });

  it("writes each kind of call", () => {
    const callLine = (edit: (c: CheckInDigest["call"]) => CheckInDigest["call"]) => {
      const d = weekThreeDigest();
      d.call = edit(d.call);
      return linesOf(d).find((l) => l.startsWith("The call:"));
    };
    expect(callLine((c) => c)).toBe("The call: trim 100, from 2,400 to 2,300 cal a day from Monday");
    expect(callLine((c) => ({ ...c, kind: "raise", calories: { kcal: 2550, stepGoal: 7500 }, steps: null }))).toBe("The call: raise 150, from 2,400 to 2,550 cal a day from Monday");
    expect(callLine((c) => ({ ...c, kind: "hold", state: "holding", holdReason: "week-days", calories: { kcal: 2400, stepGoal: 7500 }, steps: null }))).toBe(
      "The call: calories hold at 2,400",
    );
    expect(callLine((c) => ({ ...c, pick: "steps", hungry: true }))).toBe("The call: keep 2,400, walk 1,000 more, step goal 8,000");
    expect(callLine((c) => ({ ...c, kind: "maintenance", maintenanceKcal: 2680, steps: null }))).toBe("The call: maintenance week, 2,680 cal a day");
  });
});

describe("checkTake", () => {
  it("passes the CheckInWeek mock's take against week three's lines", () => {
    expect(checkTake(MOCK, WEEK_THREE)).toBe("ok");
  });

  it("fails a number that isn't in the lines", () => {
    expect(checkTake(MOCK.replace("100", "150"), WEEK_THREE)).toBe("numbers");
  });

  it("fails a number only What Rocky knows has", () => {
    // "Feet hurt after 45 minutes of walking. Keep walks under 30." 30 is in no line.
    expect(checkTake(MOCK.replace("not more.", "and keep the walks under 30 minutes."), WEEK_THREE)).toBe("numbers");
  });

  it("fails five sentences, a take past 420 characters, and a line break", () => {
    expect(checkTake(`${MOCK} Run it back.`, WEEK_THREE)).toBe("length");
    expect(checkTake(`${"Keep going ".repeat(40).trim()}.`, WEEK_THREE)).toBe("length");
    expect(checkTake("Every day counted.\nI'm trimming 100.", WEEK_THREE)).toBe("length");
  });

  it("fails an em dash, an en dash and an emoji", () => {
    expect(checkTake("Every day counted \u2014 three lifts moved up.", WEEK_THREE)).toBe("characters");
    expect(checkTake("Down 0.4 \u2013 trimming 100.", WEEK_THREE)).toBe("characters");
    expect(checkTake(`${MOCK} \u{1F4AA}`, WEEK_THREE)).toBe("characters");
  });
});

describe("takeHash", () => {
  it("is 16 hex characters of the lines and voice, and changes with either", async () => {
    expect(await takeHash(WEEK_THREE, "corner")).toBe("c52e7c8afc0ec966");
    expect(await takeHash(WEEK_THREE, "plain")).toBe("0b223cdbae959e0b");
    const moved = WEEK_THREE.map((l) => l.replace("down 0.4 lb this week", "down 0.5 lb this week"));
    expect(await takeHash(moved, "corner")).toBe("9987a8694e7ce534");
  });
});

describe("chooseTake", () => {
  const LINES = ["Week 3, Oct 19 to 25", "Trend weight 205.1 lb, down 0.4 lb this week"];
  const TEXT = "Down 0.4 this week, and the work is showing.";
  const S: TakeState = { aiOn: true, available: true, checking: false, online: true, writable: true, hash: "h-now", stored: null, fresh: null, asked: null };
  const RULE = { view: { kind: "rule" }, ask: false };
  const WAIT = { view: { kind: "waiting" }, ask: false };
  const AI = { view: { kind: "ai", text: TEXT }, ask: false };

  it("shows the rule take with the switch off or no key, and asks nothing", () => {
    expect(chooseTake({ ...S, aiOn: false, stored: { text: TEXT, hash: "h-now" } }, LINES)).toEqual(RULE);
    expect(chooseTake({ ...S, available: false }, LINES)).toEqual(RULE);
  });

  it("waits while the phone is still asking whether the AI is set up, and gives up if the ask fails", () => {
    expect(chooseTake({ ...S, available: null, checking: true }, LINES)).toEqual(WAIT);
    expect(chooseTake({ ...S, available: null, checking: false }, LINES)).toEqual(RULE);
    expect(chooseTake({ ...S, hash: null }, LINES)).toEqual(WAIT);
  });

  it("shows a stored take with the current hash at once, even offline, and never re-asks", () => {
    expect(chooseTake({ ...S, stored: { text: TEXT, hash: "h-now" } }, LINES)).toEqual(AI);
    expect(chooseTake({ ...S, online: false, stored: { text: TEXT, hash: "h-now" } }, LINES)).toEqual(AI);
    expect(chooseTake({ ...S, fresh: { text: TEXT, hash: "h-now" } }, LINES)).toEqual(AI);
    // Matching hash but a number the lines lack: only a deploy that changed the lines can do this.
    expect(chooseTake({ ...S, stored: { text: "Down 0.6 this week.", hash: "h-now" } }, LINES)).toEqual(RULE);
  });

  it("asks for a new take when the numbers or voice changed, once per hash", () => {
    expect(chooseTake({ ...S, stored: { text: TEXT, hash: "h-old" } }, LINES)).toEqual({ view: { kind: "waiting" }, ask: true });
    expect(chooseTake({ ...S, asked: { hash: "h-now", pending: true } }, LINES)).toEqual(WAIT);
    expect(chooseTake({ ...S, asked: { hash: "h-now", pending: false } }, LINES)).toEqual(RULE);
  });

  it("shows the rule take offline with nothing stored, and on a finished week with nothing stored", () => {
    expect(chooseTake({ ...S, online: false }, LINES)).toEqual(RULE);
    expect(chooseTake({ ...S, writable: false }, LINES)).toEqual(RULE);
  });
});
