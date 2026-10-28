import { describe, expect, it } from "vitest";
import { COACH_NAME } from "~/brand";
import { groceryCount, previewNextWeek } from "~/checkin/meals";
import { buildCheckIn, type PageChoices } from "~/checkin/model";
import { runMutation } from "~/sync/mutators";
import { MemoryTx } from "~/sync/tx";
import { BOWL, checkInRow, rowsOf, SHOULDER, THIGHS, weekThree } from "./fixture";

const SUNDAY_6PM = new Date("2026-10-25T18:00:00-05:00");
const SUNDAY_9PM = new Date("2026-10-25T21:00:00-05:00");
const rows = rowsOf(weekThree());

describe("buildCheckIn: the window is open", () => {
  it("shows week three's poster, chart and numbers", () => {
    const m = buildCheckIn(rows, SUNDAY_6PM, null);
    expect(m).toMatchObject({
      monday: "2026-10-19",
      sunday: "2026-10-25",
      phase: "open",
      readOnly: false,
      header: "SUNDAY CHECK-IN · OCT 25",
      poster: ["Week 3.", "Down 0.4."],
      meta: "Oct 19 to 25 · 10 weeks to the Jan 1 checkpoint",
      stats: {
        days: { value: "7 of 7", sub: "4 fully on plan" },
        lifts: { value: "3 sessions", sub: "2 of 3 planned, Friday missed, plus Tuesday's extra" },
        steps: { value: "7,443", sub: "goal 7,000" },
      },
      waist: { value: 35.5, note: "was 35.75", editable: true },
    });
    expect(m.chart).toMatchObject({ marker: "2026-10-19", left: "Oct 5 · 205.9", right: "Trend 205.1" });
    // Phase start to Sunday. Two weigh-ins by Oct 5 (Oct 4 and 5), so the line starts on Oct 6, at 205.981.
    expect(m.chart.points).toHaveLength(21);
    expect(m.chart.points[0]).toEqual({ date: "2026-10-05", weight: 205.9, trend: null });
    expect(m.chart.points[1]).toEqual({ date: "2026-10-06", weight: 205.9, trend: 206 });
    expect(m.chart.points.at(-1)).toEqual({ date: "2026-10-25", weight: 204.5, trend: 205.1 });
  });

  it("writes the take and makes Rocky's pick the call until something is chosen", () => {
    const m = buildCheckIn(rows, SUNDAY_6PM, null);
    expect(m.take).toEqual({
      win: "Two lifts moved up. Incline dumbbell press goes to 55 lb.",
      fix: "Friday's workout was missed. Get the next one in.",
      call: "Trend down 0.4 lb. Burn is near 2,680, so calories go to 2,300 from Monday.",
    });
    expect(m.choices).toEqual({ week: "2026-10-19", hunger: null, energy: null, sleep: null, pick: "calories", rest: [BOWL], lifts: { [SHOULDER]: "hold" } });
    expect(m.call!.choice).toBe("calories");
    expect(m.call!.view).toMatchObject({ kcal: 2300, unit: "cal a day from Monday", was: "was 2,400", steps: "Steps 7,500" });
    expect(m.call!.view.options.map((o) => o.value)).toEqual(["calories", "steps"]);
  });

  it("plans next week: moved up, the stuck card, rests, back from rest and the grocery link", () => {
    const m = buildCheckIn(rows, SUNDAY_6PM, null);
    const count = groceryCount(previewNextWeek(rows, "2026-10-19", [BOWL]).map((p) => p.slug));
    expect(count).toBeGreaterThan(20);
    expect(m.next).toEqual({
      deload: false,
      movedUp: [
        { name: "Incline dumbbell press", change: "50 → 55 lb" },
        { name: "Pec deck", change: "130 → 135 lb" },
      ],
      movedUpNote: "2 lifts this week",
      stuck: [{ exercise: SHOULDER, title: "Seated dumbbell shoulder press is stuck", line: "45 × 8, 7 three sessions running.", hold: "Hold 45, chase 8, 8", drop: "Drop to 40, build back", plan: "hold" }],
      repeats: [
        { slug: BOWL, name: "Chicken and rice bowl", rest: true, sub: "4 times · rests 2 weeks" },
        { slug: THIGHS, name: "Honey-glazed chicken thighs", rest: false, sub: "3 times · staying in" },
      ],
      backFromRest: ["Steak and baked potato"],
      groceries: { title: "Grocery list is ready", sub: `${count} items for Oct 26 to Nov 1`, href: "/groceries?week=2026-10-26&from=check-in&kcal=2300&rest=chicken-and-rice-bowl" },
    });
    expect(m.dock).toEqual({ note: "New numbers start Monday morning.", action: "finish", change: false });
    expect(m.finish).toEqual({ week: "2026-10-19", pick: "calories", hunger: null, energy: null, sleep: null, rest: [BOWL], lifts: [{ exercise: SHOULDER, plan: "hold" }] });
  });

  it("follows the choices made on the page, and drops choices made for another week", () => {
    const choices: PageChoices = { week: "2026-10-19", hunger: "fine", energy: null, sleep: "great", pick: "steps", rest: [], lifts: { [SHOULDER]: "drop" } };
    const m = buildCheckIn(rows, SUNDAY_6PM, choices);
    expect(m.call!.view).toMatchObject({ kcal: 2400, was: "holds", steps: "Steps 8,000" });
    expect(m.next!.repeats[0]).toMatchObject({ rest: false, sub: "4 times · staying in" });
    expect(m.next!.stuck[0].plan).toBe("drop");
    expect(m.next!.groceries.href).toBe("/groceries?week=2026-10-26&from=check-in&kcal=2400&rest=");
    expect(m.finish).toEqual({ week: "2026-10-19", pick: "steps", hunger: "fine", energy: null, sleep: "great", rest: [], lifts: [{ exercise: SHOULDER, plan: "drop" }] });
    expect(buildCheckIn(rows, SUNDAY_6PM, { ...choices, week: "2026-10-12" }).finish?.pick).toBe("calories");
  });

  it("turns Rocky's pick to steps when hunger is High two Sundays running", () => {
    const t = weekThree();
    t.check_ins = [checkInRow("2026-10-12", { hunger: "high" })];
    const m = buildCheckIn(rowsOf(t), SUNDAY_6PM, { week: "2026-10-19", hunger: "high", energy: null, sleep: null, pick: null, rest: null, lifts: {} });
    expect(m.call!.choice).toBe("steps");
    expect(m.call!.view.kcal).toBe(2400);
    expect(m.call!.view.why.at(-1)).toBe(`You were hungry two Sundays running, so ${COACH_NAME} picks steps over less food.`);
    expect(m.take!.call).toBe(`Trend down 0.4 lb. You were hungry two Sundays running, so ${COACH_NAME} picks 8,000 steps over less food.`);
  });
});

describe("buildCheckIn: before the window opens", () => {
  it("shows the week so far, with no take, taps, call or next week", () => {
    // Wednesday Oct 28: week 4. No weigh-in since Sunday, so the trend carries and the week reads Steady.
    const m = buildCheckIn(rows, new Date("2026-10-28T10:00:00-05:00"), null);
    expect(m).toMatchObject({
      monday: "2026-10-26",
      phase: "early",
      header: "SUNDAY CHECK-IN · NOV 1",
      poster: ["Week 4.", "Steady."],
      meta: "Oct 26 to Nov 1 · 9 weeks to the Jan 1 checkpoint",
      stats: { lifts: { value: "0 sessions", sub: "0 of 3 planned, Monday missed" } },
      waist: { value: 35.5, note: "last measured Oct 25", editable: false },
      take: null,
      call: null,
      next: null,
      finish: null,
      dock: { note: "Opens Sunday at 5pm.", action: null, change: false },
    });
    // Phase start to today.
    expect(m.chart.points).toHaveLength(24);
  });
});

describe("buildCheckIn: finished", () => {
  /** Week three on a phone that finished: walking, no rests, the shoulder press dropped. */
  async function finished() {
    const tx = new MemoryTx(new Map());
    for (const [table, list] of Object.entries(weekThree())) for (const r of list) tx.put(table, r);
    await runMutation(
      tx,
      "finishCheckIn",
      { week: "2026-10-19", at: "2026-10-25T23:00:00.000Z", pick: "steps", hunger: "fine", energy: null, sleep: null, rest: [], lifts: [{ exercise: SHOULDER, plan: "drop" }] },
      { now: "2026-10-25T23:05:00.000Z", today: "2026-10-25" },
    );
    return (t: string) => [...(tx.tables.get(t)?.values() ?? [])];
  }

  it("shows the saved choices read-only, with a way to change them", async () => {
    const m = buildCheckIn(await finished(), SUNDAY_9PM, null);
    expect(m).toMatchObject({ phase: "finished", readOnly: true, finish: null, dock: { note: "Done. New numbers start Monday morning.", action: "today", change: true } });
    expect(m.choices).toMatchObject({ hunger: "fine", pick: "steps", rest: [], lifts: { [SHOULDER]: "drop" } });
    expect(m.call).toMatchObject({ choice: "steps", view: { kcal: 2400 } });
    expect(m.waist.editable).toBe(false);
    expect(m.next!.groceries.sub).toMatch(/^\d+ items for Oct 26 to Nov 1$/);
  });

  it("reopens on Change my answers, starting from the saved choices", async () => {
    const m = buildCheckIn(await finished(), SUNDAY_9PM, null, true);
    expect(m).toMatchObject({ phase: "finished", readOnly: false, dock: { note: "New numbers start Monday morning.", action: "finish", change: false } });
    expect(m.finish).toMatchObject({ pick: "steps", rest: [], lifts: [{ exercise: SHOULDER, plan: "drop" }] });
  });

  it("can't be changed from Monday 3am", async () => {
    const m = buildCheckIn(await finished(), new Date("2026-10-26T09:00:00-05:00"), null, true);
    expect(m).toMatchObject({ phase: "finished", readOnly: true, dock: { change: false } });
  });
});
