# N3: The Engine Makes the Call Implementation Plan

> **For agentic workers:** implement this plan task-by-task with the `executing-plans` skill. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** From the first Sunday after this deploys, the adaptive engine makes the weekly call:
- **The trend weight replaces the 7-day average** on Today, the check-in and Progress.
- **The check-in's call block comes from the engine.** It is option 4A: the number, the numbered why-lines, the state note, "Your pick" radios with Rocky's pick first, and "On your scale from Monday".
- **Finish check-in saves the pick.** It writes Monday's targets, the step goal, and the `check_ins` row with the engine's fields. The `outcome` JSON becomes `{ kind, newKcal, newStepGoal, pick, guardrail }`.
- **A maintenance week eats the burn,** from the latest check-in, instead of a flat 2,800.
- **`decideAdjustment` and `app/domain/adjustments.ts` go,** and so does the 7-day average. "Days on plan" stays on the check-in as a display only.
- **Two N1 rules are corrected to the spec.** The burn reads the trend from the day before the 21-day window, over 21 days. The walking pick offers this week's step goal plus 1,000, as v1 did, not 1,000 on top of the ramp.

**There are no migrations in N3.** `check_ins.burn`, `burn_state`, `intake_avg` and `tracked_days` landed in N1 (`drizzle/0008_nutrition_data.sql`). The sync triggers log only row keys and pull reads `SELECT *`, so the phone's copy of `check_ins` already carries `burn`.

**Architecture:**
- **The math is N1's, corrected.** `trendSeries`, `energyHistory` and `nextTarget` in `app/domain/` exist and are tested. N3 puts the burn's slope back to the spec's, makes the walking pick v1's, adds the "no surplus" guardrail, makes a maintenance week's call the burn itself, and adds `trendReading` for display.
- **The words are pure.** `app/checkin/call.ts` turns the engine's numbers into the block: why-lines, state note, picks, and the grams that move. The check-in page reruns it in the browser as the pick changes. Project 4 reuses it with `app/checkin/CallBlock.tsx`.
- **The server reads the history.** `checkInData` loads every weigh-in and each day's meal logs from the phase start, runs `energyHistory` and `nextTarget`, and returns the call. Nothing is stored between weeks.
- **One burn for the maintenance week everywhere.** `resolveTargets` takes the check-ins' burns, so Today, the meal screen, `logMeal`'s snapshot, groceries and the "Was" line all agree.

**Tech Stack:** React Router 8.4 (framework mode, SSR on), Drizzle on D1, the F2 sync layer, Tailwind 4 with the F3 tokens, Vitest 4 (unit project for pure modules, workers project for D1).

**Spec:** `docs/superpowers/specs/2026-10-27-nutrition-design.md` (section 1 "Trend weight", "The call (`nextTarget`)", section 4 "Check-in call", section 3 "Check-ins", rollout step 3, Testing). **N1 plan:** `docs/superpowers/plans/2026-10-27-n1-nutrition-data.md`. **Branch:** `v2/n3-engine-call`, from `main` at `a94bcf6` (N1 and N2 merged and live). This plan is committed there.

**Mocks:**
- Option 4A ("The approved CheckInCall block") and "When it holds" on https://claude.ai/artifact/1yW7smtJTuSnjXQUCjdo9q.
- Artboard `CheckInCall` on https://claude.ai/artifact/65WeReuGH5ZageJng9K6nq.
- **Design system:** `docs/design/system.md`. Where it and a mock disagree on looks, the mock wins, except the colour rules. Where a mock's numbers differ from the spec's math, the math wins.

## Calls made in this plan (flag them in the PR)

**Math:**
- **N3 corrects N1's slope to the spec** (Kameron's call, Oct 28). N1 measured the trend from the window's first day to its last and divided by 20, which gave 2,575 and 2,690 for the spec's worked example. Task 1 measures from the trend the day before the window starts, over 21 days, so the example holds: intake 2,400, the trend down 1.0 lb over the 21 days, prior 2,800, gives observed 2,567 and burn 2,680.
    - **What that costs:** a window needs a trend on the day before it starts. The first window that can update (week 3, Oct 5 to 25) needs a weigh-in on or before Sunday Oct 4. Without one, week 4 is the first to update. The first engine call after this deploys is Sunday Nov 1, week 4, whose window reads from Oct 11, so it is not affected.
- **The ideal rounds down to 50** (N1), not to the nearest 50. It never sits above the burn.
- **"No surplus" gets code.** N1 relied on the rounded-down ideal, but a capped move from above can still leave the target over a burn that dropped: at 2,400 with a burn of 2,250, a settling move of 100 reaches only 2,300. The target then drops to the burn rounded down to 50 (2,250), even past the weekly cap. It runs after fast loss, as the spec orders the guardrails, so it outranks the fast-loss hold.
- **A maintenance week eats the burn to the nearest 10, as stored,** not rounded to 50 as N1's `nextTarget` did. The call and `resolveTargets` then show the same number.
- **The walking pick does not stack on the step ramp** (Kameron's call, Oct 28, correcting N1). "Walk 1,000 more" offers this week's goal plus 1,000, capped at 10,000, as v1 did: the new goal is `min(10,000, max(ramped goal, current goal + 1,000))`. A met 7,000 goal ramps to 7,500 on the calories pick, and the walking pick offers 8,000, not 8,500. When that is no higher than the ramped goal (steps already at 10,000), there is no walking pick. `nextTarget` gains `baseStepGoal`, the goal before the ramp.

**Copy the spec doesn't give** (all in `app/checkin/call.ts`, so one file changes if Kameron rewords them):

| Case | Line |
|---|---|
| The trend rose over the window | "...and the trend rose 0.4 lb." |
| The trend moved under 0.05 lb | "...and the trend held level." |
| No surplus | "Rocky never sets you above your burn." |
| Holding: under 10 tracked days in the 21-day window | "Only 9 of the last 21 days were tracked in full, so Rocky can't read your burn yet." |
| Holding: under 8 weigh-ins in the window | "Only 6 weigh-ins in the last 3 weeks, so Rocky can't read your burn yet." |
| Holding: 1 or 0 tracked days this week | "Only 1 day this week was tracked in full, ..." and "No days this week were tracked in full, ..." |
| Holding before any week has updated | "Burn starts at 2,800." in place of "Burn stays at <burn> from last Sunday." |
| Half portions with steps already at 10,000 | "Rice and potato are at half portions and your steps are at 10,000, so the number holds." |
| The calories pick when it changes nothing (half portions exactly at the current target) | Title "Keep 2,050", subline "Portions stay as they are." |

**How the block reads:**
- **"You averaged <intake> a day and the trend fell <x> lb"** uses the 21-day window for both numbers, because that is what the burn is read from. The weekly change shows in the "Trend" tile above.
- **The cap sentence** ("Early weeks are noisy, so Rocky moves 100 at a time.") shows only when the cap held the move back. A cut that reaches the ideal reads just "About 1 lb a week would mean 2,300."
- **"Your pick" shows only when there are two picks** (a cut, or half portions with steps under 10,000). On pace, a raise, a hold and a maintenance week show no radios, as the mock's "When it holds" frame draws it.
- **The number follows the pick.** Picking "Keep 2,400, walk 1,000 more" turns the number into "2,400 cal a day / holds" and the steps line into "Steps 8,000", and hides "On your scale from Monday", because that is what Monday brings.
- **"Steady by week N"** is this week's number plus the updates left before the fourth. Week 3's first update reads "Steady by week 6". The mock's "week 5" was drawn before the math.
- **A maintenance week's number** reads "2,680 / cal a day next week / maintenance week".
- **"On your scale from Monday"** groups by food and recipe grams, so rice at 200 g and rice at 150 g are two rows. Rows with more meals come first. A row names at most three meals, then "and 2 more". The grams start from this week's target as eaten (a maintenance week included) and end at next week's.
- **The cut's subline names at most three flex foods,** in the order of the scale list: "Smaller portions of rice, honey and butter."

**Behaviour:**
- **"Update check-in" saves the new pick.** The `check_ins` row is updated in place, keeping its first `completed_at`. v1 kept the first row as it was, so the stored outcome could disagree with the targets.
- **A finished check-in opens on its saved pick.** Older rows without `pick` open on Rocky's pick.
- **A finished check-in's call is worked out again on open,** as v1's was. Closing out Sunday after finishing at 5pm can move the burn by a little on a later open.
- **A check-in week before the phase start** has no energy entry, so it holds at 2,800 with "Two weeks of weigh-ins come first."
- **A window with no trend on the day before it starts** (no weigh-in yet by then) has nothing to read, so it holds with the same first-weeks line.
- **The check-in's weight tile reads "Trend"**, and Progress's card reads "Weight · trend" with the legend "Trend".
- **Today's change counts from the trend on the phase start,** or from the first weigh-in if that came later. v1 counted from the first week's 7-day average.

---

## Conventions

- Everything from the earlier plans applies:
    - No em dashes in code, copy, comments, commits or docs.
    - No `Co-Authored-By` lines, no emojis.
    - One commit per task, staged by path. Never `git commit -a`.
    - Commit messages are a plain sentence describing the behaviour, as in `git log`.
    - Look with `npm run dev`.
    - One full `npm run typecheck && npm test` at the end. During tasks, run only the files named in the step, plus `npm run typecheck` where a step says so.
    - Token colours only. Red only for the primary action and live state.
    - Kameron reviews and merges. The build session does not merge. Any `--remote` D1 command, even a read, is handed to Kameron to run.
- **Names come from `app/brand.ts`.** Copy that names the coach uses `COACH_NAME`. Tests build those strings with `COACH_NAME` too.
- `app/checkin/*`, `app/today/*`, `app/meal/*`, `app/content/*` and `app/domain/*` must not import `cloudflare:workers` or any `*.server.ts`. They run in the browser. A `*.server.ts` may import from them.
- Store rows are raw D1 rows: snake_case, booleans `0`/`1`, JSON columns as strings.
- **Numbers in copy** use `toLocaleString("en-US")` ("2,400"). Weights show to 0.1 lb through `roundLb`. A weight change in a why-line always shows one decimal ("1.0 lb"). The goal pace drops a trailing ".0" ("About 1 lb a week").
- **Worker test storage is isolated per file and shared across the tests in a file.** The engine's worker tests get their own file, so other files' seeds can't change the numbers.
- Unit test dates use Chicago daylight time (`-05:00`) and stay before November 1, 2026. The maintenance-week tests (December) pass dates only, no clock.
- **The new block uses the Corner tokens** (`ink`, `ink-3`, `muted`, `rule`, `border`, `raised`). The rest of the v1 check-in keeps its classes until project 4.

## Files

| File | Responsibility |
|---|---|
| `app/domain/energy.ts` | `energyHistory`: the spec's slope. `nextTarget`: v1's walking pick, the "no surplus" guardrail, a maintenance week at the burn; thresholds and caps exported for the copy |
| `app/domain/trend.ts` | `trendReading` and `roundLb`: the trend as screens show it |
| `app/content/targets.ts` | `BurnEntry`, `burnEntries`, `maintenanceKcal`; `resolveTargets` takes the burns |
| `app/content/was.ts` | `recentTargetChange` takes the burns |
| `app/today/slots.ts` | `checkInBurns`; `targetsOn` passes them |
| `app/meal/model.ts`, `app/sync/mutators.ts` | Pass the burns |
| `app/server/targets.server.ts` | `allBurns`; `targetsFor` passes them |
| `app/server/history.server.ts` | Passes the burns |
| `app/today/model.ts` | Today's trend line from the trend |
| `app/server/body.server.ts` | `weighInsThrough` |
| `app/server/progress.server.ts`, `app/components/WeightChart.tsx`, `app/routes/progress.tsx` | Progress draws the trend |
| `app/checkin/call.ts` (new) | `callView`, `scaleChanges`, `changedFoods` |
| `app/checkin/CallBlock.tsx` (new) | The 4A block |
| `app/server/checkin.server.ts` | `checkInData` runs the engine; `completeCheckIn` saves the pick and the engine's fields |
| `app/routes/check-in.tsx` | The block in place of v1's "Rocky's call" card; the Trend tile |
| `app/domain/adjustments.ts`, `app/domain/weight.ts` and their tests | Deleted |

---

### Task 1: The burn reads the trend from the day before the window, over 21 days

N1 measured the window's trend change from its first day to its last and divided by 20. The spec (section 1, "Burn") measures from the trend the day before the window starts, over 21 days. This puts the spec's worked example back: intake 2,400, the trend down 1.0 lb over the 21 days, prior 2,800, gives observed 2,400 + 3,500 x 1.0 / 21 = 2,566.7 and burn 2,800 + (2,566.7 - 2,800) / 2 = 2,683.3, to 2,680.

**Files:**
- Modify: `app/domain/energy.ts`
- Test: `tests/unit/domain/energy.test.ts`

- [ ] **Step 1: Write the failing tests.** In `tests/unit/domain/energy.test.ts`:

1. Replace the `line` fixture with one that starts the day before the phase and falls exactly 1.0 lb over each 21 days:

```ts
// The trend: 210 on Sunday Oct 4, the day before the phase, falling 1.0 lb every 21 days. 209 on Sunday Oct 25.
const line = (d: string) => (d >= "2026-10-04" ? 210 - daysBetween("2026-10-04", d) / 21 : null);
```

2. In "holds at the starting estimate until a full 21-day window exists", change `["2026-10-19", "settling", 2690]` to `["2026-10-19", "settling", 2680]`.

3. Replace the test "reads the burn from intake and the trend, moving halfway there" with:

```ts
  it("reads the burn from intake and the trend the day before the window, over 21 days (the spec's worked example)", () => {
    const week3 = energyHistory(input()).at(-1)!;
    // 2,400 + 3,500 x (210 - 209) / 21 = 2,566.7. Halfway from 2,800: 2,683.3, to 2,680.
    expect(week3.observed).toBeCloseTo(2566.67);
    expect(week3).toMatchObject({ burn: 2680, intakeAvg: 2400, trackedDays: 7, windowTrackedDays: 21, weighIns: 21, updates: 1 });
    expect(week3.trendStart).toBeCloseTo(210);
    expect(week3.trendEnd).toBeCloseTo(209);
  });

  it("holds when there is no trend the day before the window", () => {
    const week3 = energyHistory(input({ trend: (d) => (d >= PHASE ? 210 : null) })).at(-1)!;
    expect(week3).toMatchObject({ state: "holding", burn: 2800, trendStart: null });
  });
```

The other tests stay as they are: the 250 cap still gives 3,050, and the thresholds and the settling count don't depend on the slope.

- [ ] **Step 2: Run them to make sure they fail.**

```bash
npx vitest run --project unit tests/unit/domain/energy.test.ts
```

Expected: 2 FAIL. Week 3's `trendStart` is Oct 5's 209.95, not Oct 4's 210, and the no-trend window updates from Oct 5 instead of holding. On a straight line both slopes give the same burn, so the 2,680 checks already pass. They part when the trend bends, and when there is no trend before the window.

- [ ] **Step 3: Implement.** In `app/domain/energy.ts`, in `energyHistory`, replace

```ts
    const trendStart = input.trend(start);
```

with

```ts
    // The spec's slope: from the trend the day before the window to its last day, over the window's 21 days.
    const trendStart = input.trend(addDays(start, -1));
```

and replace

```ts
      observed = intakeAvg - (KCAL_PER_LB * (trendEnd - trendStart)) / (WINDOW_DAYS - 1);
```

with

```ts
      observed = intakeAvg - (KCAL_PER_LB * (trendEnd - trendStart)) / WINDOW_DAYS;
```

In `interface EnergyWeek`, add a comment above `trendStart`:

```ts
  /** The trend the day before the window starts, and on its last day (Sunday). */
```

- [ ] **Step 4: Run the tests.** Same command as Step 2. Expected: PASS, all 6.

- [ ] **Step 5: Commit.**

```bash
git add app/domain/energy.ts tests/unit/domain/energy.test.ts
git commit -m "The burn reads the trend from the day before its 21-day window, as the spec says"
```

---

### Task 2: The walking pick is v1's, the call never sets the target above the burn, and a maintenance week eats the burn

**Files:**
- Modify: `app/domain/energy.ts`
- Test: `tests/unit/domain/call.test.ts`

- [ ] **Step 1: Write the failing tests.** In `tests/unit/domain/call.test.ts`:

1. In `input()`, change `week: week(2690, "settling")` to `week: week(2680, "settling")` (the spec's worked burn) and add `baseStepGoal: 8500` after `stepGoal: 8500`. The first test's ideal stays 2,150 (2,680 - 514 = 2,166, down to 2,150).
2. Change the maintenance test's expectation from `maintenanceKcal: 2700` to `maintenanceKcal: 2680`.
3. Add these three tests inside the `describe`, after "stops at the 2,000 floor":

```ts
  it("never sets the target above the burn, even past the weekly cap", () => {
    // Burn 2,250 at 200 lb: the ideal is 2,250 - 500 = 1,750. The settling move of 100 only reaches 2,300, over the burn.
    const call = nextTarget(input({ week: week(2250, "settling"), trendWeight: 200 }));
    expect(call).toMatchObject({ kind: "cut", ideal: 1750, guardrail: "no-surplus", pick: "calories", calories: { kcal: 2250, stepGoal: 8500 }, steps: { kcal: 2400, stepGoal: 9500 } });
  });

  it("lets no surplus outrank the fast-loss hold, which comes before it", () => {
    const call = nextTarget(input({ week: week(2250, "settling"), trendWeight: 200, changes: [-2.2, -2.5] }));
    expect(call).toMatchObject({ kind: "cut", guardrail: "no-surplus", calories: { kcal: 2250 } });
  });

  it("offers walking as 1,000 more than this week's goal, not on top of the ramp", () => {
    // A met 7,000 goal ramps to 7,500 on the calories pick. Walking more offers 8,000, as v1 did.
    expect(nextTarget(input({ stepGoal: 7500, baseStepGoal: 7000 }))).toMatchObject({ calories: { kcal: 2300, stepGoal: 7500 }, steps: { kcal: 2400, stepGoal: 8000 } });
    expect(nextTarget(input({ stepGoal: 9500, baseStepGoal: 9500 })).steps).toEqual({ kcal: 2400, stepGoal: 10000 });
    // A met 9,500 goal ramps to 10,000: walking can't add more, so there is no walking pick.
    expect(nextTarget(input({ stepGoal: 10000, baseStepGoal: 9500 })).steps).toBeNull();
  });
```

The maintenance test's name stays "eats at the burn in a maintenance week and keeps the base". Its burn is now 2,680.

- [ ] **Step 2: Run them to make sure they fail.**

```bash
npx vitest run --project unit tests/unit/domain/call.test.ts
```

Expected: 4 FAIL. The two no-surplus tests get `kcal: 2300` and `guardrail: null` (then `"fast-loss"` and 2,400 for the second). The walking test gets 8,500 (1,000 on top of the ramp). The maintenance test gets 2,700 (N1 rounded the burn to 50), not 2,680.

- [ ] **Step 3: Implement.** In `app/domain/energy.ts`:

1. Replace the constants at the top:

```ts
export const KCAL_PER_LB = 3500;
const WINDOW_DAYS = 21;
const MIN_TRACKED_IN_WINDOW = 10;
const MIN_TRACKED_IN_WEEK = 4;
const MIN_WEIGH_INS = 8;
const SMOOTHING = 0.5;
const MAX_BURN_MOVE = 250;
const SETTLING_UPDATES = 4;
```

with (the check-in's copy reads the same thresholds, so a change to one changes both):

```ts
export const KCAL_PER_LB = 3500;
export const WINDOW_DAYS = 21;
export const MIN_TRACKED_IN_WINDOW = 10;
export const MIN_TRACKED_IN_WEEK = 4;
export const MIN_WEIGH_INS = 8;
const SMOOTHING = 0.5;
const MAX_BURN_MOVE = 250;
export const SETTLING_UPDATES = 4;
/** The most the target moves in a week while the burn is settling, and after. */
export const SETTLING_CAP = 100;
export const SETTLED_CAP = 150;
```

2. Change the guardrail type:

```ts
export type Guardrail = "fast-loss" | "no-surplus" | "floor" | "half-portions";
```

3. In `interface Call`, change the `maintenanceKcal` comment to:

```ts
  /** What the maintenance week eats: the burn as stored. The base target stays as it is. */
  maintenanceKcal: number | null;
```

4. In `nextTarget`, change the maintenance line to:

```ts
  if (input.maintenanceNext) return { ...base, kind: "maintenance", ideal: null, maintenanceKcal: week.burn };
```

5. Change `const cap = week.state === "settling" ? 100 : 150;` to:

```ts
  const cap = week.state === "settling" ? SETTLING_CAP : SETTLED_CAP;
```

6. After the fast-loss `if` block and before the floor `if`, add:

```ts
  if (kcal > week.burn) {
    // The rounded-down ideal sits under the burn, but a capped move from above can stop short of it.
    kcal = floor50(week.burn);
    guardrail = "no-surplus";
  }
```

7. In `interface CallInput`, add after `stepGoal`:

```ts
  /** The step goal now, before the ramp. Walking more adds 1,000 to it, as v1 did. */
  baseStepGoal: number;
```

8. In `nextTarget`, replace

```ts
  const walkMore = stepGoal < STEP_CAP ? { kcal: currentKcal, stepGoal: Math.min(stepGoal + STEP_BUMP, STEP_CAP) } : null;
```

with

```ts
  // Walking more doesn't stack on the ramp: it offers this week's goal plus 1,000, and only if that beats the ramp.
  const walkGoal = Math.min(STEP_CAP, Math.max(stepGoal, input.baseStepGoal + STEP_BUMP));
  const walkMore = walkGoal > stepGoal ? { kcal: currentKcal, stepGoal: walkGoal } : null;
```

`nextTarget`'s only caller until Task 8 is this test file, so nothing else needs `baseStepGoal` yet.

- [ ] **Step 4: Run the tests.** Same command as Step 2. Expected: PASS, all 13.

- [ ] **Step 5: Commit.**

```bash
git add app/domain/energy.ts tests/unit/domain/call.test.ts
git commit -m "Walking more adds 1,000 to this week's goal, the call never sets the target above the burn, and a maintenance week eats the burn"
```

---

### Task 3: The trend as the screens show it

**Files:**
- Modify: `app/domain/trend.ts`
- Test: `tests/unit/domain/trend.test.ts`

- [ ] **Step 1: Write the failing tests.** In `tests/unit/domain/trend.test.ts`, change the import to:

```ts
import { roundLb, trendReading, trendSeries, weeklyTrendChange } from "~/domain/trend";
```

and add at the end of the file:

```ts
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
```

- [ ] **Step 2: Run them to make sure they fail.**

```bash
npx vitest run --project unit tests/unit/domain/trend.test.ts
```

Expected: FAIL, "trendReading is not a function" (and `roundLb`).

- [ ] **Step 3: Implement.** Append to `app/domain/trend.ts`:

```ts
/** Fewer weigh-ins than this in all reads as "Not enough weigh-ins", as v1 did. */
export const MIN_TREND_WEIGH_INS = 3;

/** Pounds to one decimal, for display. */
export const roundLb = (n: number) => Math.round(n * 10) / 10;

export interface TrendReading {
  /** The trend on the date, to 0.1 lb. */
  weight: number;
  /** The change since `from`, to 0.1 lb. Null without `from`, or on or before it. */
  sinceFrom: number | null;
}

/**
 * The trend as Today, Progress and the check-in show it. The change since `from` starts at the trend that day, or at
 * the first weigh-in when that came later.
 */
export function trendReading(weighIns: { date: ISODate; weight: number }[], date: ISODate, from?: ISODate): TrendReading | null {
  if (weighIns.filter((w) => w.date <= date).length < MIN_TREND_WEIGH_INS) return null;
  const series = trendSeries(weighIns, date);
  const now = series.get(date)!;
  if (from === undefined || date <= from) return { weight: roundLb(now), sinceFrom: null };
  const first = series.keys().next().value!;
  const base = series.get(from < first ? first : from)!;
  return { weight: roundLb(now), sinceFrom: roundLb(now - base) };
}
```

- [ ] **Step 4: Run the tests.** Same command as Step 2. Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add app/domain/trend.ts tests/unit/domain/trend.test.ts
git commit -m "The trend as the screens show it: 3 weigh-ins first, change since a start date"
```

---

### Task 4: A maintenance week eats the latest check-in's burn

`resolveTargets` gains a required `burns` argument, so the compiler finds every caller: `app/today/slots.ts`, `app/meal/model.ts`, `app/content/was.ts`, `app/sync/mutators.ts`, `app/server/targets.server.ts` and `app/server/history.server.ts`.

**Files:**
- Modify: `app/content/targets.ts`, `app/content/was.ts`, `app/today/slots.ts`, `app/meal/model.ts`, `app/sync/mutators.ts`, `app/server/targets.server.ts`, `app/server/history.server.ts`
- Create test: `tests/unit/targets.test.ts`
- Test: `tests/unit/was.test.ts`, `tests/unit/sync/meal-mutators.test.ts`, `tests/workers/targets.test.ts`

- [ ] **Step 1: Write the failing unit tests.** Create `tests/unit/targets.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { burnEntries, maintenanceKcal, resolveTargets } from "~/content/targets";

// Week 12, Monday Dec 21 to Sunday Dec 27, is the maintenance week. Week 13 starts Monday Dec 28.
const cut = [{ effectiveFrom: "2026-10-26", kcal: 2300, proteinG: 180, stepGoal: 8500 }];
const burns = [
  { weekStart: "2026-12-07", burn: 2720 },
  { weekStart: "2026-12-14", burn: 2680 },
];

describe("maintenance week targets", () => {
  it("eat at the latest check-in's burn and keep the base protein and steps", () => {
    expect(resolveTargets(cut, "2026-12-21", burns)).toEqual({ kcal: 2680, proteinG: 180, stepGoal: 8500 });
    expect(resolveTargets(cut, "2026-12-27", burns).kcal).toBe(2680);
  });

  it("fall back to the plan's 2,800 before any check-in has a burn", () => {
    expect(resolveTargets(cut, "2026-12-23", []).kcal).toBe(2800);
  });

  it("ignore a burn from the maintenance week's own check-in", () => {
    expect(maintenanceKcal([...burns, { weekStart: "2026-12-21", burn: 2900 }], "2026-12-23")).toBe(2680);
  });

  it("go back to the base the week after, and never touch other weeks", () => {
    expect(resolveTargets(cut, "2026-12-28", burns).kcal).toBe(2300);
    expect(resolveTargets(cut, "2026-10-28", burns).kcal).toBe(2300);
  });

  it("read burns from check-in rows, skipping v1 rows without one", () => {
    expect(burnEntries([{ week_start: "2026-10-12", burn: null }, { week_start: "2026-10-19", burn: 2680 }])).toEqual([{ weekStart: "2026-10-19", burn: 2680 }]);
  });
});
```

In `tests/unit/was.test.ts`, add `, []` as the third argument of all six `recentTargetChange(...)` calls, and add this test inside `describe("recentTargetChange")`:

```ts
  it("measures a maintenance week from the burn it eats", () => {
    expect(recentTargetChange(cut, "2026-12-22", [{ weekStart: "2026-12-14", burn: 2680 }])).toEqual({ on: "2026-12-21", fromKcal: 2300, toKcal: 2680, maintenance: "start" });
  });
```

In `tests/unit/sync/meal-mutators.test.ts`, add inside the `describe`, after "logs a batch portion at the grams it was cooked at":

```ts
  it("logs a maintenance-week meal at the grams of the last check-in's burn", async () => {
    const tx = new MemoryTx(new Map());
    tx.put("check_ins", { week_start: "2026-12-14", avg_weight: 200.1, change: -0.6, adherence: 6, outcome: "{}", completed_at: "2026-12-20T23:00:00.000Z", burn: 2680, burn_state: "updating", intake_avg: 2310, tracked_days: 6 });
    await run(tx, "logMeal", { clientId: "m-1", date: "2026-12-22", slot: "lunch", mealSlug: BOWL }, { now: "2026-12-22T19:00:00.000Z", today: "2026-12-22" });
    // 2,680 scales rice 200 g to 275 g. The plan's 2,800 would clamp at 1.5 and give 300 g.
    const want = scaledMeal(bowl, factorFor(2680));
    expect(want.kcal).toBeLessThan(scaledMeal(bowl, factorFor(2800)).kcal);
    expect(await tx.get("meal_logs", "m-1")).toMatchObject({ kcal: want.kcal, protein_g: want.protein });
  });
```

- [ ] **Step 2: Run them to make sure they fail.**

```bash
npx vitest run --project unit tests/unit/targets.test.ts tests/unit/was.test.ts tests/unit/sync/meal-mutators.test.ts
```

Expected: `targets.test.ts` FAILS ("burnEntries is not a function"). In `was.test.ts` the new test gets `toKcal: 2800`. The new mutator test logs at 2,800's grams.

- [ ] **Step 3: The rule.** In `app/content/targets.ts`:

1. Replace the imports with:

```ts
import { weekType } from "~/domain/calendar";
import { weekStart } from "~/domain/dates";
import type { ISODate } from "~/domain/types";
import { plan } from "./index";
```

2. Add after `interface TargetEntry`:

```ts
/** A finished check-in's burn estimate, kcal a day. */
export interface BurnEntry {
  /** The Monday of the week the check-in reviewed. */
  weekStart: ISODate;
  burn: number;
}

/** Burns from raw `check_ins` rows: the phone's copy, or a mutator's scan. v1 rows have none. */
export function burnEntries(rows: Record<string, unknown>[]): BurnEntry[] {
  return rows.filter((r) => typeof r.burn === "number").map((r) => ({ weekStart: r.week_start as ISODate, burn: r.burn as number }));
}

/** What a maintenance week eats: the burn from the latest check-in before that week, or the plan's estimate before any. */
export function maintenanceKcal(burns: BurnEntry[], date: ISODate): number {
  const monday = weekStart(date);
  let latest: BurnEntry | null = null;
  for (const b of burns) if (b.weekStart < monday && (latest === null || b.weekStart > latest.weekStart)) latest = b;
  return latest?.burn ?? plan.maintenanceKcal;
}
```

3. Replace `resolveTargets` with:

```ts
export function resolveTargets(rows: TargetEntry[], date: ISODate, burns: BurnEntry[]): Targets {
  const base = resolveBaseTargets(rows, date);
  return weekType(plan, date) === "maintenance" ? { ...base, kcal: maintenanceKcal(burns, date) } : base;
}
```

- [ ] **Step 4: The "Was" line.** In `app/content/was.ts`, change the targets import to:

```ts
import { resolveTargets, type BurnEntry, type TargetEntry } from "./targets";
```

and `recentTargetChange` to:

```ts
/** The latest change to the day's calorie target in the 7 days up to and including `date`. */
export function recentTargetChange(entries: TargetEntry[], date: ISODate, burns: BurnEntry[]): TargetChange | null {
  const maintenance = (d: ISODate) => weekType(plan, d) === "maintenance";
  for (let i = 0; i < WAS_DAYS; i++) {
    const on = addDays(date, -i);
    const before = addDays(on, -1);
    const toKcal = resolveTargets(entries, on, burns).kcal;
    const fromKcal = resolveTargets(entries, before, burns).kcal;
    if (toKcal === fromKcal) continue;
    return { on, fromKcal, toKcal, maintenance: maintenance(on) && !maintenance(before) ? "start" : !maintenance(on) && maintenance(before) ? "end" : null };
  }
  return null;
}
```

- [ ] **Step 5: The phone's readers.**

1. `app/today/slots.ts`: change the targets import to

```ts
import { burnEntries, resolveTargets, type BurnEntry, type TargetEntry, type Targets } from "~/content/targets";
```

and replace `targetsOn` with:

```ts
/** The check-ins' burns, for a maintenance week. */
export function checkInBurns(rows: Rows): BurnEntry[] {
  return burnEntries(rows("check_ins"));
}

export function targetsOn(rows: Rows, date: ISODate): Targets {
  return resolveTargets(targetEntries(rows), date, checkInBurns(rows));
}
```

2. `app/meal/model.ts`: change the slots import to

```ts
import { checkInBurns, DAY_NAME, daySlots, restedOn, SLOT_LABEL, targetEntries, type Rows } from "~/today/slots";
```

and in `buildMeal` replace

```ts
  const entries = targetEntries(rows);
  const targets = resolveTargets(entries, date);
  const factor = factorFor(targets.kcal);
  const slots = daySlots(rows, date, factor);
  const change = recentTargetChange(entries, date);
```

with

```ts
  const entries = targetEntries(rows);
  const burns = checkInBurns(rows);
  const targets = resolveTargets(entries, date, burns);
  const factor = factorFor(targets.kcal);
  const slots = daySlots(rows, date, factor);
  const change = recentTargetChange(entries, date, burns);
```

3. `app/sync/mutators.ts`: change `import { resolveTargets } from "~/content/targets";` to `import { burnEntries, resolveTargets } from "~/content/targets";`, and in `dayFactor` change the `return` to:

```ts
  // A maintenance week eats the latest check-in's burn.
  return factorFor(resolveTargets(rows, date, burnEntries(await tx.scan("check_ins"))).kcal);
```

- [ ] **Step 6: The server's readers.**

1. `app/server/targets.server.ts`: replace the imports and the re-export with

```ts
import { asc, isNotNull } from "drizzle-orm";
import { resolveBaseTargets, resolveTargets, type BurnEntry, type Targets } from "~/content/targets";
import type { Db } from "~/db/client";
import { checkIns, targets } from "~/db/schema";
import type { ISODate } from "~/domain/types";

export { resolveBaseTargets, resolveTargets, type BurnEntry, type Targets } from "~/content/targets";
```

add after `allTargets`

```ts
export async function allBurns(db: Db): Promise<BurnEntry[]> {
  const rows = await db.select({ weekStart: checkIns.weekStart, burn: checkIns.burn }).from(checkIns).where(isNotNull(checkIns.burn)).orderBy(asc(checkIns.weekStart)).all();
  return rows.map((r) => ({ weekStart: r.weekStart, burn: r.burn! }));
}
```

and replace `targetsFor` with

```ts
export async function targetsFor(db: Db, date: ISODate): Promise<Targets> {
  const [rows, burns] = await Promise.all([allTargets(db), allBurns(db)]);
  return resolveTargets(rows, date, burns);
}
```

2. `app/server/history.server.ts`: change the import to `import { allBurns, allTargets, resolveTargets, type Targets } from "./targets.server";`. In `dayResults`, change the destructuring to `const [food, steps, targetRows, desserts, burns] = await Promise.all([`, add `allBurns(db),` as the last entry of that array (after the desserts query), and change `const t = resolveTargets(targetRows, date);` to `const t = resolveTargets(targetRows, date, burns);`.

- [ ] **Step 7: The worker test.** In `tests/workers/targets.test.ts`, change the schema import to `import { checkIns, targets } from "~/db/schema";` and add at the end of the `describe`:

```ts
  it("eats at the latest check-in's burn in the maintenance week, then goes back to the base", async () => {
    await db().insert(checkIns).values({ weekStart: "2026-12-14", adherence: 6, outcome: "{}", completedAt: "2026-12-20T23:00:00.000Z", burn: 2650, burnState: "updating", intakeAvg: 2280, trackedDays: 6 });
    expect((await targetsFor(db(), "2026-12-22")).kcal).toBe(2650);
    expect((await targetsFor(db(), "2026-12-28")).kcal).toBe(2250);
  });
```

The earlier tests in that file leave 2,250 from Nov 2 as the base, and "eats at maintenance in the maintenance week" still expects 2,800 because it runs before this row exists.

- [ ] **Step 8: Run the tests.**

```bash
npx vitest run --project unit tests/unit/targets.test.ts tests/unit/was.test.ts tests/unit/sync/meal-mutators.test.ts tests/unit/meal/model.test.ts tests/unit/today/model.test.ts
npx vitest run --project workers tests/workers/targets.test.ts
npm run typecheck
```

Expected: all PASS, no type errors.

- [ ] **Step 9: Commit.**

```bash
git add app/content/targets.ts app/content/was.ts app/today/slots.ts app/meal/model.ts app/sync/mutators.ts app/server/targets.server.ts app/server/history.server.ts tests/unit/targets.test.ts tests/unit/was.test.ts tests/unit/sync/meal-mutators.test.ts tests/workers/targets.test.ts
git commit -m "A maintenance week eats the latest check-in's burn, not 2,800"
```

---

### Task 5: Today's trend line reads the trend weight

**Files:**
- Modify: `app/today/model.ts`
- Test: `tests/unit/today/model.test.ts`

- [ ] **Step 1: Write the failing test.** Add inside the `describe` in `tests/unit/today/model.test.ts`, after "builds the streak and the week strip from counted days":

```ts
  it("reads the trend weight, so one weigh-in a week still makes a line", () => {
    // 207, 206, 205 and 204, a week or more apart. The trend moves a tenth of the way each time: 207, 206.9, 206.71, 206.439.
    const weighIns: Row[] = (
      [
        ["2026-10-05", 207],
        ["2026-10-12", 206],
        ["2026-10-19", 205],
        [WED, 204],
      ] as const
    ).map(([date, w]) => ({ date, weight_lb: w, logged_at: `${date}T12:00:00Z` }));
    const line = (rows: Row[]) => asPlan(buildToday(rowsOf({ planned_meals: planned(WED), weigh_ins: rows }), at(WED, "09:00"), true)).trendLine;
    expect(line(weighIns)).toBe("Trend 206.4 lb, down 0.6 since Oct 5.");
    expect(line(weighIns.slice(2))).toBeNull();
  });
```

- [ ] **Step 2: Run it to make sure it fails.**

```bash
npx vitest run --project unit tests/unit/today/model.test.ts
```

Expected: the new test FAILS with `null`. The 7-day average needs 3 weigh-ins in Oct 22 to 28, and there is 1.

- [ ] **Step 3: Implement.** In `app/today/model.ts`, replace `import { sevenDayAverage } from "~/domain/weight";` with `import { trendReading } from "~/domain/trend";`, and replace `trendLine` with:

```ts
function trendLine(weights: { date: ISODate; weight: number }[], date: ISODate): string | null {
  const t = trendReading(weights, date, plan.phaseStart);
  if (!t) return null;
  if (t.sinceFrom === null) return `Trend ${t.weight} lb.`;
  const change = t.sinceFrom < 0 ? `down ${Math.abs(t.sinceFrom)}` : t.sinceFrom > 0 ? `up ${t.sinceFrom}` : "level";
  return `Trend ${t.weight} lb, ${change} since ${monthDay(plan.phaseStart)}.`;
}
```

- [ ] **Step 4: Run the tests.** Same command as Step 2. Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add app/today/model.ts tests/unit/today/model.test.ts
git commit -m "Today's trend line reads the trend weight"
```

---

### Task 6: Progress draws the trend weight

**Files:**
- Modify: `app/server/body.server.ts`, `app/server/progress.server.ts`, `app/components/WeightChart.tsx`, `app/routes/progress.tsx`
- Test: `tests/workers/progress.test.ts`

- [ ] **Step 1: Write the failing test.** In `tests/workers/progress.test.ts`, replace

```ts
    expect(p.series[0]).toEqual({ date: "2026-10-05", weight: 207, avg: null });
    expect(p.series[13].avg).not.toBeNull();
    expect(p.latestAvg).toBe(p.series[13].avg);
```

with

```ts
    // Weigh-ins 207, 206.9, 206.7, ... 205.3. The trend starts with the third: 207, 206.99, 206.961.
    expect(p.series[0]).toEqual({ date: "2026-10-05", weight: 207, trend: null });
    expect(p.series[1].trend).toBeNull();
    expect(p.series[2]).toEqual({ date: "2026-10-07", weight: 206.7, trend: 207 });
    // Oct 18's trend is 206.18, which is 0.82 below Oct 5's.
    expect(p.latestTrend).toBe(206.2);
    expect(p.series[13].trend).toBe(206.2);
    expect(p.changeSinceStart).toBe(-0.8);
```

- [ ] **Step 2: Run it to make sure it fails.**

```bash
npx vitest run --project workers tests/workers/progress.test.ts
```

Expected: FAIL. The series rows have `avg`, not `trend`.

- [ ] **Step 3: All weigh-ins up to a date.** In `app/server/body.server.ts`, change the first import to `import { between, desc, eq, lte } from "drizzle-orm";` and add after `weighInsBetween`:

```ts
/** Every weigh-in up to a date. The trend starts at the first one ever. */
export function weighInsThrough(db: Db, to: ISODate) {
  return db.select().from(weighIns).where(lte(weighIns.date, to)).orderBy(weighIns.date).all();
}
```

- [ ] **Step 4: The series.** In `app/server/progress.server.ts`:

1. Replace

```ts
import type { ISODate } from "~/domain/types";
import { sevenDayAverage } from "~/domain/weight";
import { waistLogsAll, weighInsBetween } from "./body.server";
```

with

```ts
import { MIN_TREND_WEIGH_INS, roundLb, trendReading, trendSeries } from "~/domain/trend";
import type { ISODate } from "~/domain/types";
import { waistLogsAll, weighInsThrough } from "./body.server";
```

2. In `ProgressData`, replace the `series` and `latestAvg` lines with:

```ts
  series: { date: ISODate; weight: number | null; trend: number | null }[];
  latestTrend: number | null;
```

3. In the `Promise.all`, replace `weighInsBetween(db, addDays(start, -7), today),` with `weighInsThrough(db, today),`.

4. Replace from `const weighIns = weighInRows.map(` through `const latestAvg = avgs.at(-1) ?? null;` with:

```ts
  const weighIns = weighInRows.map((w) => ({ date: w.date, weight: w.weightLb }));
  const byDate = new Map(weighIns.map((w) => [w.date, w.weight]));
  const lastWeighIn = weighIns.at(-1)?.date ?? start;
  const end = lastWeighIn > today ? today : lastWeighIn;
  const trend = trendSeries(weighIns, end);
  const series = [];
  for (let i = 0; i <= Math.max(0, daysBetween(start, end)); i++) {
    const date = addDays(start, i);
    // As on Today and the check-in, the line starts with the third weigh-in.
    const enough = weighIns.filter((w) => w.date <= date).length >= MIN_TREND_WEIGH_INS;
    const t = trend.get(date);
    series.push({ date, weight: byDate.get(date) ?? null, trend: enough && t !== undefined ? roundLb(t) : null });
  }
  const reading = trendReading(weighIns, end, start);
```

5. In the returned object, replace

```ts
    latestAvg,
    changeSinceStart: latestAvg !== null && firstWeight !== null ? Math.round((latestAvg - firstWeight) * 10) / 10 : null,
```

with

```ts
    latestTrend: reading?.weight ?? null,
    changeSinceStart: reading?.sinceFrom ?? null,
```

- [ ] **Step 5: The chart.** Replace `app/components/WeightChart.tsx` with:

```tsx
import { useEffect, useRef, useState } from "react";

type Point = { date: string; weight: number | null; trend: number | null };

const H = 170;
const LEFT = 34;
const TOP = 10;
const PLOT_H = 136;

const label = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/**
 * Whole-pound gridlines at the top and bottom of the plot, so every dot and the trend line sit between
 * labelled lines. The step doubles until there are at most 4 bands.
 */
export function yScale(min: number, max: number) {
  let step = 1;
  let lo = Math.floor(min - 0.1);
  let hi = Math.ceil(max + 0.1);
  while ((hi - lo) / step > 4) {
    step *= 2;
    lo = Math.floor(lo / step) * step;
    hi = Math.ceil(hi / step) * step;
  }
  const ticks: number[] = [];
  for (let t = hi; t >= lo; t -= step) ticks.push(t);
  return { lo, hi, ticks };
}

export function WeightChart({ series }: { series: Point[] }) {
  // Draw in real pixels so labels keep their 11 px size on wide screens instead of scaling with the viewBox.
  const ref = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(350);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setW(Math.max(260, Math.round(entry.contentRect.width))));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const values = series.flatMap((p) => [p.weight, p.trend]).filter((v): v is number => v !== null);
  if (values.length < 2) return <p className="py-8 text-center text-[15px] text-label-2">Weigh in a few days to see your trend.</p>;
  const { lo, hi, ticks } = yScale(Math.min(...values), Math.max(...values));
  const x = (i: number) => LEFT + 5 + (i * (W - LEFT - 16)) / Math.max(1, series.length - 1);
  const y = (v: number) => TOP + ((hi - v) / (hi - lo)) * PLOT_H;
  const trendPoints = series
    .map((p, i) => (p.trend !== null ? `${x(i).toFixed(1)},${y(p.trend).toFixed(1)}` : null))
    .filter(Boolean)
    .join(" ");
  const lastTrendIndex = series.findLastIndex((p) => p.trend !== null);
  const weights = series.map((p) => p.weight).filter((v): v is number => v !== null);
  const summary =
    `Weight from ${label(series[0].date)} to ${label(series.at(-1)!.date)}.` +
    (weights.length ? ` Daily weigh-ins range from ${Math.min(...weights)} to ${Math.max(...weights)} pounds.` : "") +
    (lastTrendIndex >= 0 ? ` The trend is ${series[lastTrendIndex].trend} pounds.` : "");

  return (
    <div ref={ref}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={summary} className="tabular">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={LEFT} x2={W} y1={y(t)} y2={y(t)} stroke="var(--fill)" />
            <text x="0" y={y(t) + 4} fill="var(--label-3)" fontSize="12" fontWeight="700">
              {t}
            </text>
          </g>
        ))}
        {series.map((p, i) => (p.weight !== null ? <circle key={p.date} cx={x(i)} cy={y(p.weight)} r="3" fill="var(--chart-dot)" /> : null))}
        <polyline fill="none" stroke="var(--protein)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" points={trendPoints} />
        {lastTrendIndex >= 0 && <circle cx={x(lastTrendIndex)} cy={y(series[lastTrendIndex].trend!)} r="5" fill="var(--protein)" stroke="var(--card)" strokeWidth="2" />}
        <text x={x(0)} y={H - 6} fill="var(--label-3)" fontSize="12" fontWeight="700">
          {label(series[0].date)}
        </text>
        {series.length > 1 && (
          <text x={x(series.length - 1)} y={H - 6} fill="var(--label-3)" fontSize="12" fontWeight="700" textAnchor="end">
            {label(series.at(-1)!.date)}
          </text>
        )}
      </svg>
    </div>
  );
}
```

- [ ] **Step 6: The labels.** In `app/routes/progress.tsx`, in the "Weight trend" card:
    - `Weight · 7-day average` becomes `Weight · trend`.
    - `{p.latestAvg ?? "--"}` becomes `{p.latestTrend ?? "--"}`.
    - `{p.latestAvg === null && <p className="text-[14px] text-label-2">Not enough weigh-ins. The average needs 3 in a week.</p>}` becomes `{p.latestTrend === null && <p className="text-[14px] text-label-2">Not enough weigh-ins. The trend needs 3.</p>}`.
    - The legend's `7-day average` becomes `Trend`.

- [ ] **Step 7: Run the tests and typecheck.**

```bash
npx vitest run --project workers tests/workers/progress.test.ts tests/workers/progress-route.test.ts
npx vitest run --project unit tests/unit/weight-chart.test.ts
npm run typecheck
```

Expected: PASS, no type errors.

- [ ] **Step 8: Commit.**

```bash
git add app/server/body.server.ts app/server/progress.server.ts app/components/WeightChart.tsx app/routes/progress.tsx tests/workers/progress.test.ts
git commit -m "Progress draws the trend weight, not the 7-day average"
```

---

### Task 7: The call in words

Every number here was worked out by hand from the engine's formulas. The goal at a trend of 205.092 lb is 0.005 x 205.092 = 1.025 lb a week, a deficit of 1.025 x 3,500 / 7 = 512.7 a day.

**Files:**
- Create: `app/checkin/call.ts`
- Test: `tests/unit/checkin/call.test.ts`

- [ ] **Step 1: Write the failing tests.** Create `tests/unit/checkin/call.test.ts`:

```ts
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
  const input: CallInput = { week: energy, trendWeight: 205.092, currentKcal: 2400, stepGoal: 7500, baseStepGoal: 7000, changes: [-0.4, -0.3], maintenanceNext: false, halfPortionKcal: 2050, ...inp };
  return { call: nextTarget(input), energy, lastBurn: 2800, kcal: input.currentKcal, stepGoal: input.baseStepGoal, proteinG: 180, weekNumber: 3, ...over };
}

const FOODS = ["rice", "honey", "butter", "potato"];
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
        { value: "calories", title: "Trim 100 cal a day", sub: `${PICK} Smaller portions of rice, honey and butter.` },
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
      { value: "calories", title: "Trim 50 cal a day", sub: "Smaller portions of rice, honey and butter." },
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

  it("lists each flex food and recipe weight that moves, most-used first, with the meals that use it", () => {
    // factorFor(2300) is 0.867: rice 200 to 175, honey 15 to 13, butter 10 to 9 and 15 to 13, potato 300 to 260.
    const changes = scaleChanges(week, 1, factorFor(2300));
    expect(changes).toEqual([
      { food: "white-rice-cooked", name: "Rice", meals: "Chicken and rice bowl, Honey-glazed chicken thighs, Garlic butter shrimp and rice", from: 200, to: 175 },
      { food: "honey", name: "Honey", meals: "Honey-glazed chicken thighs, Banana protein pancakes", from: 15, to: 13 },
      { food: "butter", name: "Butter", meals: "Chicken and rice bowl, Steak and baked potato", from: 10, to: 9 },
      { food: "potato-russet-raw", name: "Potato", meals: "Steak and baked potato", from: 300, to: 260 },
      { food: "butter", name: "Butter", meals: "Garlic butter shrimp and rice", from: 15, to: 13 },
    ]);
    expect(changedFoods(changes)).toEqual(["rice", "honey", "butter", "potato"]);
  });

  it("is empty when the target holds, and grows the grams for a maintenance week", () => {
    expect(scaleChanges(week, factorFor(2300), factorFor(2300))).toEqual([]);
    // factorFor(2680) is 1.374: rice 200 to 275, butter 10 to 14.
    expect(scaleChanges(["chicken-and-rice-bowl"], 1, factorFor(2680)).map((c) => [c.name, c.from, c.to])).toEqual([
      ["Rice", 200, 275],
      ["Butter", 10, 14],
    ]);
  });

  it("names three meals, then how many more", () => {
    const desserts = ["baked-cinnamon-apple", "banana-nice-cream", "greek-yogurt-and-berries", "greek-yogurt-honey-berries"];
    expect(scaleChanges(desserts, 1, factorFor(2300))).toEqual([
      { food: "honey", name: "Honey", meals: 'Baked cinnamon apple, Banana "nice cream", Greek yogurt and berries and 1 more', from: 10, to: 9 },
    ]);
  });
});
```

- [ ] **Step 2: Run them to make sure they fail.**

```bash
npx vitest run --project unit tests/unit/checkin/call.test.ts
```

Expected: FAIL, "Cannot find module '~/checkin/call'".

- [ ] **Step 3: Implement.** Create `app/checkin/call.ts`:

```ts
// The check-in's call, in words. Every number comes from the engine and every line is written by a rule (spec section
// 4, "Check-in call"). Pure: the check-in page reruns it in the browser as the pick changes, and project 4 reuses it.
import { COACH_NAME } from "~/brand";
import { foods, meals, plan } from "~/content";
import { flexName } from "~/content/was";
import { addDays } from "~/domain/dates";
import {
  KCAL_FLOOR,
  MIN_TRACKED_IN_WEEK,
  MIN_TRACKED_IN_WINDOW,
  MIN_WEIGH_INS,
  SETTLED_CAP,
  SETTLING_CAP,
  SETTLING_UPDATES,
  WINDOW_DAYS,
  type Call,
  type EnergyWeek,
  type Guardrail,
} from "~/domain/energy";
import { scaleIngredient } from "~/domain/rescale";
import { STEP_CAP } from "~/domain/steps";

export type CallPick = "calories" | "steps";

export interface CallFacts {
  call: Call;
  /** This week's entry from `energyHistory`. */
  energy: EnergyWeek;
  /** Last week's burn: the plan's 2,800 until a week has updated. */
  lastBurn: number;
  /** The base calorie target now, its step goal before the ramp, and its protein. */
  kcal: number;
  stepGoal: number;
  proteinG: number;
  weekNumber: number;
}

export interface CallOptionView {
  value: CallPick;
  title: string;
  sub: string;
}

export interface CallView {
  kcal: number;
  /** "cal a day from Monday", "cal a day" or "cal a day next week". */
  unit: string;
  /** "was 2,400", "holds" or "maintenance week". */
  was: string;
  protein: string;
  steps: string;
  why: string[];
  /** For a settling or holding burn only. */
  note: string | null;
  /** Rocky's pick first. Empty when there is nothing to choose. */
  options: CallOptionView[];
}

const num = (n: number) => n.toLocaleString("en-US");
/** A weight change, always with one decimal: "1.0". */
const lb = (n: number) => (Math.round(n * 10) / 10).toFixed(1);
const list = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);
const CANT = `so ${COACH_NAME} can't read your burn yet.`;

function readLines({ energy: e, lastBurn }: CallFacts): string[] {
  const fell = e.trendStart! - e.trendEnd!;
  const trend = Math.abs(fell) < 0.05 ? "the trend held level" : fell > 0 ? `the trend fell ${lb(fell)} lb` : `the trend rose ${lb(-fell)} lb`;
  const than = e.burn < lastBurn ? "lower than" : e.burn > lastBurn ? "higher than" : "level with";
  const before = e.updates === 1 ? `the ${num(lastBurn)} we started with` : `last week's ${num(lastBurn)}`;
  return [`You averaged ${num(e.intakeAvg!)} a day and ${trend}.`, `That puts your burn near ${num(e.burn)} a day, ${than} ${before}.`];
}

function holdingLines({ energy: e }: CallFacts): string[] {
  const firstWeeks = [`Two weeks of weigh-ins come first. Burn starts at ${num(plan.maintenanceKcal)}.`];
  // The first two weeks' windows reach back before the phase began, so they can't update.
  if (addDays(e.weekStart, 6 - (WINDOW_DAYS - 1)) < plan.phaseStart) return firstWeeks;
  let reason: string;
  if (e.trackedDays < MIN_TRACKED_IN_WEEK) {
    const n = e.trackedDays;
    reason = n === 0 ? `No days this week were tracked in full, ${CANT}` : `Only ${n} ${n === 1 ? "day this week was" : "days this week were"} tracked in full, ${CANT}`;
  } else if (e.windowTrackedDays < MIN_TRACKED_IN_WINDOW) {
    reason = `Only ${e.windowTrackedDays} of the last ${WINDOW_DAYS} days were tracked in full, ${CANT}`;
  } else if (e.weighIns < MIN_WEIGH_INS) {
    reason = `Only ${e.weighIns} ${e.weighIns === 1 ? "weigh-in" : "weigh-ins"} in the last 3 weeks, ${CANT}`;
  } else {
    // Every count passed, so there was no weigh-in yet by the day before the window: no trend to read it from.
    return firstWeeks;
  }
  return [reason, e.updates === 0 ? `Burn starts at ${num(plan.maintenanceKcal)}.` : `Burn stays at ${num(e.burn)} from last Sunday.`];
}

const GUARDRAIL: Record<Guardrail, (call: Call) => string> = {
  "fast-loss": () => `You lost more than 2 lb two weeks running, so ${COACH_NAME} won't cut.`,
  "no-surplus": () => `${COACH_NAME} never sets you above your burn.`,
  floor: () => `${num(KCAL_FLOOR)} is the floor.`,
  "half-portions": (call) =>
    call.steps
      ? "Rice and potato are at half portions, so the rest comes from steps."
      : `Rice and potato are at half portions and your steps are at ${num(STEP_CAP)}, so the number holds.`,
};

function moveLines({ call, energy, kcal }: CallFacts): string[] {
  const goal = String(Math.round(call.goalLbPerWeek * 10) / 10);
  if (call.kind === "on-pace") return ["You're on pace, so the number holds."];
  if (call.kind === "raise" && !call.guardrail) return [`You're losing faster than ${goal} lb a week, so ${COACH_NAME} adds ${num(call.calories.kcal - kcal)}.`];
  const aim = `About ${goal} lb a week would mean ${num(call.ideal!)}.`;
  if (call.guardrail) return [aim, GUARDRAIL[call.guardrail](call)];
  const settling = energy.state === "settling";
  // Name the weekly cap only when it held the move back.
  if (Math.abs(call.ideal! - kcal) <= (settling ? SETTLING_CAP : SETTLED_CAP)) return [aim];
  return [`${aim} ${settling ? `Early weeks are noisy, so ${COACH_NAME} moves ${SETTLING_CAP} at a time.` : `${COACH_NAME} moves up to ${SETTLED_CAP} a week.`}`];
}

function stateNote({ energy: e, weekNumber }: CallFacts): string | null {
  if (e.state === "holding") return "Burn estimate is holding. Close out each night and it updates next Sunday.";
  if (e.state === "settling") return `Burn estimate is still settling. Steady by week ${weekNumber + SETTLING_UPDATES - e.updates}.`;
  return null;
}

function options({ call, kcal, stepGoal }: CallFacts, flexFoods: string[]): CallOptionView[] {
  if (!call.steps) return [];
  const mark = (pick: CallPick) => (call.pick === pick ? `${COACH_NAME}'s pick. ` : "");
  const trim = kcal - call.calories.kcal;
  const portions = flexFoods.length ? `Smaller portions of ${list(flexFoods.slice(0, 3))}.` : "Smaller portions.";
  const calories: CallOptionView = {
    value: "calories",
    title: trim > 0 ? `Trim ${num(trim)} cal a day` : `Keep ${num(kcal)}`,
    sub: `${mark("calories")}${trim > 0 ? portions : "Portions stay as they are."}`,
  };
  const steps: CallOptionView = {
    value: "steps",
    title: `Keep ${num(call.steps.kcal)}, walk ${num(call.steps.stepGoal - stepGoal)} more`,
    sub: `${mark("steps")}Steps go to ${num(call.steps.stepGoal)} a day instead.`,
  };
  return call.pick === "steps" ? [steps, calories] : [calories, steps];
}

/** The call block for a pick. `flexFoods` names what the calories pick shrinks, as `changedFoods` lists them. */
export function callView(f: CallFacts, choice: CallPick, flexFoods: string[]): CallView {
  const { call } = f;
  const chosen = choice === "steps" && call.steps ? call.steps : call.calories;
  const common = { protein: `Protein stays ${f.proteinG} g`, steps: `Steps ${num(chosen.stepGoal)}`, note: stateNote(f) };
  if (call.kind === "maintenance") {
    const kcal = call.maintenanceKcal!;
    return { ...common, kcal, unit: "cal a day next week", was: "maintenance week", why: [`${num(kcal)} cal a day next week. Maintenance week: you eat at your burn.`], options: [] };
  }
  const why = f.energy.state === "holding" ? holdingLines(f) : [...readLines(f), ...moveLines(f)];
  const moves = chosen.kcal !== f.kcal;
  return { ...common, kcal: chosen.kcal, unit: moves ? "cal a day from Monday" : "cal a day", was: moves ? `was ${num(f.kcal)}` : "holds", why, options: options(f, flexFoods) };
}

export interface ScaleChange {
  food: string;
  /** "Rice", "Potato", "Honey". */
  name: string;
  /** The meals that use it at this weight, at most three named. */
  meals: string;
  from: number;
  to: number;
}

/** Flex foods whose grams move between two factors, one row per food and recipe weight, with the meals in `slugs` that use it. */
export function scaleChanges(slugs: string[], fromFactor: number, toFactor: number): ScaleChange[] {
  const rows = new Map<string, { food: string; grams: number; meals: string[] }>();
  for (const slug of new Set(slugs)) {
    const meal = meals.get(slug);
    if (!meal) continue;
    for (const i of meal.ingredients) {
      if (foods.get(i.food)?.role !== "flex") continue;
      const key = `${i.food}:${i.grams}`;
      const row = rows.get(key) ?? { food: i.food, grams: i.grams, meals: [] };
      if (!row.meals.includes(meal.name)) row.meals.push(meal.name);
      rows.set(key, row);
    }
  }
  return [...rows.values()]
    .map((r) => ({ ...r, from: scaleIngredient(r.grams, "flex", fromFactor), to: scaleIngredient(r.grams, "flex", toFactor) }))
    .filter((r) => r.from !== r.to)
    .sort((a, b) => b.meals.length - a.meals.length || Math.abs(b.to - b.from) - Math.abs(a.to - a.from) || a.food.localeCompare(b.food))
    .map((r) => {
      const name = flexName(r.food);
      const named = r.meals.length > 3 ? `${r.meals.slice(0, 3).join(", ")} and ${r.meals.length - 3} more` : r.meals.join(", ");
      return { food: r.food, name: name[0].toUpperCase() + name.slice(1), meals: named, from: r.from, to: r.to };
    });
}

/** The flex foods in a scale list, in its order: "rice", "honey", "butter". */
export function changedFoods(changes: ScaleChange[]): string[] {
  return [...new Set(changes.map((c) => flexName(c.food)))];
}
```

- [ ] **Step 4: Run the tests.** Same command as Step 2. Expected: PASS, all 21.

- [ ] **Step 5: Commit.**

```bash
git add app/checkin/call.ts tests/unit/checkin/call.test.ts
git commit -m "The call in words: why-lines, the state note, the picks and the grams that move"
```

---

### Task 8: The check-in's call comes from the engine

`CheckInData` changes shape (`outcome` becomes `call`, `avgWeight` becomes `trendWeight`), so the server, the block and the route change in one task.

**Files:**
- Modify: `app/server/checkin.server.ts`, `app/routes/check-in.tsx`
- Create: `app/checkin/CallBlock.tsx`
- Create test: `tests/workers/checkin-engine.test.ts`
- Test: `tests/workers/checkin.test.ts`, `tests/workers/checkin-route.test.ts`

- [ ] **Step 1: Write the failing engine tests.** Create `tests/workers/checkin-engine.test.ts`. Its storage is its own, so nothing seeded elsewhere moves these numbers. They match `tests/unit/checkin/call.test.ts`'s week 3:

```ts
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { checkIns, mealLogs } from "~/db/schema";
import { addDays } from "~/domain/dates";
import { logWeighIn, upsertSteps } from "~/server/body.server";
import { checkInData, completeCheckIn } from "~/server/checkin.server";
import { targetsFor } from "~/server/targets.server";
import { db } from "./helpers";

const SLOT_KCAL = { breakfast: 500, lunch: 600, snack: 250, dinner: 600, dessert: 450 };

/**
 * The phase's first three weeks, Oct 5 to Oct 25. A weigh-in every day from Sunday Oct 4, the day before the first
 * window, falling 0.07 lb a day (206.0 to 204.5). Every slot eaten from Oct 5, 2,400 a day, except Saturday Oct 24's
 * dessert, which leaves that day partial and out of the math. 7,700 steps a day in week 3.
 */
async function seedThreeWeeks() {
  for (let d = 0; d < 22; d++) {
    const date = addDays("2026-10-04", d);
    await logWeighIn(db(), date, Math.round((206 - 0.07 * d) * 10) / 10, new Date());
    if (date < "2026-10-05") continue;
    const slots = Object.entries(SLOT_KCAL).filter(([slot]) => !(date === "2026-10-24" && slot === "dessert"));
    await db()
      .insert(mealLogs)
      .values(slots.map(([slot, kcal]) => ({ clientId: `seed-${date}-${slot}`, date, slot, mealSlug: null, name: "Seed", category: "planned", kcal, proteinG: 36, loggedAt: `${date}T18:00:00Z` })));
    if (date >= "2026-10-19") await upsertSteps(db(), date, 7700, new Date());
  }
}

const row = async (monday: string) => (await db().select().from(checkIns).where(eq(checkIns.weekStart, monday)).get())!;

describe("the engine's check-in", () => {
  it("reads the burn from three weeks of close-outs and cuts 100 while settling", async () => {
    await seedThreeWeeks();
    const data = await checkInData(db(), "2026-10-19");
    // The trend: 206.0 on Oct 4, 205.508 on Oct 18, 205.092 on Oct 25.
    expect(data.trendWeight).toBe(205.1);
    expect(data.change).toBe(-0.4);
    // Observed: 2,400 + 3,500 x (206.0 - 205.092) / 21 = 2,551. Burn: 2,800 + (2,551 - 2,800) / 2 = 2,676, to 2,680.
    expect(data.energy).toMatchObject({ burn: 2680, state: "settling", updates: 1, intakeAvg: 2400, trackedDays: 6, windowTrackedDays: 20, weighIns: 21 });
    expect(data.lastBurn).toBe(2800);
    expect(data.rampedStepGoal).toBe(7500);
    // Ideal: 2,680 - 512.7 = 2,167, down to 2,150. Settling moves 100.
    expect(data.call).toMatchObject({ kind: "cut", ideal: 2150, guardrail: null, pick: "calories", calories: { kcal: 2300, stepGoal: 7500 }, steps: { kcal: 2400, stepGoal: 8000 } });
    expect(data.thisWeekKcal).toBe(2400);
    expect(data.savedPick).toBeNull();
  });

  it("finishing writes Monday's targets and the engine's fields", async () => {
    await completeCheckIn(db(), "2026-10-19", { waist: null, choice: "calories", rest: [] }, new Date("2026-10-25T23:00:00Z"));
    expect(await targetsFor(db(), "2026-10-26")).toEqual({ kcal: 2300, proteinG: 180, stepGoal: 7500 });
    const saved = await row("2026-10-19");
    expect(saved).toMatchObject({ avgWeight: 205.1, change: -0.4, adherence: expect.any(Number), burn: 2680, burnState: "settling", intakeAvg: 2400, trackedDays: 6 });
    expect(JSON.parse(saved.outcome)).toEqual({ kind: "cut", newKcal: 2300, newStepGoal: 7500, pick: "calories", guardrail: null });
  });

  it("updating with the walking pick keeps the calories and saves the new pick", async () => {
    await completeCheckIn(db(), "2026-10-19", { waist: null, choice: "steps", rest: [] }, new Date("2026-10-26T14:00:00Z"));
    expect(await targetsFor(db(), "2026-10-26")).toEqual({ kcal: 2400, proteinG: 180, stepGoal: 8000 });
    const saved = await row("2026-10-19");
    expect(JSON.parse(saved.outcome)).toEqual({ kind: "cut", newKcal: 2400, newStepGoal: 8000, pick: "steps", guardrail: null });
    expect(saved.completedAt).toBe("2026-10-25T23:00:00.000Z");
    expect((await checkInData(db(), "2026-10-19")).savedPick).toBe("steps");
  });

  it("before the maintenance week, calls the burn and leaves the base alone", async () => {
    // Nothing logged after Oct 25, so every later week holds at 2,680.
    const data = await checkInData(db(), "2026-12-14");
    expect(data.energy).toMatchObject({ state: "holding", burn: 2680 });
    expect(data.call).toMatchObject({ kind: "maintenance", maintenanceKcal: 2680, calories: { kcal: 2400, stepGoal: 8000 }, steps: null });
    await completeCheckIn(db(), "2026-12-14", { waist: null, choice: "steps", rest: [] }, new Date("2026-12-20T23:30:00Z"));
    expect(JSON.parse((await row("2026-12-14")).outcome)).toEqual({ kind: "maintenance", newKcal: 2400, newStepGoal: 8000, pick: "calories", guardrail: null });
    expect((await targetsFor(db(), "2026-12-23")).kcal).toBe(2680);
    expect(await targetsFor(db(), "2026-12-28")).toEqual({ kcal: 2400, proteinG: 180, stepGoal: 8000 });
  });
});
```

- [ ] **Step 2: Update the v1 check-in tests.** In `tests/workers/checkin.test.ts`:

1. Replace the test "is too early with only one week of weigh-ins" with:

```ts
  it("holds before the phase starts, with the trend from a week of weigh-ins", async () => {
    await seedWeek("2026-09-28", 208.0, 0.15, 7);
    const data = await checkInData(db(), "2026-09-28");
    expect(data.trendWeight).toBe(207.7);
    expect(data.change).toBeNull();
    expect(data.energy).toMatchObject({ state: "holding", burn: 2800, updates: 0 });
    expect(data.call).toMatchObject({ kind: "hold", ideal: null, calories: { kcal: 2400 }, steps: null });
  });
```

2. Replace the test "summarizes the week and holds on pace" with:

```ts
  it("summarizes the week on the trend, and holds in the phase's first two weeks", async () => {
    await seedWeek("2026-10-05", 207.0, 0.15, 7);
    await seedWeek("2026-10-12", 206.0, 0.15, 6);
    const chicken = meals.get("chicken-and-rice-bowl")!;
    for (const d of ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15"]) await logPlannedMeal(db(), d, "lunch", chicken, new Date());
    const data = await checkInData(db(), "2026-10-12");
    expect(data.adherence).toBe(6);
    // The trend from Sep 28: 207.099 on Oct 11, 206.269 on Oct 18.
    expect(data.trendWeight).toBe(206.3);
    expect(data.change).toBe(-0.8);
    // Off-plan entries with no slots leave every day partial, so nothing is tracked.
    expect(data.energy).toMatchObject({ state: "holding", updates: 0, trackedDays: 0 });
    expect(data.call.kind).toBe("hold");
    expect(data.avgSteps).toBe(6600);
    expect(data.mealCounts[0]).toEqual({ slug: "chicken-and-rice-bowl", name: chicken.name, count: 4, defaultRest: true });
  });
```

3. In "applies targets, rests meals, plans next week, and records the check-in", replace `expect(await db().select().from(checkIns).all()).toHaveLength(1);` with:

```ts
    const rows = await db().select().from(checkIns).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ avgWeight: 206.3, change: -0.8, burn: 2800, burnState: "holding", trackedDays: 0 });
    expect(JSON.parse(rows[0].outcome)).toEqual({ kind: "hold", newKcal: 2400, newStepGoal: 7000, pick: "calories", guardrail: null });
```

In `tests/workers/checkin-route.test.ts`, add to "loads a given week":

```ts
    expect(data.data.call).toMatchObject({ kind: "hold", pick: "calories" });
```

- [ ] **Step 3: Run them to make sure they fail.**

```bash
npx vitest run --project workers tests/workers/checkin-engine.test.ts tests/workers/checkin.test.ts tests/workers/checkin-route.test.ts
```

Expected: FAIL. `trendWeight`, `energy`, `call` and `savedPick` are undefined, and the saved outcome is v1's.

- [ ] **Step 4: The server.** Replace `app/server/checkin.server.ts` with:

```ts
import { and, between, eq, sql } from "drizzle-orm";
import type { CallPick } from "~/checkin/call";
import { meals, plan } from "~/content";
import { HALF_PORTION_KCAL } from "~/content/scaled";
import type { Db } from "~/db/client";
import { checkIns, mealLogs, plannedMeals } from "~/db/schema";
import { weekAdherence, weekIsOnPlan } from "~/domain/adherence";
import { isTrainingDay, weekNumber, weekType } from "~/domain/calendar";
import { dayIntake, type LogFacts } from "~/domain/completeness";
import { addDays } from "~/domain/dates";
import { energyHistory, nextTarget, type Call, type EnergyWeek } from "~/domain/energy";
import { freshMeals, previewWeek, swapFits, type MealSwap } from "~/domain/next-week";
import type { RotationMeal } from "~/domain/rotation";
import { rampStepGoal } from "~/domain/steps";
import { roundLb, trendReading, trendSeries, weeklyTrendChange } from "~/domain/trend";
import type { ISODate } from "~/domain/types";
import { logWaist, waistLogsAll, weighInsThrough } from "./body.server";
import { datesWithWorkouts, dayResults } from "./history.server";
import { ensureWeekPlan, lastEaten, restMeal, restedSlugs } from "./meal-plan.server";
import { movesBetween } from "./schedule.server";
import { baseTargetsFor, setTargetsFrom, targetsFor } from "./targets.server";

export { checkInWindow } from "~/domain/checkin";

export async function checkInDone(db: Db, monday: ISODate): Promise<boolean> {
  return (await db.select().from(checkIns).where(eq(checkIns.weekStart, monday)).get()) !== undefined;
}

export function rotationMeals(): RotationMeal[] {
  return [...meals.values()].map((m) => ({ slug: m.slug, pool: m.pool, mode: m.mode, tags: m.tags }));
}

/**
 * Planned meals eaten this week, and the ones eaten 3 or more times. The spec lists only those with a Rest
 * toggle (on by default): the rotation already allows twice a week, so a 2 is normal and not burnout.
 */
export async function mealRepeats(db: Db, monday: ISODate) {
  const counts = await db
    .select({ slug: mealLogs.mealSlug, n: sql<number>`count(*)` })
    .from(mealLogs)
    .where(and(between(mealLogs.date, monday, addDays(monday, 6)), eq(mealLogs.category, "planned")))
    .groupBy(mealLogs.mealSlug)
    .all();
  const mealCounts = counts
    .filter((c) => c.slug && meals.has(c.slug) && c.n >= 3)
    .map((c) => ({ slug: c.slug!, name: meals.get(c.slug!)!.name, count: c.n, defaultRest: true }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  return { counts, mealCounts };
}

/** What a finished check-in stores in `outcome`: the call, and what was picked. */
export interface CallOutcome {
  kind: Call["kind"];
  newKcal: number;
  newStepGoal: number;
  pick: CallPick;
  guardrail: Call["guardrail"];
}

export interface CheckInData {
  weekStart: ISODate;
  weekEnd: ISODate;
  weekNumber: number;
  /** The trend on Sunday, to 0.1 lb. Null before 3 weigh-ins. */
  trendWeight: number | null;
  /** Sunday's trend minus last Sunday's, to 0.1 lb. */
  change: number | null;
  adherence: number;
  onPlan: boolean;
  relaxedMeals: number;
  workoutsDone: number;
  workoutsPlanned: number;
  optionalDone: number;
  avgSteps: number;
  stepGoal: number;
  rampedStepGoal: number;
  kcal: number;
  proteinG: number;
  waist: number | null;
  /** This week's burn entry. */
  energy: EnergyWeek;
  /** Last week's burn: the plan's 2,800 until a week has updated. */
  lastBurn: number;
  call: Call;
  /** This week's calorie target as eaten, a maintenance week included. "On your scale from Monday" starts from it. */
  thisWeekKcal: number;
  /** The pick a finished check-in saved, so "Update check-in" opens on it. */
  savedPick: CallPick | null;
  mealCounts: { slug: string; name: string; count: number; defaultRest: boolean }[];
  /** Meals in next week's default plan that were not eaten this week. */
  preview: string[];
  /** What the browser needs to redraw next week's plan as Rest toggles and swaps change. */
  nextWeek: { weekStart: ISODate; lastEaten: Record<string, ISODate>; restedBefore: string[]; eatenThisWeek: string[] };
  done: boolean;
}

/** A week before the phase began: nothing to read, so the burn holds at the plan's estimate. */
const beforePhase = (monday: ISODate): EnergyWeek => ({
  weekStart: monday,
  burn: plan.maintenanceKcal,
  state: "holding",
  updates: 0,
  observed: null,
  intakeAvg: null,
  trackedDays: 0,
  windowTrackedDays: 0,
  weighIns: 0,
  trendStart: null,
  trendEnd: null,
});

/** The burn week by week from the phase start, read from the weigh-ins and each day's meals. Nothing is stored between weeks. */
async function burnWeeks(db: Db, monday: ISODate, weighIns: { date: ISODate; weight: number }[]): Promise<EnergyWeek[]> {
  const sunday = addDays(monday, 6);
  const logs = await db
    .select({ date: mealLogs.date, slot: mealLogs.slot, category: mealLogs.category, kcal: mealLogs.kcal })
    .from(mealLogs)
    .where(between(mealLogs.date, plan.phaseStart, sunday))
    .all();
  const byDate = new Map<ISODate, (LogFacts & { kcal: number })[]>();
  for (const l of logs) byDate.set(l.date, [...(byDate.get(l.date) ?? []), l]);
  const series = trendSeries(weighIns, sunday);
  const weighed = new Set(weighIns.map((w) => w.date));
  return energyHistory({
    phaseStart: plan.phaseStart,
    through: monday,
    priorBurn: plan.maintenanceKcal,
    intake: (d) => {
      const day = byDate.get(d);
      return day ? dayIntake(day) : null;
    },
    trend: (d) => series.get(d) ?? null,
    weighedIn: (d) => weighed.has(d),
  });
}

function savedPickOf(outcome: string | undefined): CallPick | null {
  if (!outcome) return null;
  try {
    const pick = (JSON.parse(outcome) as { pick?: unknown }).pick;
    return pick === "calories" || pick === "steps" ? pick : null;
  } catch {
    return null;
  }
}

export async function checkInData(db: Db, monday: ISODate): Promise<CheckInData> {
  const sunday = addDays(monday, 6);
  const weighIns = (await weighInsThrough(db, sunday)).map((w) => ({ date: w.date, weight: w.weightLb }));
  const series = trendSeries(weighIns, sunday);
  const trendWeight = trendReading(weighIns, sunday)?.weight ?? null;
  const thisChange = weeklyTrendChange(series, sunday);

  const thisWeek = await dayResults(db, monday, sunday);
  const adherence = weekAdherence(thisWeek.map((d) => d.onPlan));
  const avgSteps = Math.round(thisWeek.reduce((s, d) => s + d.steps, 0) / 7);
  const [base, thisWeekTargets, weeks, saved] = await Promise.all([
    baseTargetsFor(db, sunday),
    targetsFor(db, sunday),
    burnWeeks(db, monday, weighIns),
    db.select().from(checkIns).where(eq(checkIns.weekStart, monday)).get(),
  ]);
  const rampedStepGoal = rampStepGoal(base.stepGoal, avgSteps);
  const energy = weeks.at(-1) ?? beforePhase(monday);
  const call = nextTarget({
    week: energy,
    trendWeight: series.get(sunday) ?? 0,
    currentKcal: base.kcal,
    stepGoal: rampedStepGoal,
    baseStepGoal: base.stepGoal,
    changes: [thisChange, weeklyTrendChange(series, addDays(sunday, -7))],
    maintenanceNext: weekType(plan, addDays(monday, 7)) === "maintenance",
    halfPortionKcal: HALF_PORTION_KCAL,
  });

  const [setDates, moves] = await Promise.all([datesWithWorkouts(db, monday, sunday), movesBetween(db, monday, sunday)]);
  let workoutsDone = 0;
  let workoutsPlanned = 0;
  let optionalDone = 0;
  for (let i = 0; i < 7; i++) {
    const d = addDays(monday, i);
    if (isTrainingDay(plan, d, moves)) {
      workoutsPlanned++;
      if (setDates.has(d)) workoutsDone++;
    } else if (setDates.has(d)) optionalDone++;
  }

  const { counts, mealCounts } = await mealRepeats(db, monday);
  const relaxed = await db
    .select({ n: sql<number>`count(*)` })
    .from(mealLogs)
    .where(and(between(mealLogs.date, monday, sunday), eq(mealLogs.relaxed, true)))
    .get();

  const nextMonday = addDays(monday, 7);
  const restedBefore = await restedSlugs(db, nextMonday);
  const eatenThisWeek = counts.map((c) => c.slug).filter((s): s is string => s !== null);
  const nextLastEaten = await lastEaten(db, nextMonday);
  const previewPlan = previewWeek({
    weekStart: nextMonday,
    meals: rotationMeals(),
    lastEaten: nextLastEaten,
    rested: [...restedBefore, ...mealCounts.filter((m) => m.defaultRest).map((m) => m.slug)],
    swaps: [],
  });
  const preview = freshMeals(previewPlan.map((p) => p.slug), eatenThisWeek, (slug) => meals.get(slug)?.pool).map((slug) => meals.get(slug)!.name);

  const waists = await waistLogsAll(db);
  return {
    weekStart: monday,
    weekEnd: sunday,
    weekNumber: weekNumber(plan, monday),
    trendWeight,
    change: trendWeight !== null && thisChange !== null ? roundLb(thisChange) : null,
    adherence,
    onPlan: weekIsOnPlan(adherence),
    relaxedMeals: relaxed?.n ?? 0,
    workoutsDone,
    workoutsPlanned,
    optionalDone,
    avgSteps,
    stepGoal: base.stepGoal,
    rampedStepGoal,
    kcal: base.kcal,
    proteinG: base.proteinG,
    waist: waists.at(-1)?.inches ?? null,
    energy,
    lastBurn: weeks.at(-2)?.burn ?? plan.maintenanceKcal,
    call,
    thisWeekKcal: thisWeekTargets.kcal,
    savedPick: savedPickOf(saved?.outcome),
    mealCounts,
    preview,
    nextWeek: { weekStart: nextMonday, lastEaten: nextLastEaten, restedBefore, eatenThisWeek },
    done: saved !== undefined,
  };
}

export interface CheckInInput {
  waist: number | null;
  choice: CallPick;
  rest: string[];
  swaps?: MealSwap[];
}

export async function completeCheckIn(db: Db, monday: ISODate, input: CheckInInput, now: Date): Promise<void> {
  const data = await checkInData(db, monday);
  const nextMonday = addDays(monday, 7);
  const { call } = data;
  // Only a call with a walking option can take it. A maintenance week's calories pick keeps the base as it is.
  const pick: CallPick = input.choice === "steps" && call.steps ? "steps" : "calories";
  const chosen = pick === "steps" && call.steps ? call.steps : call.calories;
  await setTargetsFrom(db, nextMonday, { kcal: chosen.kcal, proteinG: data.proteinG, stepGoal: chosen.stepGoal });

  if (input.waist !== null) await logWaist(db, data.weekEnd, input.waist);
  for (const slug of input.rest) if (meals.has(slug)) await restMeal(db, slug, addDays(nextMonday, 13));

  await db.delete(plannedMeals).where(between(plannedMeals.date, nextMonday, addDays(nextMonday, 6)));
  await ensureWeekPlan(db, nextMonday);
  const rested = await restedSlugs(db, nextMonday);
  for (const swap of input.swaps ?? []) {
    if (swap.date < nextMonday || swap.date > addDays(nextMonday, 6) || !swapFits(swap, rotationMeals(), rested)) continue;
    await db
      .insert(plannedMeals)
      .values({ date: swap.date, slot: swap.slot, mealSlug: swap.slug, swapped: true })
      .onConflictDoUpdate({ target: [plannedMeals.date, plannedMeals.slot], set: { mealSlug: swap.slug, swapped: true } });
  }

  const outcome: CallOutcome = { kind: call.kind, newKcal: chosen.kcal, newStepGoal: chosen.stepGoal, pick, guardrail: call.guardrail };
  const fields = {
    avgWeight: data.trendWeight,
    change: data.change,
    adherence: data.adherence,
    outcome: JSON.stringify(outcome),
    burn: data.energy.burn,
    burnState: data.energy.state,
    intakeAvg: data.energy.intakeAvg,
    trackedDays: data.energy.trackedDays,
  };
  // "Update check-in" saves the new pick over the old one. completed_at keeps the first finish.
  await db
    .insert(checkIns)
    .values({ weekStart: monday, ...fields, completedAt: now.toISOString() })
    .onConflictDoUpdate({ target: checkIns.weekStart, set: fields });
}
```

- [ ] **Step 5: The block.** Create `app/checkin/CallBlock.tsx` (mock 4A):

```tsx
import { SectionHead } from "~/ui/SectionHead";
import type { CallPick, CallView, ScaleChange } from "./call";

/** The check-in's call (option 4A): the number, why, the pick, and what moves on the scale. Project 4's ritual reuses it. */
export function CallBlock({ view, choice, onChoice, changes }: { view: CallView; choice: CallPick; onChoice: (pick: CallPick) => void; changes: ScaleChange[] }) {
  return (
    <section aria-labelledby="call" className="flex flex-col gap-6 text-ink">
      <div className="flex flex-col gap-2">
        <SectionHead id="call">The call.</SectionHead>
        <p className="mt-1.5 flex items-baseline gap-2.5">
          <span className="tabular font-num text-[64px] font-bold leading-none">{view.kcal.toLocaleString("en-US")}</span>
          <span className="font-num text-[18px] font-semibold leading-[1.2] text-ink-3">
            {view.unit}
            <br />
            {view.was}
          </span>
        </p>
        <p className="tabular flex flex-wrap gap-x-[18px] font-num text-[17px] font-bold">
          <span>{view.protein}</span>
          <span>{view.steps}</span>
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-[18px] font-bold">Why</h3>
        <ol className="flex flex-col gap-2 text-[16px] leading-[1.45]">
          {view.why.map((line, i) => (
            <li key={line} className="flex gap-2.5">
              <span aria-hidden="true" className="w-[18px] flex-none font-num font-bold text-muted">
                {i + 1}
              </span>
              <span>{line}</span>
            </li>
          ))}
        </ol>
        {view.note && (
          <p className="flex items-center gap-2 rounded-[6px] border-[1.5px] border-border px-3 py-2.5 text-[14px] text-ink-2">
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="flex-none">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 2" />
            </svg>
            {view.note}
          </p>
        )}
      </div>

      {view.options.length > 0 && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-[18px] font-bold">Your pick</legend>
          {view.options.map((o) => {
            const on = o.value === choice;
            return (
              <label
                key={o.value}
                className={`flex cursor-pointer gap-3 rounded-[6px] p-3.5 has-[:focus-visible]:outline-[2.5px] has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-red has-[:focus-visible]:outline-solid ${on ? "border-2 border-ink bg-raised" : "border-[1.5px] border-border"}`}
              >
                <input type="radio" name="call-pick" value={o.value} checked={on} onChange={() => onChoice(o.value)} className="sr-only" />
                <span aria-hidden="true" className={`mt-px flex size-[22px] flex-none items-center justify-center rounded-full border-2 ${on ? "border-ink" : "border-border"}`}>
                  {on && <span className="size-2.5 rounded-full bg-ink" />}
                </span>
                <span className="flex flex-col gap-0.5">
                  <span className="text-[17px] font-bold">{o.title}</span>
                  <span className="text-[14px] text-ink-3">{o.sub}</span>
                </span>
              </label>
            );
          })}
        </fieldset>
      )}

      {changes.length > 0 && (
        <div className="flex flex-col">
          <h3 className="mb-1 text-[18px] font-bold">On your scale from Monday</h3>
          <ul className="flex flex-col border-t-2 border-ink">
            {changes.map((c) => (
              <li key={`${c.food}-${c.from}`} className="flex min-h-[52px] items-center justify-between gap-2.5 border-b border-rule py-1.5">
                <span className="flex min-w-0 flex-col">
                  <span className="text-[16px] font-semibold">{c.name}</span>
                  <span className="text-[13px] text-muted">{c.meals}</span>
                </span>
                <span className="tabular flex-none whitespace-nowrap font-num text-[20px] font-bold">
                  {c.from} <span aria-hidden="true">→</span>
                  <span className="sr-only">to</span> {c.to} g
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2.5 text-[15px] text-ink-3">Chicken, steak, fish and eggs never shrink.</p>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 6: The route.** In `app/routes/check-in.tsx`:

1. Replace the imports from `import { COACH_NAME, pageTitle } from "~/brand";` through `import { meals } from "~/content";` with:

```ts
import { COACH_NAME, pageTitle } from "~/brand";
import type { Route } from "./+types/check-in";
import { CallBlock } from "~/checkin/CallBlock";
import { callView, changedFoods, scaleChanges, type CallPick } from "~/checkin/call";
import { MealPhoto } from "~/components/MealPhoto";
import { Sheet } from "~/components/Sheet";
import { Toggle } from "~/components/Toggle";
import { BackButton, Card, FloatingBar, Icon, Screen, SectionTitle, Tile } from "~/components/ui";
import { meals } from "~/content";
import { factorFor } from "~/content/scaled";
```

(`Segmented` goes. It was only v1's "Cut 150 cal / Add 1,000 steps" control.)

2. Delete the `callText` function.

3. In `CheckIn`, change `const [choice, setChoice] = useState<"calories" | "steps">("calories");` to:

```ts
  const [choice, setChoice] = useState<CallPick>(d.savedPick ?? d.call.pick);
```

4. After the `const fresh = freshMeals(...)` statement, add:

```ts
  // The grams start from this week's target as eaten and end at what the pick brings on Monday.
  const slugs = week.map((p) => p.slug);
  const nowFactor = factorFor(d.thisWeekKcal);
  const facts = { call: d.call, energy: d.energy, lastBurn: d.lastBurn, kcal: d.kcal, stepGoal: d.stepGoal, proteinG: d.proteinG, weekNumber: d.weekNumber };
  const view = callView(facts, choice, changedFoods(scaleChanges(slugs, nowFactor, factorFor(d.call.calories.kcal))));
  const changes = scaleChanges(slugs, nowFactor, factorFor(view.kcal));
```

5. Replace the "7-day average" tile with:

```tsx
            <Tile label="Trend" value={d.trendWeight !== null ? `${d.trendWeight} lb` : "--"} sub={d.change !== null ? `${signed(d.change)} vs last week` : "Not enough weigh-ins"} subGood={(d.change ?? 0) < 0} />
```

6. Replace the whole `<Card className="flex items-start gap-3 px-[18px] py-4" aria-label={`${COACH_NAME}'s call`}>` element (through its closing `</Card>`) with:

```tsx
        <CallBlock view={view} choice={choice} onChoice={setChoice} changes={changes} />
```

The hidden `<input type="hidden" name="choice" value={choice} />` stays, so the action reads the pick as before.

- [ ] **Step 7: Run the tests and typecheck.**

```bash
npx vitest run --project workers tests/workers/checkin-engine.test.ts tests/workers/checkin.test.ts tests/workers/checkin-route.test.ts tests/workers/day.test.ts
npm run typecheck
```

Expected: PASS, no type errors.

- [ ] **Step 8: Commit.**

```bash
git add app/server/checkin.server.ts app/checkin/CallBlock.tsx app/routes/check-in.tsx tests/workers/checkin-engine.test.ts tests/workers/checkin.test.ts tests/workers/checkin-route.test.ts
git commit -m "The check-in's call comes from the engine: the 4A block, the pick, and the engine's fields saved"
```

---

### Task 9: decideAdjustment and the 7-day average go

**Files:**
- Delete: `app/domain/adjustments.ts`, `tests/unit/domain/adjustments.test.ts`, `app/domain/weight.ts`, `tests/unit/domain/weight.test.ts`

- [ ] **Step 1: Confirm nothing else reads them.**

```bash
rg -n "domain/adjustments|domain/weight|decideAdjustment|sevenDayAverage|weeklyChange\b" app tests scripts
```

Expected: only `tests/unit/domain/adjustments.test.ts` and `tests/unit/domain/weight.test.ts`. If anything in `app/` shows, a task above missed it: fix that first.

- [ ] **Step 2: Delete them.**

```bash
git rm app/domain/adjustments.ts tests/unit/domain/adjustments.test.ts app/domain/weight.ts tests/unit/domain/weight.test.ts
```

- [ ] **Step 3: Typecheck and run the domain tests.**

```bash
npm run typecheck
npx vitest run --project unit tests/unit/domain
```

Expected: no type errors, PASS.

- [ ] **Step 4: Commit.**

```bash
git commit -m "decideAdjustment and the 7-day average go; the engine makes the call"
```

---

### Task 10: Look at the block against mock 4A

- [ ] **Step 1: Sign in locally** with a temporary password, as N2's Task 11 did. Save the hash, swap it, and put it back in Step 6:

```bash
npx wrangler d1 execute rocky-core --local --command "select password_hash from users where name_key = 'kameron'"
npx tsx -e 'import("./app/server/password.ts").then(async (m) => console.log(await m.hashPassword("local-look-check")))'
npx wrangler d1 execute rocky-core --local --command "update users set password_hash = '<hash printed above>' where name_key = 'kameron'"
```

- [ ] **Step 2: Seed three weeks locally**, the same history as the engine's worker test. The rows are marked so Step 6 removes only them:

```bash
SEED=$(mktemp -t n3-look).sql
for d in {0..21}; do
  day=$(date -j -v+${d}d -f %Y-%m-%d 2026-10-04 +%Y-%m-%d)
  w=$(printf '%.1f' $(( 206 - 0.07 * d )))
  echo "insert or ignore into weigh_ins (date, weight_lb, logged_at) values ('$day', $w, 'n3-look');" >> $SEED
  [[ $day == 2026-10-04 ]] && continue
  for pair in breakfast:500 lunch:600 snack:250 dinner:600 dessert:450; do
    slot=${pair%%:*}; kcal=${pair##*:}
    [[ $day == 2026-10-24 && $slot == dessert ]] && continue
    echo "insert into meal_logs (client_id, date, slot, name, category, kcal, protein_g, relaxed, portions, logged_at) values ('n3-look-$day-$slot', '$day', '$slot', 'Look seed', 'planned', $kcal, 36, 0, 1, '${day}T18:00:00Z');" >> $SEED
  done
done
npx wrangler d1 execute rocky-db --local --file $SEED
```

Existing local rows for those dates stay, so the numbers can differ from the worker test's. That is fine for a look.

- [ ] **Step 3: Compare at 390 x 844**, with `npm run dev` running, side by side with option 4A on https://claude.ai/artifact/1yW7smtJTuSnjXQUCjdo9q. Open `/check-in?week=2026-10-19`. Do not tap Finish check-in.
1. "THE CALL." in Anton 28 with the 2 px ink rule, the 64 px number with "cal a day from Monday / was <old>" beside it, and the bold "Protein stays 180 g" and "Steps <goal>" line.
2. "Why" with numbered lines in muted Semi Condensed numerals, and the outlined settling note with the clock icon.
3. "Your pick": Rocky's pick first, selected, with a 2 px ink border on `raised`. Tap the walking pick: the number reads "<current> cal a day / holds", the steps line changes, and "On your scale from Monday" hides. Tab to the radios: the red focus ring shows on the card.
4. "On your scale from Monday": a 2 px ink rule above the first row, 1 px `rule` dividers, "200 → 175 g" style grams, the meals in 13 px muted, and "Chicken, steak, fish and eggs never shrink."
5. `/check-in?week=2026-10-12` against "When it holds": "Two weeks of weigh-ins come first. Burn starts at 2,800.", the holding note, no picks, no scale list.
6. The tile above reads "Trend". Red appears only on Finish check-in and the focus ring.
7. Today's line reads "Trend <weight> lb, down <x> since Oct 5." Progress reads "Weight · trend" with the "Trend" legend.
8. Run F3's contrast snippet on the check-in. Expected: `all text passes`.

- [ ] **Step 4: Screenshots for the PR**, saved to the session scratchpad: the cut with Rocky's pick, the walking pick selected, and the hold.

- [ ] **Step 5: Commit any fixes** from this task, staged by path, with a message naming what was fixed.

- [ ] **Step 6: Put the local data back.**

```bash
npx wrangler d1 execute rocky-db --local --command "delete from meal_logs where client_id like 'n3-look-%'; delete from weigh_ins where logged_at = 'n3-look'"
npx wrangler d1 execute rocky-core --local --command "update users set password_hash = '<saved hash>' where name_key = 'kameron'"
```

---

### Task 11: Full suite and the PR

- [ ] **Step 1: Run the whole suite once.**

```bash
npm run typecheck && npm test
```

Expected: all green. Fix only the failing files, then re-run those files only.

- [ ] **Step 2: Push and open the PR. Do not merge.**

```bash
git push -u origin v2/n3-engine-call
gh pr create --base main --title "Rocky v2 N3: the engine makes the call" --body-file - <<'MD'
Project 3, rollout step N3 (`docs/superpowers/specs/2026-10-27-nutrition-design.md`). Plan: `docs/superpowers/plans/2026-10-28-n3-engine-call.md`.

- The trend weight replaces the 7-day average on Today, the check-in and Progress.
- The check-in's call block comes from the engine (option 4A): the number, why-lines written by rules, the settling or holding note, "Your pick" with Rocky's pick first, and "On your scale from Monday".
- Finish check-in saves the pick, Monday's targets and step goal, and the check-in's burn, burn state, intake average and tracked days. `outcome` is `{ kind, newKcal, newStepGoal, pick, guardrail }`.
- A maintenance week eats the latest check-in's burn, on the server and the phone alike.
- Two N1 rules corrected to the spec: the burn reads the trend from the day before its 21-day window, over 21 days (the spec's worked example now holds: observed 2,567, burn 2,680), and the walking pick offers this week's step goal plus 1,000, not 1,000 on top of the ramp.
- `nextTarget` gains the "no surplus" guardrail.
- `decideAdjustment`, `app/domain/adjustments.ts` and the 7-day average are gone. "Days on plan" stays as a display.

No migrations. The `check_ins` columns landed in N1.

The calls made and the copy the spec didn't give: see the top of the plan.

Screenshots: <attach Task 10's>

🤖 Generated with [Claude Code](https://claude.com/claude-code)
MD
```

Cloudflare does not build branches, so the PR has no build check. If the build session's harness gives attribution lines for PR bodies, they replace the last line of the body.

- [ ] **Step 3: Report back and wait.** Kameron reviews and merges. Pushing `main` deploys through Workers Builds.

---

### Task 12: Verify on the wire

- [ ] **Step 1: The build landed.** After the merge, confirm the Workers Builds check on the merge commit is green. It can sit "queued"; a normal build takes about a minute.

```bash
gh api repos/kameronpduhon/rocky-the-coach/commits/$(git rev-parse origin/main)/check-runs --jq '.check_runs[] | "\(.name) \(.status) \(.conclusion)"'
```

- [ ] **Step 2: The new check-in is live.** Find the check-in route's chunk through the manifest linked from the login page, and grep it and its imports for the block's strings:

```bash
BASE=https://kampduh.com
MANIFEST=$(curl -s $BASE/login | grep -o '/assets/manifest-[A-Za-z0-9_-]*\.js' | head -1)
curl -s "$BASE$MANIFEST" | grep -o '"routes/check-in":{[^}]*' | grep -o '/assets/[A-Za-z0-9_.-]*\.js' | sort -u | while read -r f; do curl -s "$BASE$f"; done \
  | grep -oE "The call\.|On your scale from Monday|never shrink|read your burn yet|Two slow weeks" | sort | uniq -c
```

Expected: "The call.", "On your scale from Monday", "never shrink" and "read your burn yet" each at least once, and no "Two slow weeks" (v1's copy). If the new strings are missing, the deploy hasn't landed: check Step 1 again, and if it is stuck, Kameron runs `npm run deploy`.

- [ ] **Step 3: Progress is live.**

```bash
curl -s "$BASE$MANIFEST" | grep -o '"routes/progress":{[^}]*' | grep -o '/assets/[A-Za-z0-9_.-]*\.js' | sort -u | while read -r f; do curl -s "$BASE$f"; done \
  | grep -oE "The trend needs 3|The average needs 3" | sort | uniq -c
```

Expected: "The trend needs 3" once, and no "The average needs 3".

- [ ] **Step 4: The first engine call.** After Kameron finishes the first Sunday check-in following the deploy, hand him this read to run (remote D1 reads are his):

```bash
npx wrangler d1 execute rocky-db --remote --command "select week_start, avg_weight, change, burn, burn_state, intake_avg, tracked_days, outcome from check_ins order by week_start desc limit 1"
npx wrangler d1 execute rocky-db --remote --command "select * from targets order by effective_from desc limit 1"
```

Expected: `burn`, `burn_state`, `intake_avg` and `tracked_days` are filled, `outcome` has `kind`, `newKcal`, `newStepGoal`, `pick` and `guardrail`, and the newest `targets` row starts the Monday after with `newKcal` and `newStepGoal`. Work the call out by hand from that row with the spec's formulas (goal deficit 2.5 x trend, ideal rounded down to 50, a 100 cap while settling) and compare it with what the check-in showed.
