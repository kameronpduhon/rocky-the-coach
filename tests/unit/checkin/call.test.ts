import { describe, expect, it } from "vitest";
import { COACH_NAME } from "~/brand";
import { callView, changedFoods, scaleChanges, type CallFacts } from "~/checkin/call";
import { factorFor } from "~/content/scaled";
import { nextTarget, type CallInput, type EnergyWeek } from "~/domain/energy";

// Kameron's week 3 (Mon Oct 19): 2,400 a day over 20 tracked days, the trend 206.0 the day before the window (Oct 4)
// and 205.092 on Oct 25, so the observed burn is 2,400 + 3,500 x 0.908 / 21 = 2,551. Halfway from 2,800: 2,676, to 2,680.
const week3: EnergyWeek = {
  weekStart: "2026-10-19", burn: 2680, state: "settling", updates: 1, observed: 2551, intakeAvg: 2400,
  trackedDays: 6, windowTrackedDays: 20, weighIns: 21, trendStart: 206, trendEnd: 205.092,
};

function facts(week: Partial<EnergyWeek> = {}, inp: Partial<CallInput> = {}, over: Partial<CallFacts> = {}): CallFacts {
  const energy = { ...week3, ...week };
  const input: CallInput = { week: energy, trendWeight: 205.092, currentKcal: 2400, stepGoal: 7500, baseStepGoal: 7000, changes: [-0.4, -0.3], maintenanceNext: false, halfPortionKcal: 2050, hungry: false, ...inp };
  return { call: nextTarget(input), energy, lastBurn: 2800, kcal: input.currentKcal, stepGoal: input.baseStepGoal, proteinG: 180, weekNumber: 3, ...over };
}

const FOODS = ["rice", "honey", "potato"];
const PICK = `${COACH_NAME}'s pick.`;
const CANT = `so ${COACH_NAME} can't read your burn yet.`;

describe("callView: an updating week", () => {
  it("explains a settling cut, with walking as the other pick", () => {
    // Ideal: 2,680 - 512.7 = 2,167, down to 2,150. Settling moves 100: 2,300.
    expect(callView(facts(), "calories", FOODS)).toEqual({
      kcal: 2300,
      unit: "cal a day from Monday",
      was: "was 2,400",
      protein: "Protein stays 180 g",
      steps: "Steps 7,500",
      why: [
        "You averaged 2,400 a day and the trend fell 0.9 lb.",
        "That puts your burn near 2,680 a day, lower than the 2,800 we started with.",
        `About 1 lb a week would mean 2,150. Early weeks are noisy, so ${COACH_NAME} moves 100 at a time.`,
      ],
      note: "Burn estimate is still settling. Steady by week 6.",
      options: [
        { value: "calories", title: "Trim 100 cal a day", sub: `${PICK} Smaller portions of rice, honey and potato.` },
        { value: "steps", title: "Keep 2,400, walk 1,000 more", sub: "Steps go to 8,000 a day instead." },
      ],
    });
  });

  it("shows the walking pick's numbers when it is picked", () => {
    expect(callView(facts(), "steps", FOODS)).toMatchObject({ kcal: 2400, unit: "cal a day", was: "holds", steps: "Steps 8,000" });
  });

  it("walks only up to 10,000", () => {
    expect(callView(facts({}, { stepGoal: 9500, baseStepGoal: 9500 }), "calories", FOODS).options[1]).toEqual({ value: "steps", title: "Keep 2,400, walk 500 more", sub: "Steps go to 10,000 a day instead." });
  });

  it("names last week's burn and the 150 cap once settled", () => {
    // 204 lb: a 510 deficit, so 2,690 - 510 = 2,180, down to 2,150. Settled moves 150: 2,250.
    const f = facts({ state: "updating", updates: 5, burn: 2690, intakeAvg: 2350, trendStart: 205, trendEnd: 204 }, { trendWeight: 204 }, { lastBurn: 2700, weekNumber: 8 });
    expect(callView(f, "calories", FOODS)).toMatchObject({
      kcal: 2250,
      why: [
        "You averaged 2,350 a day and the trend fell 1.0 lb.",
        "That puts your burn near 2,690 a day, lower than last week's 2,700.",
        `About 1 lb a week would mean 2,150. ${COACH_NAME} moves up to 150 a week.`,
      ],
      note: null,
    });
  });

  it("leaves out the cap when the move reaches the ideal", () => {
    // 2,850 - 512.7 = 2,337, down to 2,300: exactly one settling move.
    expect(callView(facts({ burn: 2850 }), "calories", FOODS).why).toEqual([
      "You averaged 2,400 a day and the trend fell 0.9 lb.",
      "That puts your burn near 2,850 a day, higher than the 2,800 we started with.",
      "About 1 lb a week would mean 2,300.",
    ]);
  });

  it("says when the trend rose or held level", () => {
    expect(callView(facts({ burn: 2850, trendStart: 205, trendEnd: 205.4 }), "calories", FOODS).why[0]).toBe("You averaged 2,400 a day and the trend rose 0.4 lb.");
    expect(callView(facts({ trendStart: 205.1 }), "calories", FOODS).why[0]).toBe("You averaged 2,400 a day and the trend held level.");
  });

  it("holds on pace, with no pick", () => {
    // 200 lb: a 500 deficit. 2,910 - 500 = 2,410, down to 2,400.
    const f = facts({ state: "updating", updates: 6, burn: 2910, trendStart: 201, trendEnd: 200 }, { trendWeight: 200 }, { lastBurn: 2900 });
    expect(callView(f, "calories", FOODS)).toMatchObject({
      kcal: 2400,
      unit: "cal a day",
      was: "holds",
      why: ["You averaged 2,400 a day and the trend fell 1.0 lb.", "That puts your burn near 2,910 a day, higher than last week's 2,900.", "You're on pace, so the number holds."],
      note: null,
      options: [],
    });
  });

  it("raises when the burn says you're losing too fast", () => {
    // 3,100 - 500 = 2,600. Settling moves 100: 2,500. Two updates by week 4, so the fourth lands in week 6.
    const f = facts({ burn: 3100, updates: 2, trendStart: 202, trendEnd: 200.5 }, { trendWeight: 200 }, { lastBurn: 3000, weekNumber: 4 });
    expect(callView(f, "calories", FOODS)).toMatchObject({
      kcal: 2500,
      was: "was 2,400",
      why: ["You averaged 2,400 a day and the trend fell 1.5 lb.", "That puts your burn near 3,100 a day, higher than last week's 3,000.", `You're losing faster than 1 lb a week, so ${COACH_NAME} adds 100.`],
      note: "Burn estimate is still settling. Steady by week 6.",
      options: [],
    });
  });
});

describe("callView: guardrails", () => {
  it("won't cut after two weeks of losing more than 2 lb", () => {
    expect(callView(facts({ trendStart: 209.6 }, { changes: [-2.2, -2.5] }), "calories", FOODS)).toMatchObject({
      kcal: 2400,
      was: "holds",
      why: [
        "You averaged 2,400 a day and the trend fell 4.5 lb.",
        "That puts your burn near 2,680 a day, lower than the 2,800 we started with.",
        "About 1 lb a week would mean 2,150.",
        `You lost more than 2 lb two weeks running, so ${COACH_NAME} won't cut.`,
      ],
      options: [],
    });
  });

  it("never sets the target above the burn", () => {
    const view = callView(facts({ burn: 2250 }, { trendWeight: 200 }), "calories", FOODS);
    expect(view).toMatchObject({ kcal: 2250, was: "was 2,400" });
    expect(view.why.slice(2)).toEqual(["About 1 lb a week would mean 1,750.", `${COACH_NAME} never sets you above your burn.`]);
    expect(view.options[0].title).toBe("Trim 150 cal a day");
  });

  it("stops at 2,000", () => {
    // Half portions set low here, so the floor is what stops the cut: 2,050 - 150 = 1,900, up to 2,000.
    const f = facts({ state: "updating", updates: 5, burn: 2400 }, { trendWeight: 200, currentKcal: 2050, stepGoal: 8500, baseStepGoal: 8500, halfPortionKcal: 1500 }, { lastBurn: 2450 });
    const view = callView(f, "calories", FOODS);
    expect(view.why.slice(1)).toEqual(["That puts your burn near 2,400 a day, lower than last week's 2,450.", "About 1 lb a week would mean 1,900.", "2,000 is the floor."]);
    expect(view.options.map((o) => o.title)).toEqual(["Trim 50 cal a day", "Keep 2,050, walk 1,000 more"]);
  });

  it("turns a cut past half portions into steps, with steps first", () => {
    // 2,100 - 150 = 1,950, up to the 2,000 floor, then up to half portions at 2,050.
    const f = facts({ state: "updating", updates: 5, burn: 2400 }, { trendWeight: 200, currentKcal: 2100, stepGoal: 8500, baseStepGoal: 8500 }, { lastBurn: 2450 });
    expect(f.call.pick).toBe("steps");
    const view = callView(f, "steps", FOODS);
    expect(view).toMatchObject({ kcal: 2100, unit: "cal a day", was: "holds", steps: "Steps 9,500" });
    expect(view.why.slice(2)).toEqual(["About 1 lb a week would mean 1,900.", "Rice and potato are at half portions, so the rest comes from steps."]);
    expect(view.options).toEqual([
      { value: "steps", title: "Keep 2,100, walk 1,000 more", sub: `${PICK} Steps go to 9,500 a day instead.` },
      { value: "calories", title: "Trim 50 cal a day", sub: "Smaller portions of rice, honey and potato." },
    ]);
  });

  it("holds at half portions when steps are already at 10,000", () => {
    const f = facts({ state: "updating", updates: 5, burn: 2400 }, { trendWeight: 200, currentKcal: 2050, stepGoal: 10000, baseStepGoal: 10000 }, { lastBurn: 2450 });
    const view = callView(f, "calories", FOODS);
    expect(view).toMatchObject({ kcal: 2050, was: "holds", steps: "Steps 10,000", options: [] });
    expect(view.why.at(-1)).toBe("Rice and potato are at half portions and your steps are at 10,000, so the number holds.");
  });
});

describe("callView: holding and maintenance", () => {
  const holding = (week: Partial<EnergyWeek>) => facts({ weekStart: "2026-10-26", state: "holding", ...week }, {}, { lastBurn: 2680, weekNumber: 4 });

  it("holds without enough tracked days this week, and keeps last Sunday's burn", () => {
    expect(callView(holding({ trackedDays: 3, windowTrackedDays: 15 }), "calories", FOODS)).toEqual({
      kcal: 2400,
      unit: "cal a day",
      was: "holds",
      protein: "Protein stays 180 g",
      steps: "Steps 7,500",
      why: [`Only 3 days this week were tracked in full, ${CANT}`, "Burn stays at 2,680 from last Sunday."],
      note: "Burn estimate is holding. Close out each night and it updates next Sunday.",
      options: [],
    });
    expect(callView(holding({ trackedDays: 1 }), "calories", FOODS).why[0]).toBe(`Only 1 day this week was tracked in full, ${CANT}`);
    expect(callView(holding({ trackedDays: 0 }), "calories", FOODS).why[0]).toBe(`No days this week were tracked in full, ${CANT}`);
  });

  it("names the window or the weigh-ins when those are short", () => {
    expect(callView(holding({ trackedDays: 5, windowTrackedDays: 9 }), "calories", FOODS).why[0]).toBe(`Only 9 of the last 21 days were tracked in full, ${CANT}`);
    expect(callView(holding({ trackedDays: 6, windowTrackedDays: 18, weighIns: 6 }), "calories", FOODS).why[0]).toBe(`Only 6 weigh-ins in the last 3 weeks, ${CANT}`);
  });

  it("starts at 2,800 until a week has updated", () => {
    expect(callView(facts({ state: "holding", updates: 0, burn: 2800, trackedDays: 2 }), "calories", FOODS).why).toEqual([`Only 2 days this week were tracked in full, ${CANT}`, "Burn starts at 2,800."]);
  });

  it("waits out the first two weeks, and a window that starts before the first weigh-in", () => {
    const first = ["Two weeks of weigh-ins come first. Burn starts at 2,800."];
    expect(callView(facts({ weekStart: "2026-10-12", state: "holding", updates: 0, burn: 2800 }), "calories", FOODS).why).toEqual(first);
    expect(callView(holding({ updates: 0, burn: 2800, trendStart: null }), "calories", FOODS).why).toEqual(first);
  });

  it("eats at the burn before a maintenance week, with no pick", () => {
    expect(callView(facts({}, { maintenanceNext: true }), "calories", FOODS)).toEqual({
      kcal: 2680,
      unit: "cal a day next week",
      was: "maintenance week",
      protein: "Protein stays 180 g",
      steps: "Steps 7,500",
      why: ["2,680 cal a day next week. Maintenance week: you eat at your burn."],
      note: "Burn estimate is still settling. Steady by week 6.",
      options: [],
    });
  });
});

describe("scaleChanges", () => {
  const week = ["chicken-and-rice-bowl", "honey-glazed-chicken-thighs", "garlic-butter-shrimp-and-rice", "steak-and-baked-potato", "banana-protein-pancakes", "protein-shake", "chicken-and-rice-bowl"];

  it("lists one row per portion food, most-used first, and folds the fats into one line", () => {
    // factorFor(2300) is 0.867: rice 200 to 175 in three meals, honey 15 to 13 in two, potato 300 to 260 in one.
    // Butter is in three meals, at 10 g in two of them: 10 to 9.
    const changes = scaleChanges(week, 1, factorFor(2300));
    expect(changes).toEqual({
      rows: [
        { food: "white-rice-cooked", name: "Rice", meals: "Chicken and rice bowl, Honey-glazed chicken thighs, Garlic butter shrimp and rice", from: 200, to: 175 },
        { food: "honey", name: "Honey", meals: "Honey-glazed chicken thighs, Banana protein pancakes", from: 15, to: 13 },
        { food: "potato-russet-raw", name: "Potato", meals: "Steak and baked potato", from: 300, to: 260 },
      ],
      alsoTrim: "Butter trims a little too.",
    });
    expect(changedFoods(changes)).toEqual(["rice", "honey", "potato"]);
  });

  it("shows a food at its most common weight, the larger on a tie, and names three meals then how many more", () => {
    const mixed = ["chicken-fajita-bowl", "salmon-and-rice", "shrimp-stir-fry", "steak-and-egg-rice-bowl", "chicken-and-rice-bowl", "steak-and-baked-potato", "egg-and-potato-hash"];
    // Rice is 150 g in three of its five meals: 150 to 130. Potato is 300 g once and 200 g once: 300 to 260.
    // Butter (10, 10, 5), avocado 50, cheddar 30 and sesame oil 10 all move.
    expect(scaleChanges(mixed, 1, factorFor(2300))).toEqual({
      rows: [
        { food: "white-rice-cooked", name: "Rice", meals: "Chicken fajita bowl, Salmon and rice, Shrimp stir-fry and 2 more", from: 150, to: 130 },
        { food: "potato-russet-raw", name: "Potato", meals: "Steak and baked potato, Loaded egg and potato hash", from: 300, to: 260 },
      ],
      alsoTrim: "Butter, avocado, cheddar and sesame oil trim a little too.",
    });
  });

  it("leaves out a food whose grams hold at its most common weight", () => {
    // At 0.96 honey 10 stays 10 in all four desserts, and butter 10 stays 10 (its 15 g in the shrimp would move, but 10 is more common).
    const desserts = ["baked-cinnamon-apple", "banana-nice-cream", "greek-yogurt-and-berries", "greek-yogurt-honey-berries"];
    expect(scaleChanges([...desserts, "chicken-and-rice-bowl", "garlic-butter-shrimp-and-rice", "steak-and-baked-potato"], 1, 0.96)).toEqual({
      rows: [
        { food: "white-rice-cooked", name: "Rice", meals: "Chicken and rice bowl, Garlic butter shrimp and rice", from: 200, to: 190 },
        { food: "potato-russet-raw", name: "Potato", meals: "Steak and baked potato", from: 300, to: 290 },
      ],
      alsoTrim: null,
    });
  });

  it("is empty when the target holds, and grows the grams for a maintenance week", () => {
    expect(scaleChanges(week, factorFor(2300), factorFor(2300))).toEqual({ rows: [], alsoTrim: null });
    // factorFor(2680) is 1.374: rice 200 to 275, butter 10 to 14.
    const up = scaleChanges(["chicken-and-rice-bowl"], 1, factorFor(2680));
    expect(up.rows.map((c) => [c.name, c.from, c.to])).toEqual([["Rice", 200, 275]]);
    expect(up.alsoTrim).toBe("Butter trims a little too.");
  });

  it("names three meals, then how many more", () => {
    const desserts = ["baked-cinnamon-apple", "banana-nice-cream", "greek-yogurt-and-berries", "greek-yogurt-honey-berries"];
    expect(scaleChanges(desserts, 1, factorFor(2300)).rows).toEqual([
      { food: "honey", name: "Honey", meals: 'Baked cinnamon apple, Banana "nice cream", Greek yogurt and berries and 1 more', from: 10, to: 9 },
    ]);
  });
});

describe("callView: hungry two Sundays running", () => {
  it("puts walking first as Rocky's pick and says why", () => {
    const view = callView(facts({}, { hungry: true }), "steps", FOODS);
    expect(view.why).toHaveLength(4);
    expect(view.why.at(-1)).toBe(`You were hungry two Sundays running, so ${COACH_NAME} picks steps over less food.`);
    expect(view.options).toEqual([
      { value: "steps", title: "Keep 2,400, walk 1,000 more", sub: `${PICK} Steps go to 8,000 a day instead.` },
      { value: "calories", title: "Trim 100 cal a day", sub: "Smaller portions of rice, honey and potato." },
    ]);
    expect(view).toMatchObject({ kcal: 2400, was: "holds", steps: "Steps 8,000" });
  });

  it("adds nothing when steps are already at 10,000", () => {
    const view = callView(facts({}, { hungry: true, stepGoal: 10000, baseStepGoal: 10000 }), "calories", FOODS);
    expect(view.why).toHaveLength(3);
    expect(view.options).toEqual([]);
  });
});
