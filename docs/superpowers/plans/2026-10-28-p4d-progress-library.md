# P4d: Progress, All Lifts, the Lift Page and the Library Implementation Plan

> **For agentic workers:** implement this plan task-by-task with the `executing-plans` skill. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Progress and the Library are rebuilt on the phone's copy in the Corner look, and every lift gets its own page:
- **Progress (mock `Progress`).** "Down 3.0. / On pace." against the Jan 1 goal, the WEIGHT chart with 4W, PHASE and ALL, the goal band and the pace line, "Fix a weigh-in", the Waist and Photos pair, STRONGER, and SHOWING UP with the streak line.
- **All lifts (`/progress/lifts`, option 6A).** "All 21 lifts.", grouped Chest, Back, Shoulders, Arms, Legs, each with its best set, a 4-session sparkline and the gain.
- **The lift page (`/lift/:id`, option 7A).** Photos, the best set with GO UP, the chart, every session (tap to fix it on the workout screen), and the swaps. It opens from All lifts and from the Library, and works for Catherine.
- **The Library (mocks `LibraryMeals`, `LibraryExercises`).** Meals at today's grams with resting tags, "Show all 8", folded sections, and the usual orders with a one-tap Log. Exercises by body part with "4 in plan · 8 swaps", best sets, and the swaps line.
- **The progress and library loaders and actions go,** with `app/server/progress.server.ts`.

**Starts from P4c's result,** which started from P4b's. P4a and P4b are merged and live, on top of N3. This plan uses their interfaces as the spec's domain section and Named changes table name them, with the signatures P4a's plan (`docs/superpowers/plans/2026-10-28-p4a-checkin-data.md`, "Interfaces other steps build on") gives:

| From | What this plan uses |
|---|---|
| P4a, Content | `plan.goal`: `{ date: "2027-01-01", low: 195, high: 198 }`. In `app/content/index.ts`: `BodyPart` (`"chest"`, `"back"`, `"shoulders"`, `"arms"`, `"legs"`), `BODY_PARTS` (`{ id, label }[]` in list order, labels "Chest" to "Legs") and `BODY_PART` (the 9 groups to a `BodyPart`, call 17) |
| P4a, Domain | `withDrop(suggestion, drop, lastSessionDate, on)` and `LiftDrop` (`{ weight, from }`) in `app/domain/progression.ts`; `dropFor(rows, exerciseId)` in `app/workout/sessions.ts`, reading the synced `lift_drops` table. The spec names three arguments; P4a adds `on`, the session's date |
| P4a, Domain | `bestSet(sets)` in `app/domain/stalls.ts`: the heaviest set, then the most reps at that weight |
| Already live | `editWeighIn`, `deleteWeighIn` and `logUsual` (reused, spec "Named changes") |
| P4b, kit | `TrendChart` (the check-in's chart) in `app/ui/TrendChart.tsx`. Task 1 adds the goal band and the pace line to it |
| P4c, kit | `StatGrid` in `app/ui/StatGrid.tsx`, with `ruled` (P4c's Task 1) |
| N3 | `trendSeries`, `trendReading` and `MIN_TREND_WEIGH_INS` in `app/domain/trend.ts` (chart points carry the trend unrounded; round only text); `targetsOn` with the check-ins' burns |

**Architecture:**
- **Three pure models** in the shape of `app/meal/model.ts`, each unit tested with plain rows:
    - `app/lifts/model.ts`: every lift's sessions since the phase start, the plan's lifts after always-swaps, All lifts, the lift page, and the best sets the Library shows.
    - `app/progress/model.ts`: the poster and pace, the chart for each range, the body pair, STRONGER, SHOWING UP.
    - `app/library/model.ts`: meal sections, usual orders, exercise sections, search.
- **No route has a loader or action.** Each reads the store through `useSyncClient`, `useSyncStatus` and `useStoreVersion`, as `/meal/:slug` does. Whether the person has a plan comes from the layout's data, as on Today.
- **Writes are named changes:** `editWeighIn` and `deleteWeighIn` from "Fix a weigh-in", `logUsual` from the Library.
- **"Days counted" is Today's rule.** Today's model exports its `dayActivity`, so Progress and Today count a day the same way.

**Tech Stack:** React Router 8.4 (framework mode, SSR still on), the F2 sync layer, Tailwind 4 with the Corner tokens, Vitest 4 (unit project for pure modules, workers project for D1).

**Spec:** `docs/superpowers/specs/2026-10-28-checkin-plan-progress-library-design.md`: section 3 "Progress", "All lifts", "Lift page", "Library", calls 13 to 19, the edge cases table, rollout step 4, Testing ("The Progress model", "The lifts model", "The library model", "On the wire"). **Branch:** `v2/p4-checkin-plan-progress-library`, worktree `/Users/kameron/Code/rocky-wt/p4`. **Previous:** `docs/superpowers/plans/2026-10-28-p4c-plan-groceries.md`. **Next:** `docs/superpowers/plans/2026-10-28-p4e-worker-endpoints.md`.

**Mocks:**
- Artboards `Progress`, `LibraryMeals` and `LibraryExercises` on https://claude.ai/artifact/65WeReuGH5ZageJng9K6nq.
- Options 6A (All lifts, and "A, after a tap") and 7A (the lift page) on https://claude.ai/artifact/Ke3qgxSC3uQFwGKCJpsKSU, and band 8's Progress frame with the real counts.
- **Design system:** `docs/design/system.md`. Where it and a mock disagree on looks, the mock wins, except the colour rules. Real data wins over the mock's numbers: 21 lifts (not 22), 49 exercises, "Lying leg curl", Chest with 8 swaps, steak and eggs at 525 cal at 2,300 (not 600), and the first photo round on Nov 1 (not Nov 8).

**There are no migrations in P4d.**

## Calls made in this plan (flag them when shipping)

**Progress:**
- **"Down 3.0." is N3's `trendReading` from the phase start,** the same number Today's trend line prints. It is the trend now minus the trend on Oct 5, which is the first weigh-in's weight when the first weigh-in is that day (spec: "minus the phase's first weigh-in"). No change at all reads "Level."
- **The pace needs 2 weeks of trend.** It uses the last 4 weeks, or everything since the first weigh-in when there is less. Under 14 days the poster is one line ("Down 0.7.") and the note leaves out "At this pace you land near ...".
- **The PHASE chart runs to Jan 1,** with the goal band there and a dashed line from today's trend to where the pace lands, as the mock draws it. 4W and ALL stop at today, with no band and no pace line.
- **Copy the spec doesn't give:**
    - Waist with one entry: "measured Oct 11". No change since the first: "same as Oct 11". No entry: the value reads "Not yet".
    - Protein with no tracked day yet: "Not yet".
    - The streak line with one day: "1 day since the last double miss. Never miss twice."
- **A double miss** is two days in a row before today that didn't count. The streak line counts from the second of them.
- **STRONGER's rows are not links,** as the mock draws them. The link under them goes to All lifts. When nothing has gained, the head and rows hide and the link stays.
- **"Fix a weigh-in"** opens one sheet: the list, then the tapped day with a weight field, Delete (outline) and Save (red). A weight outside 80 to 500 lb reads "Enter your weight in pounds." v1's `WeighInSheet` posted to the progress action, so it goes.

**All lifts and the lift page:**
- **All lifts lists the plan's lifts in plan order** (Monday, Wednesday, Friday, then the extra), then other lifts logged since the phase start by name, labelled "Swap". The Library lists alphabetically (spec call 19); All lifts follows the mock's order.
- **Body-weight lifts with no added weight count reps:** "Best 8 reps", "+2", "8, 7 reps" in the history, and no GO UP, because the next step for them is reps, not weight.
- **The lift page's newest session shows "next 135"** and no tag, as option 7A draws it. Older sessions that earned a move carry GO UP, judged the way the Done screen judges it (a deload the week after holds the weight).
- **GO UP and "next 135" come from the next session's suggestion with `withDrop` applied,** so a lift dropped at the check-in shows neither. The next session is taken as today, or the drop's Monday when that is later: on the Sunday evening of the check-in the page already shows the drop, not "next 135".
- **The lift chart labels only its first and last sessions** ("Oct 5 · 120", "Oct 26 · 130"), so 13 weeks of sessions never crowd the line. Option 6A's detail frame labels every one of its four.
- **The change line:** "up 10 lb since Oct 5" counts from the lift's first session since the phase start. One session: "first logged Oct 27". No change: "same as Oct 5".
- **SWAPS lists the same body part minus the plan's lifts**, so pec deck shows "8 for chest", as the mock's count says. Without a plan it lists every other lift in the body part.
- **A history row opens that day's workout** with `?back=/lift/<id>?from=<from>`, so the workout's back button returns to the lift page. `workoutBack` accepts only a `/lift/` path in `back`.
- **Without a plan** (Catherine), the meta reads "Machine · Chest", GO UP never shows, and history rows aren't links: the workout screen is plan-only.

**Library:**
- **Without a plan, meal rows aren't links.** The meal screen is plan-only, so a tap would bounce Catherine to Today.
- **"Saved off-plan" hides when there are no usual orders.** A logged row's button turns to "Logged" until the screen is left.
- **A plan lift's subline names its days:** "Dumbbells · Monday", "Cable · Wednesday and the extra", and "Dumbbells · The extra" for a lift only in the extra.
- **The swaps line lowercases each name's first letter only:** "smith machine bench press", not the mock's shortened "Smith bench".
- **Search is shared by both tabs** and kept in the page, as v1's was.

---

## Ground rules

- Everything from the earlier plans applies:
    - No em dashes in code, copy, comments, commits or docs. No emojis.
    - No `Co-Authored-By` lines in commits.
    - Names in copy come from `APP_NAME` and `COACH_NAME` in `app/brand.ts`, never a literal. (No copy in this plan names either.)
    - Look with `npm run dev`.
    - During tasks, run only the files named in the step, plus `npm run typecheck` where a step says so. One full `npm run typecheck && npm test` at the end (Task 9).
    - One commit per task. Stage by path (`git add <paths>`, `git rm <paths>`), never `git add -A` or `git add .`: other agents write plan files in this worktree.
    - Never switch branches.
    - Token colours only. Red only for the primary action and live state. Brass only for progression (GO UP).
- `app/lifts/*`, `app/progress/*`, `app/library/*`, `app/ui/*`, `app/today/*` and `app/domain/*` must not import `cloudflare:workers` or any `*.server.ts`. They run in the browser.
- Store rows are raw D1 rows: snake_case, booleans `0`/`1`, JSON columns as strings.
- Unit test dates use Chicago daylight time (`-05:00`) and stay before November 1, 2026, except the photo-day test on Sunday Nov 1 at 9am, where the hour's offset doesn't change the day.

## Files

| File | Responsibility |
|---|---|
| `app/ui/Sparkline.tsx` (new) | `sparkPoints` and the 58 x 22 sparkline |
| `app/ui/GoUpTag.tsx` (new) | The brass GO UP tag |
| `app/ui/TrendChart.tsx` | P4b's chart, plus the goal band and the pace line; `yScale` moves here |
| `app/lifts/model.ts` (new) | `planLifts`, `liftSessions`, `liftIds`, `bestSets`, `buildLifts`, `buildLift`, `partLabel` |
| `app/lifts/LiftsScreen.tsx`, `app/lifts/LiftScreen.tsx` (new) | Option 6A and option 7A |
| `app/routes/progress.lifts.tsx`, `app/routes/lift.tsx` (new) | `/progress/lifts` and `/lift/:id` |
| `app/routes.ts` | The two new routes |
| `app/workout/model.ts`, `app/routes/workout.tsx` | `workoutBack`: a lift page can be the workout's back |
| `app/today/model.ts` | Exports `dayActivity` |
| `app/progress/model.ts` (new) | `buildProgress`, `nextPhotoDate`, `projectTrend`, `paceLine` |
| `app/progress/ProgressScreen.tsx`, `app/progress/WeighInsSheet.tsx` (new) | Mock `Progress` and "Fix a weigh-in" |
| `app/routes/progress.tsx` | Rewritten: no loader, no action |
| `app/library/model.ts` (new) | `buildLibrary` |
| `app/library/LibraryScreen.tsx` (new) | Mocks `LibraryMeals` and `LibraryExercises` |
| `app/routes/library.tsx` | Rewritten: no loader |
| `app/server/progress.server.ts`, `app/components/WeighInSheet.tsx`, `app/components/WeightChart.tsx` | Deleted |
| `tests/workers/progress.test.ts`, `tests/workers/progress-route.test.ts` | Deleted: the model tests and the mutator tests cover them |
| `tests/workers/workout-readers.test.ts` | Drops its `progressData` checks |
| `tests/workers/no-plan.test.ts` | Pins the two new paths |
| `tests/unit/weight-chart.test.ts` | Moves to `tests/unit/ui/trend-chart.test.ts` |
| `tests/unit/ui/sparkline.test.ts`, `tests/unit/lifts/model.test.ts`, `tests/unit/progress/model.test.ts`, `tests/unit/library/model.test.ts` (new) | The models and the sparkline |

---

### Task 1: The sparkline, the GO UP tag, and the chart's goal band

**Files:**
- Create: `app/ui/Sparkline.tsx`, `app/ui/GoUpTag.tsx`
- Modify: `app/ui/TrendChart.tsx` (P4b's)
- Test: `tests/unit/ui/sparkline.test.ts` (new); `tests/unit/weight-chart.test.ts` moves to `tests/unit/ui/trend-chart.test.ts`

- [ ] **Step 1: Write the failing sparkline test.** Create `tests/unit/ui/sparkline.test.ts`:

```ts
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
```

- [ ] **Step 2: Run it to make sure it fails.**

```bash
npx vitest run --project unit tests/unit/ui/sparkline.test.ts
```

Expected: FAIL. `~/ui/Sparkline` doesn't exist yet.

- [ ] **Step 3: The sparkline.** Create `app/ui/Sparkline.tsx`:

```tsx
export const SPARK = { w: 58, h: 22, pad: 3 };

/** The polyline's points, oldest to newest. A flat run sits in the middle. */
export function sparkPoints(values: number[]): [number, number][] {
  const { w, h, pad } = SPARK;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  return values.map((v, i) => [pad + (i * (w - 2 * pad)) / Math.max(1, values.length - 1), hi === lo ? h / 2 : h - pad - ((v - lo) * (h - 2 * pad)) / (hi - lo)]);
}

/** Top weight per session, the last point in ink (All lifts, option 6A). Under 2 sessions it keeps its space empty. */
export function Sparkline({ values }: { values: number[] }) {
  const { w, h } = SPARK;
  if (values.length < 2) return <span aria-hidden="true" className="w-[58px] flex-none" />;
  const pts = sparkPoints(values);
  const [lx, ly] = pts.at(-1)!;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" className="flex-none">
      <polyline
        points={pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ")}
        fill="none"
        stroke="var(--border)"
        strokeWidth="1.75"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={lx} cy={ly} r="3" fill="var(--ink)" />
    </svg>
  );
}
```

- [ ] **Step 4: Run it.** Same command as Step 2. Expected: PASS, 2 tests.

- [ ] **Step 5: The GO UP tag.** Create `app/ui/GoUpTag.tsx`. It is the same tag `ProgressionCallout` draws, standing alone:

```tsx
/** The brass tag: progression only. */
export function GoUpTag() {
  return <span className="flex-none whitespace-nowrap rounded-[3px] bg-brass-tag px-[7px] py-[3px] font-num text-[13px] font-bold tracking-[0.06em] text-brass-on">GO UP</span>;
}
```

- [ ] **Step 6: Read P4b's chart first.**

```bash
sed -n 1,40p app/ui/TrendChart.tsx; rg -n "<TrendChart" app
```

The version below keeps the check-in's use: `points` (each `{ date, weight, trend }`), a `label` for screen readers, and `marker` (the dashed line at this Monday). It adds `goal` and `projection`, and owns `yScale`. If P4b named a prop differently (for example `series` for `points`), keep P4b's name in the code below wherever that prop appears, so the check-in's call is untouched. If P4b's file has something this version lacks, keep it.

- [ ] **Step 7: The chart.** Replace `app/ui/TrendChart.tsx` with:

```tsx
import { useEffect, useRef, useState } from "react";
import { daysBetween } from "~/domain/dates";
import type { ISODate } from "~/domain/types";

export interface TrendPoint {
  date: ISODate;
  weight: number | null;
  /** Unrounded, so the line slopes instead of stepping by tenths. Round only labels. */
  trend: number | null;
}

const H = 190;
const TOP = 8;
const PLOT_H = 166;

/**
 * Whole-pound bounds around every plotted value, so the dots, the line and the goal band sit inside. The step doubles
 * until there are at most 4 bands.
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

/**
 * Dots for weigh-ins, the trend line and its end dot (the check-in and Progress). Optional: a dashed marker at a date,
 * the goal band at the goal date, and a dashed pace line from the trend's end to where it lands.
 */
export function TrendChart({
  points,
  label,
  marker = null,
  goal = null,
  projection = null,
}: {
  points: TrendPoint[];
  label: string;
  marker?: ISODate | null;
  goal?: { date: ISODate; low: number; high: number } | null;
  projection?: { date: ISODate; weight: number } | null;
}) {
  // Real pixels, so the dots stay round on wide screens.
  const ref = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(350);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setW(Math.max(260, Math.round(entry.contentRect.width))));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const values = [
    ...points.flatMap((p) => [p.weight, p.trend]).filter((v): v is number => v !== null),
    ...(goal ? [goal.low, goal.high] : []),
    ...(projection ? [projection.weight] : []),
  ];
  if (!points.some((p) => p.weight !== null)) return <p className="py-8 text-center text-[15px] text-ink-3">Weigh in a few days to see your trend.</p>;
  const first = points[0].date;
  const last = [points.at(-1)!.date, goal?.date, projection?.date].filter((d): d is ISODate => Boolean(d)).sort().at(-1)!;
  const span = Math.max(1, daysBetween(first, last));
  const { lo, hi } = yScale(Math.min(...values), Math.max(...values));
  const x = (d: ISODate) => 4 + (daysBetween(first, d) / span) * (W - 8);
  const y = (v: number) => TOP + ((hi - v) / (hi - lo)) * PLOT_H;
  const line = points.filter((p) => p.trend !== null);
  const end = line.at(-1);
  return (
    <div ref={ref}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={label}>
        {goal && <rect x={x(goal.date) - 32} y={y(goal.high)} width="32" height={y(goal.low) - y(goal.high)} fill="var(--well)" />}
        <line x1="0" x2={W} y1={H - 8} y2={H - 8} stroke="var(--rule)" />
        {marker && <line x1={x(marker)} x2={x(marker)} y1={TOP} y2={TOP + PLOT_H} stroke="var(--border)" strokeDasharray="4 5" />}
        {points.map((p) => (p.weight !== null ? <circle key={p.date} cx={x(p.date)} cy={y(p.weight)} r="2.5" fill="var(--border)" /> : null))}
        {line.length > 1 && (
          <polyline
            points={line.map((p) => `${x(p.date).toFixed(1)},${y(p.trend!).toFixed(1)}`).join(" ")}
            fill="none"
            stroke="var(--ink)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
        {end && projection && <line x1={x(end.date)} y1={y(end.trend!)} x2={x(projection.date)} y2={y(projection.weight)} stroke="var(--ink)" strokeWidth="2" strokeDasharray="5 6" />}
        {end && <circle cx={x(end.date)} cy={y(end.trend!)} r="5" fill="var(--ink)" />}
      </svg>
    </div>
  );
}
```

- [ ] **Step 8: Move the scale's test with it.**

```bash
mkdir -p tests/unit/ui && git mv tests/unit/weight-chart.test.ts tests/unit/ui/trend-chart.test.ts
```

In `tests/unit/ui/trend-chart.test.ts`, change the import to `import { yScale } from '~/ui/TrendChart';`. `WeightChart` keeps its own copy until v1 Progress goes in Task 6.

- [ ] **Step 9: Run the tests and typecheck.**

```bash
npx vitest run --project unit tests/unit/ui/sparkline.test.ts tests/unit/ui/trend-chart.test.ts
npm run typecheck
```

Expected: PASS, and no type errors (the check-in's `<TrendChart>` still compiles).

- [ ] **Step 10: Commit.**

```bash
git add app/ui/Sparkline.tsx app/ui/GoUpTag.tsx app/ui/TrendChart.tsx tests/unit/ui/sparkline.test.ts tests/unit/ui/trend-chart.test.ts
git commit -m "The sparkline, the GO UP tag, and the trend chart's goal band and pace line"
```

---

### Task 2: Every lift's history

The fixture: four Monday workouts (Oct 5 to 26) with incline press and pec deck, four Tuesday extras with pull-ups at body weight, one cable crossover added to the last extra, and a pec deck set on Sep 28, before the phase, that every reader leaves out. The plan's lifts are the 6 + 6 + 6 of Monday, Wednesday and Friday plus the extra's 4, with cable lateral raise in both Wednesday and the extra: 21. Chest has 12 exercises, 4 of them in the plan.

**Files:**
- Create: `app/lifts/model.ts`
- Test: `tests/unit/lifts/model.test.ts`

- [ ] **Step 1: Write the failing test.** Create `tests/unit/lifts/model.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { bestSets, buildLift, buildLifts, liftIds, planLifts } from "~/lifts/model";
import type { Row } from "~/sync/tables";

const rowsOf = (t: Record<string, Row[]>) => (name: string) => t[name] ?? [];
const WED = "2026-10-28";
const MONDAYS = ["2026-10-05", "2026-10-12", "2026-10-19", "2026-10-26"];
const TUESDAYS = ["2026-10-06", "2026-10-13", "2026-10-20", "2026-10-27"];
const done = (client_id: string, date: string, template_id: string): Row => ({
  id: null, client_id, date, template_id, started_at: `${date}T17:00:00Z`, ended_at: `${date}T18:00:00Z`, lifts: null, feel: null,
});
let n = 0;
const sets = (key: string, date: string, exercise_id: string, list: [number, number][]): Row[] =>
  list.map(([weight_lb, reps], i) => ({ id: null, client_id: `s-${++n}`, session_key: key, exercise_id, position: 0, set_number: i + 1, weight_lb, reps, logged_at: `${date}T17:0${i}:00Z` }));
const PEC: [number, number][][] = [[[120, 12], [120, 11]], [[125, 11], [125, 10]], [[125, 12], [125, 11]], [[130, 12], [130, 12]]];
// Incline press is 6 to 10, so Oct 5 and Oct 19 hit the top.
const INCLINE: [number, number][][] = [[[45, 10], [45, 10]], [[50, 9], [50, 8]], [[50, 10], [50, 10]], [[55, 9], [55, 8]]];
const PULL_UPS: [number, number][][] = [[[0, 6], [0, 5]], [[0, 7], [0, 6]], [[0, 7], [0, 7]], [[0, 8], [0, 7]]];
const history = {
  workout_sessions: [
    ...MONDAYS.map((d, i) => done(`mon-${i}`, d, "mon-chest-back-arms")),
    ...TUESDAYS.map((d, i) => done(`tue-${i}`, d, "optional-arms-back")),
    // Before the phase: left out.
    done("old", "2026-09-28", "mon-chest-back-arms"),
  ],
  set_logs: [
    ...MONDAYS.flatMap((d, i) => [...sets(`mon-${i}`, d, "incline-dumbbell-press", INCLINE[i]), ...sets(`mon-${i}`, d, "pec-deck", PEC[i])]),
    ...TUESDAYS.flatMap((d, i) => sets(`tue-${i}`, d, "pull-up", PULL_UPS[i])),
    // A lift outside the plan, added to Tuesday's extra once.
    ...sets("tue-3", TUESDAYS[3], "cable-crossover", [[30, 12], [30, 11]]),
    ...sets("old", "2026-09-28", "pec-deck", [[200, 12]]),
  ],
};
const rows = rowsOf(history);

describe("planLifts", () => {
  it("holds the 21 lifts of the gym and extra workouts, with cable lateral raise in two", () => {
    const lifts = planLifts(rowsOf({}));
    expect(lifts.size).toBe(21);
    expect(lifts.get("cable-lateral-raise")).toEqual({ templates: ["wed-legs-shoulders", "optional-arms-back"], repMin: 10, repMax: 15 });
  });

  it("follows an always-swap", () => {
    const swapped = planLifts(rowsOf({ exercise_overrides: [{ template_id: "mon-chest-back-arms", position: 1, exercise_id: "cable-crossover" }] }));
    expect(swapped.has("pec-deck")).toBe(false);
    expect(swapped.get("cable-crossover")).toEqual({ templates: ["mon-chest-back-arms"], repMin: 8, repMax: 12 });
  });
});

describe("buildLifts", () => {
  it("counts the plan's lifts plus anything else logged, grouped by body part", () => {
    expect(liftIds(rows)).toHaveLength(22);
    const m = buildLifts(rows);
    expect(m.title).toBe("All 22 lifts.");
    expect(m.meta).toBe("Best set, and gain since Oct 5");
    expect(m.sections.map((s) => [s.label, s.rows.length])).toEqual([
      ["Chest", 5],
      ["Back", 3],
      ["Shoulders", 4],
      ["Arms", 6],
      ["Legs", 4],
    ]);
    expect(m.sections[0].rows.map((r) => [r.name, r.sub, r.spark, r.gain])).toEqual([
      ["Incline dumbbell press", "Best 55 × 9 · Mon", [45, 50, 50, 55], "+10"],
      ["Pec deck", "Best 130 × 12 · Mon", [120, 125, 125, 130], "+10"],
      ["Flat dumbbell press", "No sets yet · Fri", [], "0"],
      ["Cable fly, low to high", "No sets yet · Fri", [], "0"],
      ["Cable crossover", "Best 30 × 12 · Swap", [30], "0"],
    ]);
    // Body weight counts reps.
    expect(m.sections[1].rows[2]).toMatchObject({ name: "Pull-ups", sub: "Best 8 reps · Extra", spark: [6, 7, 7, 8], gain: "+2" });
  });

  it("is the plan's 21 when nothing else was logged", () => {
    expect(buildLifts(rowsOf({})).title).toBe("All 21 lifts.");
  });
});

describe("buildLift", () => {
  it("shows the best set, the gain, the history and the swaps, and goes up next time", () => {
    const p = buildLift(rows, WED, "pec-deck", "progress", true)!;
    expect(p).toMatchObject({
      header: "ALL LIFTS · CHEST",
      back: { to: "/progress/lifts", label: "Back to all lifts" },
      title: "Pec deck.",
      meta: "Machine · Monday · 8 to 12 reps",
      images: ["/media/exercises/Butterfly/0.jpg", "/media/exercises/Butterfly/1.jpg"],
      best: { text: "130 × 12", unit: "lb", goUp: true, change: "up 10 lb since Oct 5" },
      swapsNote: "8 for chest",
    });
    expect(p.chart.map((c) => c.value)).toEqual([120, 125, 125, 130]);
    expect(p.history.map((h) => [h.label, h.sets, h.next, h.goUp])).toEqual([
      ["OCT 26", "130 × 12, 12", "next 135", false],
      ["OCT 19", "125 × 12, 11", null, false],
      ["OCT 12", "125 × 11, 10", null, false],
      ["OCT 5", "120 × 12, 11", null, false],
    ]);
    expect(p.history[0].to).toBe("/workout?date=2026-10-26&back=%2Flift%2Fpec-deck%3Ffrom%3Dprogress");
    expect(p.swaps.map((s) => s.name)).toEqual([
      "Barbell bench press",
      "Cable crossover",
      "Dumbbell fly",
      "Machine chest press",
      "Machine incline press",
      "Push-ups",
      "Smith machine bench press",
      "Smith machine incline press",
    ]);
    expect(p.swaps[1]).toEqual({ id: "cable-crossover", name: "Cable crossover", equipment: "Cable", to: "/lift/cable-crossover?from=progress" });
  });

  it("tags the older sessions that earned a move", () => {
    const p = buildLift(rows, WED, "incline-dumbbell-press", "library", true)!;
    expect(p.header).toBe("LIBRARY · CHEST");
    expect(p.back).toEqual({ to: "/library?tab=exercises", label: "Back to Library" });
    expect(p.meta).toBe("Dumbbells · Monday · 6 to 10 reps");
    expect(p.best).toEqual({ text: "55 × 9", unit: "lb", goUp: false, change: "up 10 lb since Oct 5" });
    expect(p.history.map((h) => [h.label, h.sets, h.next, h.goUp])).toEqual([
      ["OCT 26", "55 × 9, 8", null, false],
      ["OCT 19", "50 × 10, 10", null, true],
      ["OCT 12", "50 × 9, 8", null, false],
      ["OCT 5", "45 × 10, 10", null, true],
    ]);
  });

  it("counts reps for a body-weight lift", () => {
    const p = buildLift(rows, WED, "pull-up", "library", true)!;
    expect(p.meta).toBe("Body weight · the extra · 5 to 12 reps");
    expect(p.best).toEqual({ text: "8", unit: "reps", goUp: false, change: "up 2 reps since Oct 6" });
    expect(p.history[0]).toMatchObject({ label: "OCT 27", sets: "8, 7 reps", goUp: false });
    expect(p.swapsNote).toBe("3 for back");
  });

  it("names every day a lift is planned, and says when there is no history", () => {
    const p = buildLift(rowsOf({}), WED, "cable-lateral-raise", "library", true)!;
    expect(p.meta).toBe("Cable · Wednesday and the extra · 10 to 15 reps");
    expect(p.best).toBeNull();
    expect(p.history).toEqual([]);
  });

  it("calls a lift outside the plan a swap", () => {
    const p = buildLift(rows, WED, "cable-crossover", "library", true)!;
    expect(p.meta).toBe("Cable · Swap for chest");
    expect(p.best).toEqual({ text: "30 × 12", unit: "lb", goUp: false, change: "first logged Oct 27" });
    expect(p.swapsNote).toBe("7 for chest");
  });

  it("holds after a drop until the dropped session is logged", () => {
    const dropped = rowsOf({ ...history, lift_drops: [{ exercise_id: "pec-deck", weight_lb: 120, from_date: "2026-11-02", created_at: "2026-11-01T23:00:00Z" }] });
    const p = buildLift(dropped, WED, "pec-deck", "progress", true)!;
    expect(p.best?.goUp).toBe(false);
    expect(p.history[0].next).toBeNull();
  });

  it("works without a plan: no days, every other chest lift as a swap, no workout links", () => {
    const p = buildLift(rowsOf({}), WED, "pec-deck", "library", false)!;
    expect(p.meta).toBe("Machine · Chest");
    expect(p.swapsNote).toBe("11 for chest");
    const withSets = buildLift(rows, WED, "pec-deck", "library", false)!;
    expect(withSets.best?.goUp).toBe(false);
    expect(withSets.history.every((h) => h.to === null && h.next === null)).toBe(true);
  });

  it("is null for an exercise not in the library", () => {
    expect(buildLift(rows, WED, "bench-dips", "library", true)).toBeNull();
  });
});

describe("bestSets", () => {
  it("reads each lift's best set since the phase start", () => {
    expect(bestSets(rows)).toEqual(
      new Map([
        ["incline-dumbbell-press", "55 × 9"],
        ["pec-deck", "130 × 12"],
        ["pull-up", "8 reps"],
        ["cable-crossover", "30 × 12"],
      ]),
    );
  });
});
```

- [ ] **Step 2: Run it to make sure it fails.**

```bash
npx vitest run --project unit tests/unit/lifts/model.test.ts
```

Expected: FAIL. `~/lifts/model` doesn't exist yet.

- [ ] **Step 3: Write the model.** Create `app/lifts/model.ts`:

```ts
// Every lift's history, worked out from the phone's copy: All lifts, the lift page, and the Library's exercise rows.
// Pure: the browser and the unit tests both run it.
import { BODY_PART, BODY_PARTS, exerciseImage, exercises, plan, type BodyPart } from "~/content";
import type { Exercise } from "~/content/schema";
import { weekType } from "~/domain/calendar";
import { addDays } from "~/domain/dates";
import { nextSuggestion, withDrop, type Feel, type LoggedSet } from "~/domain/progression";
import { bestSet } from "~/domain/stalls";
import type { ISODate } from "~/domain/types";
import { setsText } from "~/workout/model";
import { dropFor, sessionKey, type Rows } from "~/workout/sessions";

export const EQUIPMENT: Record<Exercise["equipment"], string> = { barbell: "Barbell", "body-weight": "Body weight", cable: "Cable", dumbbell: "Dumbbells", machine: "Machine" };
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY_NAME = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
/** A lift outside the plan gets the range an added lift gets. */
const OFF_PLAN_REP_MAX = 12;

export const monthDay = (d: ISODate) => `${MONTH[Number(d.slice(5, 7)) - 1]} ${Number(d.slice(8, 10))}`;
export const partOf = (ex: Exercise): BodyPart => BODY_PART[ex.group];
/** "Chest" */
export const partLabel = (part: BodyPart) => BODY_PARTS.find((b) => b.id === part)!.label;

/** "Monday", "Wednesday and the extra", "Monday, Wednesday and Friday". */
export function joinAnd(parts: string[]): string {
  return parts.length <= 1 ? (parts[0] ?? "") : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}

/** Each plan workout's day: its weekday, or the extra. Plan B doesn't count. */
export const TEMPLATE_DAY: Record<string, { short: string; long: string }> = Object.fromEntries([
  ...Object.entries(plan.training).map(([wd, id]) => [id, { short: DAY_NAME[Number(wd)].slice(0, 3), long: DAY_NAME[Number(wd)] }]),
  ...Object.values(plan.optional).map((id) => [id, { short: "Extra", long: "the extra" }]),
]);

export interface PlanLift {
  /** The workouts that use it, in plan order. */
  templates: string[];
  /** The first workout's range. */
  repMin: number;
  repMax: number;
}

/** The lifts in the plan's gym and extra workouts after always-swaps, in plan order. */
export function planLifts(rows: Rows): Map<string, PlanLift> {
  const overrides = rows("exercise_overrides");
  const out = new Map<string, PlanLift>();
  for (const [id, t] of Object.entries(plan.templates)) {
    if (!TEMPLATE_DAY[id]) continue;
    t.exercises.forEach((e, position) => {
      const swapped = overrides.find((r) => r.template_id === id && Number(r.position) === position)?.exercise_id as string | undefined;
      const exercise = swapped && exercises.has(swapped) ? swapped : e.exercise;
      const have = out.get(exercise);
      if (!have) out.set(exercise, { templates: [id], repMin: e.repMin, repMax: e.repMax });
      else if (!have.templates.includes(id)) have.templates.push(id);
    });
  }
  return out;
}

export interface LiftSession {
  date: ISODate;
  sets: LoggedSet[];
  feel: Feel | null;
  /** The heaviest set, then the most reps at that weight. */
  best: LoggedSet;
}

const asFeel = (v: unknown): Feel | null => (v === "easy" || v === "right" || v === "hard" ? v : null);

/** Each exercise's workouts with logged sets since the phase start, oldest first. */
export function liftSessions(rows: Rows): Map<string, LiftSession[]> {
  const sessions = new Map(rows("workout_sessions").map((r) => [sessionKey(r), r]));
  const grouped = new Map<string, { exercise: string; date: ISODate; key: string; first: string; sets: { n: number; set: LoggedSet }[] }>();
  for (const r of rows("set_logs")) {
    const key = r.session_key as string;
    const date = sessions.get(key)?.date as ISODate | undefined;
    if (!date || date < plan.phaseStart) continue;
    const id = `${r.exercise_id}|${key}`;
    const g = grouped.get(id) ?? { exercise: r.exercise_id as string, date, key, first: r.logged_at as string, sets: [] };
    g.sets.push({ n: Number(r.set_number), set: { weight: Number(r.weight_lb), reps: Number(r.reps) } });
    if ((r.logged_at as string) < g.first) g.first = r.logged_at as string;
    grouped.set(id, g);
  }
  const out = new Map<string, LiftSession[]>();
  for (const g of [...grouped.values()].sort((a, b) => a.date.localeCompare(b.date) || a.first.localeCompare(b.first))) {
    const sets = g.sets.sort((a, b) => a.n - b.n).map((s) => s.set);
    out.set(g.exercise, [...(out.get(g.exercise) ?? []), { date: g.date, sets, feel: asFeel(sessions.get(g.key)?.feel), best: bestSet(sets) }]);
  }
  return out;
}

/** Body-weight lifts with no added weight are measured in reps. */
const inReps = (ex: Exercise, history: LiftSession[]) => ex.equipment === "body-weight" && history.every((s) => s.best.weight === 0);
const measure = (s: LiftSession, reps: boolean) => (reps ? s.best.reps : s.best.weight);
const bestText = (b: LoggedSet, reps: boolean) => (reps ? `${b.reps} reps` : `${b.weight} × ${b.reps}`);
const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "0");
const allTimeBest = (history: LiftSession[]) => bestSet(history.map((s) => s.best));

/** Every lift All lifts lists: the plan's, then anything else with sets since the phase start, by name. */
export function liftIds(rows: Rows, history = liftSessions(rows)): string[] {
  const inPlan = [...planLifts(rows).keys()];
  const others = [...history.keys()].filter((id) => exercises.has(id) && !inPlan.includes(id)).sort((a, b) => exercises.get(a)!.name.localeCompare(exercises.get(b)!.name));
  return [...inPlan, ...others];
}

/** The best set for each exercise with history: "55 × 9", or "8 reps". */
export function bestSets(rows: Rows): Map<string, string> {
  const out = new Map<string, string>();
  for (const [id, list] of liftSessions(rows)) {
    const ex = exercises.get(id);
    if (ex) out.set(id, bestText(allTimeBest(list), inReps(ex, list)));
  }
  return out;
}

export interface LiftRow {
  id: string;
  name: string;
  /** "Best 55 × 9 · Mon" */
  sub: string;
  /** Top weight (or reps) in the last 4 sessions. */
  spark: number[];
  /** "+10", "0" */
  gain: string;
}

export interface LiftsModel {
  /** "All 21 lifts." */
  title: string;
  meta: string;
  sections: { part: BodyPart; label: string; rows: LiftRow[] }[];
}

export function buildLifts(rows: Rows): LiftsModel {
  const history = liftSessions(rows);
  const inPlan = planLifts(rows);
  const ids = liftIds(rows, history);
  const row = (id: string): LiftRow => {
    const ex = exercises.get(id)!;
    const list = history.get(id) ?? [];
    const reps = inReps(ex, list);
    const planned = inPlan.get(id);
    const day = planned ? TEMPLATE_DAY[planned.templates[0]].short : "Swap";
    return {
      id,
      name: ex.name,
      sub: list.length ? `Best ${bestText(allTimeBest(list), reps)} · ${day}` : `No sets yet · ${day}`,
      spark: list.slice(-4).map((s) => measure(s, reps)),
      gain: list.length ? signed(measure(list.at(-1)!, reps) - measure(list[0], reps)) : "0",
    };
  };
  return {
    title: `All ${ids.length} lifts.`,
    meta: `Best set, and gain since ${monthDay(plan.phaseStart)}`,
    sections: BODY_PARTS.map((b) => ({ part: b.id, label: b.label, rows: ids.filter((id) => partOf(exercises.get(id)!) === b.id).map(row) })).filter((s) => s.rows.length > 0),
  };
}

export type LiftFrom = "library" | "progress";

export interface HistoryRow {
  date: ISODate;
  /** "OCT 26" */
  label: string;
  /** "130 × 12, 12", or "8, 7 reps" */
  sets: string;
  /** "next 135" on the newest session, when the next one goes up. */
  next: string | null;
  /** An older session that earned a move. */
  goUp: boolean;
  /** That day's workout, where its sets can be fixed. Null without a plan. */
  to: string | null;
}

export interface LiftPage {
  id: string;
  /** "LIBRARY · CHEST" or "ALL LIFTS · CHEST" */
  header: string;
  back: { to: string; label: string };
  title: string;
  meta: string;
  images: [string, string];
  /** Null with no history: "No sets logged yet." */
  best: { text: string; unit: string; goUp: boolean; change: string } | null;
  chart: { date: ISODate; value: number }[];
  history: HistoryRow[];
  /** "8 for chest" */
  swapsNote: string;
  swaps: { id: string; name: string; equipment: string; to: string }[];
}

export function buildLift(rows: Rows, today: ISODate, id: string, from: LiftFrom, hasPlan: boolean): LiftPage | null {
  const ex = exercises.get(id);
  if (!ex) return null;
  const part = partOf(ex);
  const inPlan = hasPlan ? planLifts(rows) : null;
  const mine = inPlan?.get(id) ?? null;
  const list = liftSessions(rows).get(id) ?? [];
  const reps = inReps(ex, list);
  const repMax = mine?.repMax ?? OFF_PLAN_REP_MAX;
  const unit = reps ? "reps" : "lb";
  const self = `/lift/${id}?from=${from}`;

  let best: LiftPage["best"] = null;
  let next: number | null = null;
  if (list.length > 0) {
    const first = list[0];
    const last = list.at(-1)!;
    const drop = dropFor(rows, id);
    // The next session is today at the earliest. A drop from Sunday's check-in waits for its Monday.
    const on = drop && drop.from > today ? drop.from : today;
    const suggestion = withDrop(nextSuggestion(last.sets, { repMax, increment: ex.increment, deload: weekType(plan, today) === "deload" }, last.feel), drop, last.date, on);
    if (hasPlan && !reps && suggestion.goUp && suggestion.weight !== null) next = suggestion.weight;
    const top = allTimeBest(list);
    const change = measure(last, reps) - measure(first, reps);
    best = {
      text: reps ? String(top.reps) : `${top.weight} × ${top.reps}`,
      unit,
      goUp: next !== null,
      change:
        list.length === 1
          ? `first logged ${monthDay(first.date)}`
          : change === 0
            ? `same as ${monthDay(first.date)}`
            : `${change > 0 ? "up" : "down"} ${Math.abs(change)} ${unit} since ${monthDay(first.date)}`,
    };
  }

  // The same body part, minus the plan's own lifts. Without a plan, every other one.
  const swaps = [...exercises.values()].filter((e) => e.id !== id && partOf(e) === part && !inPlan?.has(e.id)).sort((a, b) => a.name.localeCompare(b.name));
  return {
    id,
    header: `${from === "progress" ? "ALL LIFTS" : "LIBRARY"} · ${partLabel(part).toUpperCase()}`,
    back: from === "progress" ? { to: "/progress/lifts", label: "Back to all lifts" } : { to: "/library?tab=exercises", label: "Back to Library" },
    title: `${ex.name}.`,
    meta: !hasPlan
      ? `${EQUIPMENT[ex.equipment]} · ${partLabel(part)}`
      : mine
        ? `${EQUIPMENT[ex.equipment]} · ${joinAnd(mine.templates.map((t) => TEMPLATE_DAY[t].long))} · ${mine.repMin} to ${mine.repMax} reps`
        : `${EQUIPMENT[ex.equipment]} · Swap for ${part}`,
    images: [exerciseImage(ex, 0), exerciseImage(ex, 1)],
    best,
    chart: list.map((s) => ({ date: s.date, value: measure(s, reps) })),
    history: list
      .map((s, i): HistoryRow => {
        const newest = i === list.length - 1;
        // As the Done screen judges it: a deload the week after holds the weight.
        const earned = nextSuggestion(s.sets, { repMax, increment: ex.increment, deload: weekType(plan, addDays(s.date, 7)) === "deload" }, s.feel).goUp;
        return {
          date: s.date,
          label: monthDay(s.date).toUpperCase(),
          sets: reps ? `${s.sets.map((x) => x.reps).join(", ")} reps` : setsText(s.sets),
          next: newest && next !== null ? `next ${next}` : null,
          goUp: !newest && !reps && earned,
          to: hasPlan ? `/workout?date=${s.date}&back=${encodeURIComponent(self)}` : null,
        };
      })
      .reverse(),
    swapsNote: `${swaps.length} for ${part}`,
    swaps: swaps.map((e) => ({ id: e.id, name: e.name, equipment: EQUIPMENT[e.equipment], to: `/lift/${e.id}?from=${from}` })),
  };
}
```

- [ ] **Step 4: Run the test.** Same command as Step 2. Expected: PASS, 13 tests.

- [ ] **Step 5: Commit.**

```bash
git add app/lifts/model.ts tests/unit/lifts/model.test.ts
git commit -m "Every lift's history from the phone's copy: All lifts, the lift page and best sets"
```

---

### Task 3: The Progress model

The weigh-in fixture falls 0.2 lb a day from 207.0 on Oct 5 to 202.4 on Oct 28. The trend (each weigh-in pulls it a tenth of the way) reaches 204.04 on Oct 28. There are 23 days of trend, under 4 weeks, so the pace runs from Oct 5: (204.04 - 207.0) / 23 x 7 = -0.90 lb a week. Jan 1 is 65 days on: 204.04 - 2.96 / 23 x 65 = 195.68, inside 195 to 198, so "On pace." and "land near 196".

**Files:**
- Modify: `app/today/model.ts` (export `dayActivity`)
- Create: `app/progress/model.ts`
- Test: `tests/unit/progress/model.test.ts`

- [ ] **Step 1: Write the failing test.** Create `tests/unit/progress/model.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { addDays } from "~/domain/dates";
import { buildProgress, nextPhotoDate, paceLine } from "~/progress/model";
import type { Row } from "~/sync/tables";

const at = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00-05:00`);
const rowsOf = (t: Record<string, Row[]>) => (name: string) => t[name] ?? [];
const START = "2026-10-05";
const WED = "2026-10-28";
// A weigh-in every day from Oct 5, falling 0.2 lb a day: 207.0, 206.8, ... 202.4 on Oct 28.
const weighIns = (skip: string[] = [], perDay = 0.2): Row[] =>
  Array.from({ length: 24 }, (_, i) => ({ date: addDays(START, i), weight_lb: Math.round((207 - perDay * i) * 10) / 10, logged_at: `${addDays(START, i)}T12:00:00Z` })).filter(
    (w) => !skip.includes(w.date as string),
  );
const done = (client_id: string, date: string, template_id: string): Row => ({
  id: null, client_id, date, template_id, started_at: `${date}T17:00:00Z`, ended_at: `${date}T18:00:00Z`, lifts: null, feel: null,
});
let n = 0;
const set = (key: string, date: string, exercise_id: string, weight_lb: number, reps: number): Row => ({
  id: null, client_id: `s-${++n}`, session_key: key, exercise_id, position: 0, set_number: 1, weight_lb, reps, logged_at: `${date}T17:05:00Z`,
});
const MONDAYS = ["2026-10-05", "2026-10-12", "2026-10-19", "2026-10-26"];
const WEDNESDAYS = ["2026-10-07", "2026-10-14", "2026-10-21"];
const TUESDAYS = ["2026-10-06", "2026-10-13", "2026-10-20", "2026-10-27"];
// Mondays and three Wednesdays done (7 of the 10 planned before today), plus 4 Tuesday extras.
const workouts = {
  workout_sessions: [
    ...MONDAYS.map((d, i) => done(`m${i}`, d, "mon-chest-back-arms")),
    ...WEDNESDAYS.map((d, i) => done(`w${i}`, d, "wed-legs-shoulders")),
    ...TUESDAYS.map((d, i) => done(`t${i}`, d, "optional-arms-back")),
  ],
  set_logs: [
    ...MONDAYS.flatMap((d, i) => [set(`m${i}`, d, "pec-deck", [120, 125, 125, 130][i], 12), set(`m${i}`, d, "incline-dumbbell-press", [45, 50, 50, 55][i], 9)]),
    ...WEDNESDAYS.map((d, i) => set(`w${i}`, d, "leg-press", [250, 260, 280][i], 10)),
    ...TUESDAYS.map((d, i) => set(`t${i}`, d, "pull-up", 0, 6 + i)),
  ],
};
const slots = ["breakfast", "lunch", "snack", "dinner", "dessert"];
const closedDay = (date: string, protein: number, skipDessert = false): Row[] =>
  slots.map((slot) => {
    const skipped = skipDessert && slot === "dessert";
    return { client_id: `${date}-${slot}`, date, slot, meal_slug: skipped ? null : "x", category: skipped ? "skipped" : "planned", kcal: skipped ? 0 : 500, protein_g: skipped ? 0 : protein };
  });
// Two days tracked in full: 5 x 40 = 200 g, and 4 x 35 = 140 g with dessert skipped. Today is half logged and doesn't count.
const meals: Row[] = [...closedDay("2026-10-26", 40), ...closedDay("2026-10-27", 35, true), { client_id: "today", date: WED, slot: "breakfast", meal_slug: "x", category: "planned", kcal: 500, protein_g: 50 }];
const waist: Row[] = [
  { date: "2026-10-11", inches: 35.75 },
  { date: "2026-10-25", inches: 35.5 },
];

describe("buildProgress", () => {
  const m = buildProgress(rowsOf({ weigh_ins: weighIns(), waist_logs: waist, meal_logs: meals, ...workouts }), at(WED, "09:00"));

  it("reads the trend against the Jan 1 goal", () => {
    // The trend reaches 204.04 on Oct 28, from 207.0 on Oct 5: down 3.0. At that pace (-0.90 a week) the 65 days
    // to Jan 1 land at 195.68, inside 195 to 198.
    expect(m.poster).toEqual(["Down 3.0.", "On pace."]);
    expect(m.meta).toBe("Trend 204.0 lb · Jan 1 goal 195 to 198");
    // The chart plots the trend and the pace line's end unrounded; only the labels and the note round them.
    expect(m.chart.projection).toMatchObject({ date: "2027-01-01" });
    expect(m.chart.projection!.weight).toBeCloseTo(195.68, 1);
    expect(m.note).toBe("Dots are daily weigh-ins, the line is the trend. At this pace you land near 196 on Jan 1. Waist matters more during a recomp.");
  });

  it("draws the phase with the goal band, or the last 4 weeks, or everything", () => {
    expect(m.chart.points).toHaveLength(24);
    expect(m.chart.points[0]).toEqual({ date: START, weight: 207, trend: null });
    // The line starts with the third weigh-in: 207, 206.98, 206.942.
    expect(m.chart.points[2]).toMatchObject({ date: "2026-10-07", weight: 206.6 });
    expect(m.chart.points[2].trend).toBeCloseTo(206.942, 6);
    expect(m.chart.goal).toEqual({ date: "2027-01-01", low: 195, high: 198 });
    expect(m.chart.labels).toEqual({ start: "Oct 5 · 207.0", today: "Today 204.0", end: "Jan 1 · 195 to 198" });
    const fourWeeks = buildProgress(rowsOf({ weigh_ins: weighIns() }), at(WED, "09:00"), "4w").chart;
    expect([fourWeeks.points.length, fourWeeks.points[0].date, fourWeeks.goal, fourWeeks.projection, fourWeeks.labels.end]).toEqual([28, "2026-10-01", null, null, null]);
    expect(buildProgress(rowsOf({ weigh_ins: weighIns() }), at(WED, "09:00"), "all").chart.points[0].date).toBe(START);
  });

  it("calls the pace ahead or slower, and leaves it out under 2 weeks", () => {
    expect(paceLine(194.9, { low: 195, high: 198 })).toBe("Ahead of pace.");
    expect(paceLine(198.1, { low: 195, high: 198 })).toBe("Slower than pace.");
    expect(buildProgress(rowsOf({ weigh_ins: weighIns([], 0.3) }), at(WED, "09:00")).poster).toEqual(["Down 4.4.", "Ahead of pace."]);
    expect(buildProgress(rowsOf({ weigh_ins: weighIns([], 0) }), at(WED, "09:00")).poster).toEqual(["Level.", "Slower than pace."]);
    // Oct 5 to 14 is 9 days of trend.
    const early = buildProgress(rowsOf({ weigh_ins: weighIns().slice(0, 10) }), at("2026-10-14", "09:00"));
    expect(early.poster).toEqual(["Down 0.7."]);
    expect(early.note).toBe("Dots are daily weigh-ins, the line is the trend. Waist matters more during a recomp.");
  });

  it("waits for 3 weigh-ins", () => {
    const two = buildProgress(rowsOf({ weigh_ins: weighIns().slice(0, 2) }), at(WED, "09:00"));
    expect(two.poster).toEqual(["Progress.", "No trend yet."]);
    expect(two.meta).toBe("The trend needs 3 weigh-ins.");
  });

  it("lists the last 10 weigh-ins, newest first", () => {
    expect(m.weighIns.map((w) => [w.date, w.weight])).toEqual(
      Array.from({ length: 10 }, (_, i) => [addDays(WED, -i), Math.round((207 - 0.2 * (23 - i)) * 10) / 10]),
    );
  });

  it("shows the waist since the first entry, and the next photo date", () => {
    expect(m.body).toEqual([
      { label: "Waist", value: "35.5 in", sub: "down 0.25 since Oct 11" },
      { label: "Photos", value: "Nov 1", sub: "next set, front side back" },
    ]);
    const empty = buildProgress(rowsOf({}), at("2026-11-01", "09:00"));
    expect(empty.body).toEqual([
      { label: "Waist", value: "Not yet", sub: "Measure at the check-in" },
      { label: "Photos", value: "Today", sub: "front, side, back. They stay on your phone." },
    ]);
    expect(buildProgress(rowsOf({ waist_logs: [waist[0]] }), at(WED, "09:00")).body[0].sub).toBe("measured Oct 11");
  });

  it("schedules progress photos every 4 weeks from the phase start", () => {
    expect(nextPhotoDate("2026-10-12")).toBe("2026-11-01");
    expect(nextPhotoDate("2026-11-01")).toBe("2026-11-01");
    expect(nextPhotoDate("2026-11-02")).toBe("2026-11-29");
  });

  it("puts the most pounds gained first, and counts the lifts", () => {
    expect(m.stronger).toEqual([
      { id: "leg-press", name: "Leg press", from: 250, to: 280 },
      { id: "incline-dumbbell-press", name: "Incline dumbbell press", from: 45, to: 55 },
      { id: "pec-deck", name: "Pec deck", from: 120, to: 130 },
    ]);
    expect(m.liftsLink).toBe("All 21 lifts, best sets and history");
  });

  it("counts the days, the workouts with extras, and protein on tracked days", () => {
    // Oct 5 to 27 all counted (23), and today joins with its weigh-in. Protein: (200 + 140) / 2.
    expect(m.showingUp).toEqual([
      { value: "24 of 24", sub: "days counted" },
      { value: "11 of 10", sub: "workouts, plus extras" },
      { value: "170 g", sub: "protein a day" },
    ]);
    expect(m.streakLine).toBe("Never missed twice in a row. That's the streak that matters.");
  });

  it("counts from the last double miss", () => {
    const gap = buildProgress(rowsOf({ weigh_ins: weighIns(["2026-10-09", "2026-10-10"]) }), at(WED, "09:00"));
    expect(gap.showingUp).toEqual([
      { value: "22 of 24", sub: "days counted" },
      { value: "0 of 10", sub: "workouts" },
      { value: "Not yet", sub: "protein a day" },
    ]);
    expect(gap.streakLine).toBe("18 days since the last double miss. Never miss twice.");
  });
});
```

- [ ] **Step 2: Run it to make sure it fails.**

```bash
npx vitest run --project unit tests/unit/progress/model.test.ts
```

Expected: FAIL. `~/progress/model` doesn't exist yet.

- [ ] **Step 3: Today shares its counted-day reading.** In `app/today/model.ts`, add this function just above `export function buildToday`:

```ts
/** What happened on each day, for the counted-day rule. Progress counts days with it too. */
export function dayActivity(rows: Rows, hasPlan: boolean): (d: ISODate) => DayActivity {
  const weighDates = new Set(rows("weigh_ins").map((r) => s(r, "date")));
  // A skip answers the slot but isn't a meal, so it doesn't make a day count.
  const mealDates = new Set(rows("meal_logs").filter((r) => r.category !== "skipped").map((r) => s(r, "date")));
  const workoutDates = loggedDates(rows);
  const steps = new Map(rows("steps_daily").map((r) => [s(r, "date"), n(r, "steps")]));
  return (d) => ({ weighIn: weighDates.has(d), mealLogged: mealDates.has(d), workout: workoutDates.has(d), steps: steps.get(d) ?? 0, relaxed: hasPlan && isRelaxedDay(plan, d) });
}
```

and in `buildToday` replace

```ts
  const activity = (d: ISODate): DayActivity => ({
    weighIn: weighDates.has(d),
    mealLogged: mealDates.has(d),
    workout: workoutDates.has(d),
    steps: stepsByDate.get(d) ?? 0,
    relaxed: hasPlan && isRelaxedDay(plan, d),
  });
```

with

```ts
  const activity = dayActivity(rows, hasPlan);
```

`weighDates`, `mealDates`, `workoutDates` and `stepsByDate` stay: the streak's first day, the steps and the situation read them.

- [ ] **Step 4: Write the model.** Create `app/progress/model.ts`:

```ts
// Everything Progress shows, worked out from the phone's copy. Pure: the browser and the unit tests both run it.
import { exercises, plan } from "~/content";
import { isTrainingDay, type Moves } from "~/domain/calendar";
import { dayCompleteness, isTracked } from "~/domain/completeness";
import { addDays, daysBetween, mealDate } from "~/domain/dates";
import { countedDay } from "~/domain/habits";
import { MIN_TREND_WEIGH_INS, trendReading, trendSeries } from "~/domain/trend";
import type { ISODate } from "~/domain/types";
import { liftIds, liftSessions, monthDay } from "~/lifts/model";
import type { Row } from "~/sync/tables";
import { dayActivity } from "~/today/model";
import type { TrendPoint } from "~/ui/TrendChart";
import { doneDates, type Rows } from "~/workout/sessions";

export type Range = "4w" | "phase" | "all";

export interface StatCell {
  label?: string;
  value: string;
  sub: string;
}

export interface ProgressModel {
  date: ISODate;
  poster: string[];
  meta: string;
  chart: {
    points: TrendPoint[];
    goal: { date: ISODate; low: number; high: number } | null;
    projection: { date: ISODate; weight: number } | null;
    /** "Oct 5 · 207.0", "Today 205.3", and on PHASE "Jan 1 · 195 to 198". */
    labels: { start: string; today: string; end: string | null };
  };
  note: string;
  /** The last 10, newest first, for "Fix a weigh-in". */
  weighIns: { date: ISODate; weight: number }[];
  body: StatCell[];
  stronger: { id: string; name: string; from: number; to: number }[];
  liftsLink: string;
  showingUp: StatCell[];
  streakLine: string;
}

const lb = (n: number) => n.toFixed(1);
/** Inches as entered, without trailing zeros: 35.5, 0.25. */
const inches = (n: number) => String(Math.round(n * 100) / 100);
const goalRange = () => `${plan.goal.low} to ${plan.goal.high}`;

/** Progress photos every 4 weeks: the first round on the Sunday that ends week 4. */
export function nextPhotoDate(today: ISODate): ISODate {
  const first = addDays(plan.phaseStart, 27);
  if (today <= first) return first;
  return addDays(first, Math.ceil(daysBetween(first, today) / 28) * 28);
}

/**
 * Where the trend lands on the goal date at the pace of the last 4 weeks of trend, or of all of it when there is less.
 * Null under 2 weeks, which is too short to call a pace.
 */
export function projectTrend(series: Map<ISODate, number>, today: ISODate, goalDate: ISODate): number | null {
  const now = series.get(today);
  const first = series.keys().next().value as ISODate | undefined;
  if (now === undefined || first === undefined) return null;
  const from = first > addDays(today, -28) ? first : addDays(today, -28);
  const days = daysBetween(from, today);
  if (days < 14) return null;
  return now + ((now - series.get(from)!) / days) * Math.max(0, daysBetween(today, goalDate));
}

/** On pace lands in the goal range. Under it is ahead, over it is slower. Never "behind". */
export function paceLine(projection: number, goal: { low: number; high: number }): string {
  if (projection < goal.low) return "Ahead of pace.";
  if (projection > goal.high) return "Slower than pace.";
  return "On pace.";
}

function chart(weighIns: { date: ISODate; weight: number }[], today: ISODate, range: Range, projection: number | null, trendNow: number | null): ProgressModel["chart"] {
  const firstWeighIn = weighIns[0]?.date ?? today;
  const from = range === "4w" ? addDays(today, -27) : range === "phase" ? plan.phaseStart : firstWeighIn;
  const series = trendSeries(weighIns, today);
  const byDate = new Map(weighIns.map((w) => [w.date, w.weight]));
  const points: TrendPoint[] = [];
  for (let d = from; d <= today; d = addDays(d, 1)) {
    // As on Today and the check-in, the line starts with the third weigh-in. Unrounded, so the line does not stair-step.
    const enough = weighIns.filter((w) => w.date <= d).length >= MIN_TREND_WEIGH_INS;
    const t = series.get(d);
    points.push({ date: d, weight: byDate.get(d) ?? null, trend: enough && t !== undefined ? t : null });
  }
  const first = weighIns.find((w) => w.date >= from);
  const phase = range === "phase";
  return {
    points,
    goal: phase ? { ...plan.goal } : null,
    projection: phase && projection !== null ? { date: plan.goal.date, weight: projection } : null,
    labels: {
      start: first ? `${monthDay(first.date)} · ${lb(first.weight)}` : monthDay(from),
      today: trendNow === null ? "Today" : `Today ${lb(trendNow)}`,
      end: phase ? `${monthDay(plan.goal.date)} · ${goalRange()}` : null,
    },
  };
}

function waistCell(rows: Rows): StatCell {
  const logs = rows("waist_logs")
    .map((r) => ({ date: r.date as ISODate, inches: Number(r.inches) }))
    .sort((a, b) => a.date.localeCompare(b.date));
  if (logs.length === 0) return { label: "Waist", value: "Not yet", sub: "Measure at the check-in" };
  const first = logs[0];
  const last = logs.at(-1)!;
  const change = Math.round((last.inches - first.inches) * 100) / 100;
  const sub =
    logs.length === 1
      ? `measured ${monthDay(first.date)}`
      : change === 0
        ? `same as ${monthDay(first.date)}`
        : `${change < 0 ? "down" : "up"} ${inches(Math.abs(change))} since ${monthDay(first.date)}`;
  return { label: "Waist", value: `${inches(last.inches)} in`, sub };
}

function photoCell(today: ISODate): StatCell {
  const next = nextPhotoDate(today);
  return next === today
    ? { label: "Photos", value: "Today", sub: "front, side, back. They stay on your phone." }
    : { label: "Photos", value: monthDay(next), sub: "next set, front side back" };
}

/** The 4 lifts with the most pounds gained since the phase start, from their first session's top weight to their latest. */
function stronger(rows: Rows): ProgressModel["stronger"] {
  return [...liftSessions(rows)]
    .filter(([id, list]) => exercises.has(id) && list.length >= 2)
    .map(([id, list]) => ({ id, name: exercises.get(id)!.name, from: list[0].best.weight, to: list.at(-1)!.best.weight }))
    .filter((l) => l.to > l.from)
    .sort((a, b) => b.to - b.from - (a.to - a.from) || a.name.localeCompare(b.name))
    .slice(0, 4);
}

function showingUp(rows: Rows, today: ISODate): { cells: StatCell[]; streakLine: string } {
  const start = plan.phaseStart;
  const activity = dayActivity(rows, true);
  const counted = (d: ISODate) => countedDay(activity(d));
  let days = 0;
  let countedDays = 0;
  let lastDoubleMiss: ISODate | null = null;
  for (let d = start; d < today; d = addDays(d, 1)) {
    days++;
    if (counted(d)) countedDays++;
    else if (d > start && !counted(addDays(d, -1))) lastDoubleMiss = d;
  }
  // Today joins once it counts. Until it is over it can't break anything.
  if (counted(today)) {
    days++;
    countedDays++;
  }

  const moves: Moves = Object.fromEntries(rows("schedule_moves").map((r) => [r.date as string, (r.template_id as string | null) ?? null]));
  const done = doneDates(rows, today);
  let planned = 0;
  let workouts = 0;
  let extras = 0;
  for (let d = start; d <= today; d = addDays(d, 1)) {
    if (isTrainingDay(plan, d, moves)) {
      if (d < today || done.has(d)) planned++;
      if (done.has(d)) workouts++;
    } else if (done.has(d)) extras++;
  }

  const byDay = new Map<ISODate, Row[]>();
  for (const l of rows("meal_logs")) {
    const d = l.date as ISODate;
    if (d >= start && d <= today) byDay.set(d, [...(byDay.get(d) ?? []), l]);
  }
  const tracked = [...byDay.values()].filter((logs) => isTracked(dayCompleteness(logs.map((l) => ({ slot: (l.slot as string | null) ?? null, category: l.category as string })))));
  const protein = tracked.length ? Math.round(tracked.reduce((sum, logs) => sum + logs.reduce((s, l) => s + Number(l.protein_g ?? 0), 0), 0) / tracked.length) : null;

  const since = lastDoubleMiss === null ? 0 : daysBetween(lastDoubleMiss, today);
  return {
    cells: [
      { value: `${countedDays} of ${days}`, sub: "days counted" },
      { value: `${workouts + extras} of ${planned}`, sub: extras > 0 ? "workouts, plus extras" : "workouts" },
      { value: protein === null ? "Not yet" : `${protein} g`, sub: "protein a day" },
    ],
    streakLine:
      lastDoubleMiss === null
        ? "Never missed twice in a row. That's the streak that matters."
        : `${since} day${since === 1 ? "" : "s"} since the last double miss. Never miss twice.`,
  };
}

export function buildProgress(rows: Rows, now: Date, range: Range = "phase"): ProgressModel {
  const today = mealDate(now);
  const weighIns = rows("weigh_ins")
    .map((r) => ({ date: r.date as ISODate, weight: Number(r.weight_lb) }))
    .filter((w) => w.date <= today)
    .sort((a, b) => a.date.localeCompare(b.date));
  const reading = trendReading(weighIns, today, plan.phaseStart);
  const projection = reading ? projectTrend(trendSeries(weighIns, today), today, plan.goal.date) : null;
  const change = reading?.sinceFrom ?? 0;
  const { cells, streakLine } = showingUp(rows, today);
  return {
    date: today,
    poster: !reading
      ? ["Progress.", "No trend yet."]
      : [change < 0 ? `Down ${lb(-change)}.` : change > 0 ? `Up ${lb(change)}.` : "Level.", ...(projection === null ? [] : [paceLine(projection, plan.goal)])],
    meta: reading ? `Trend ${lb(reading.weight)} lb · ${monthDay(plan.goal.date)} goal ${goalRange()}` : "The trend needs 3 weigh-ins.",
    chart: chart(weighIns, today, range, projection, reading?.weight ?? null),
    note: `Dots are daily weigh-ins, the line is the trend.${projection === null ? "" : ` At this pace you land near ${Math.round(projection)} on ${monthDay(plan.goal.date)}.`} Waist matters more during a recomp.`,
    weighIns: weighIns.slice(-10).reverse(),
    body: [waistCell(rows), photoCell(today)],
    stronger: stronger(rows),
    liftsLink: `All ${liftIds(rows).length} lifts, best sets and history`,
    showingUp: cells,
    streakLine,
  };
}
```

- [ ] **Step 5: Run the tests.**

```bash
npx vitest run --project unit tests/unit/progress/model.test.ts tests/unit/today/model.test.ts
```

Expected: PASS, the 10 new tests and Today's unchanged.

- [ ] **Step 6: Commit.**

```bash
git add app/today/model.ts app/progress/model.ts tests/unit/progress/model.test.ts
git commit -m "The Progress model: the pace to the Jan 1 goal, the chart's ranges, stronger, and showing up"
```

---

### Task 4: The Library model

**Files:**
- Create: `app/library/model.ts`
- Test: `tests/unit/library/model.test.ts`

- [ ] **Step 1: Write the failing test.** Create `tests/unit/library/model.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildLibrary } from "~/library/model";
import type { Row } from "~/sync/tables";

const at = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00-05:00`);
const rowsOf = (t: Record<string, Row[]>) => (name: string) => t[name] ?? [];
const WED = at("2026-10-28", "09:00");
const rows = rowsOf({
  targets: [{ effective_from: "2026-10-26", kcal: 2300, protein_g: 180, step_goal: 8500 }],
  meal_state: [
    { slug: "greek-yogurt-power-bowl", rested_until: "2026-11-08", photo_key: null },
    // Rested until a day already past.
    { slug: "salmon-and-rice", rested_until: "2026-10-20", photo_key: null },
  ],
  usual_orders: [
    { client_id: "u2", name: "Ranch Water", category: "drink", kcal: 100, protein_g: 0, relaxed: 0, uses: 1, last_used_at: "2026-10-24T18:00:00Z" },
    { client_id: "u1", name: "Chipotle bowl, double chicken", category: "restaurant", kcal: 1050, protein_g: 75, relaxed: 1, uses: 3, last_used_at: "2026-10-20T18:00:00Z" },
  ],
  workout_sessions: [{ id: null, client_id: "m", date: "2026-10-26", template_id: "mon-chest-back-arms", started_at: "2026-10-26T17:00:00Z", ended_at: "2026-10-26T18:00:00Z", lifts: null, feel: null }],
  set_logs: [{ id: null, client_id: "s1", session_key: "m", exercise_id: "incline-dumbbell-press", position: 0, set_number: 1, weight_lb: 55, reps: 9, logged_at: "2026-10-26T17:01:00Z" }],
});

describe("buildLibrary", () => {
  const m = buildLibrary(rows, WED, true);

  it("counts the meals and exercises", () => {
    expect([m.mealCount, m.exerciseCount]).toEqual([25, 49]);
  });

  it("lists meals by section, alphabetically, at today's grams", () => {
    expect(m.meals.map((s) => [s.label, s.rows.length, s.open, s.limit])).toEqual([
      ["Breakfast", 4, true, null],
      ["Lunch and dinner", 8, true, 3],
      ["Snacks", 5, false, null],
      ["Desserts", 5, false, null],
      ["Weekend only", 3, false, null],
    ]);
    // At 2,300, as the meal screen shows them.
    expect(m.meals[0].rows.map((r) => [r.name, r.sub, r.resting])).toEqual([
      ["Banana protein pancakes", "570 cal · 60 g", null],
      ["Greek yogurt power bowl", "535 cal · 62 g", "RESTING TO NOV 8"],
      ["Loaded egg and potato hash", "610 cal · 56 g", null],
      ["Steak and eggs", "525 cal · 58 g", null],
    ]);
    expect(m.meals[1].rows.slice(0, 3).map((r) => [r.name, r.sub])).toEqual([
      ["Burger bowl", "625 cal · 50 g · ground beef, once a week"],
      ["Chicken and rice bowl", "605 cal · 55 g"],
      ["Garlic butter shrimp and rice", "595 cal · 56 g"],
    ]);
    expect(m.meals[1].rows.find((r) => r.slug === "salmon-and-rice")!.resting).toBeNull();
    expect(m.meals[0].rows[0].to).toBe("/meal/banana-protein-pancakes?from=library");
  });

  it("lists the usual orders as the off-plan sheet does", () => {
    expect(m.usuals).toEqual([
      { key: "u1", name: "Chipotle bowl, double chicken", sub: "1,050 cal · 75 g · relaxed" },
      { key: "u2", name: "Ranch Water", sub: "100 cal · drink" },
    ]);
  });

  it("splits each body part into the plan's lifts and its swaps, Chest open", () => {
    expect(m.exercises.map((s) => [s.label, s.note, s.open, s.rows.length, s.swaps.length])).toEqual([
      ["Chest", "4 in plan · 8 swaps", true, 4, 8],
      ["Back", "3 in plan · 3 swaps", false, 3, 3],
      ["Shoulders", "4 in plan · 5 swaps", false, 4, 5],
      ["Arms", "6 in plan · 8 swaps", false, 6, 8],
      ["Legs", "4 in plan · 4 swaps", false, 4, 4],
    ]);
    expect(m.exercises[0].rows.map((r) => [r.name, r.sub, r.best])).toEqual([
      ["Cable fly, low to high", "Cable · Friday", null],
      ["Flat dumbbell press", "Dumbbells · Friday", null],
      ["Incline dumbbell press", "Dumbbells · Monday", "55 × 9"],
      ["Pec deck", "Machine · Monday", null],
    ]);
    expect(m.exercises[0].rows[2]).toMatchObject({ image: "/media/exercises/Incline_Dumbbell_Press/0.jpg", to: "/lift/incline-dumbbell-press?from=library" });
    expect(m.exercises[0].swapsLine).toBe(
      "Swaps: barbell bench press, cable crossover, dumbbell fly, machine chest press, machine incline press, push-ups, smith machine bench press, smith machine incline press",
    );
    expect(m.exercises[1].rows.find((r) => r.id === "pull-up")!.sub).toBe("Body weight · The extra");
    expect(m.exercises[2].rows.find((r) => r.id === "cable-lateral-raise")!.sub).toBe("Cable · Wednesday and the extra");
  });

  it("searches by name, opening every section with a match", () => {
    const curl = buildLibrary(rows, WED, true, "  CURL ");
    expect(curl.meals).toEqual([]);
    expect(curl.exercises.map((s) => [s.label, s.open, s.swapsOpen, s.rows.map((r) => r.name), s.swaps.map((r) => r.name)])).toEqual([
      ["Arms", true, true, ["Hammer curl", "Incline dumbbell curl", "Preacher curl"], ["Alternating dumbbell curl", "Cable rope hammer curl", "Dumbbell curl", "Machine preacher curl"]],
      ["Legs", true, true, ["Lying leg curl"], ["Seated leg curl"]],
    ]);
    const steak = buildLibrary(rows, WED, true, "steak");
    expect(steak.meals.map((s) => [s.id, s.open, s.limit, s.rows.map((r) => r.name)])).toEqual([
      ["breakfast", true, null, ["Steak and eggs"]],
      ["main", true, null, ["Steak and baked potato", "Steak and egg rice bowl"]],
      ["weekend", true, null, ["Steak salad"]],
    ]);
    expect(steak.usuals).toEqual([]);
  });

  it("without a plan: recipe grams, no meal links, and plain exercise lists", () => {
    const c = buildLibrary(rowsOf({}), WED, false);
    expect(c.meals[0].rows[0]).toEqual({ slug: "banana-protein-pancakes", name: "Banana protein pancakes", sub: "575 cal · 60 g", resting: null, to: null });
    expect(c.exercises.map((s) => [s.label, s.note, s.rows.length, s.swaps.length, s.swapsLine])).toEqual([
      ["Chest", "12", 12, 0, null],
      ["Back", "6", 6, 0, null],
      ["Shoulders", "9", 9, 0, null],
      ["Arms", "14", 14, 0, null],
      ["Legs", "8", 8, 0, null],
    ]);
    expect(c.exercises[0].rows[0].sub).toBe("Barbell");
  });
});
```

- [ ] **Step 2: Run it to make sure it fails.**

```bash
npx vitest run --project unit tests/unit/library/model.test.ts
```

Expected: FAIL. `~/library/model` doesn't exist yet.

- [ ] **Step 3: Write the model.** Create `app/library/model.ts`:

```ts
// Everything the Library shows, from the phone's copy. Pure: the browser and the unit tests both run it.
import { BODY_PARTS, exerciseImage, exercises, meals, type BodyPart, type MealWithMacros } from "~/content";
import { factorFor, scaledMeal } from "~/content/scaled";
import { mealDate } from "~/domain/dates";
import type { ISODate } from "~/domain/types";
import { targetsOn, type Rows } from "~/today/slots";
import { usualOrders, type UsualModel } from "~/today/usuals";
import { bestSets, EQUIPMENT, joinAnd, partOf, planLifts, TEMPLATE_DAY } from "~/lifts/model";

const MONTH = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
/** Lunch and dinner shows this many, then "Show all 8". */
export const MAINS_SHOWN = 3;

export type MealSectionId = "breakfast" | "main" | "snack" | "dessert" | "weekend";

export interface MealRow {
  slug: string;
  name: string;
  /** "525 cal · 58 g", plus "· ground beef, once a week" on a ground-beef meal. */
  sub: string;
  /** "RESTING TO NOV 8" */
  resting: string | null;
  /** The meal screen, or null without a plan (it is a plan-only screen). */
  to: string | null;
}

export interface MealSection {
  id: MealSectionId;
  label: string;
  rows: MealRow[];
  /** Collapsed sections open in place. Breakfast and lunch and dinner start open. */
  open: boolean;
  /** Rows shown before "Show all", or null for all of them. */
  limit: number | null;
}

export interface ExerciseRow {
  id: string;
  name: string;
  image: string;
  /** "Dumbbells · Monday" in the plan, the equipment otherwise. */
  sub: string;
  /** "55 × 9", or null with no history. */
  best: string | null;
  to: string;
}

export interface ExerciseSection {
  part: BodyPart;
  /** "Chest" */
  label: string;
  /** "4 in plan · 8 swaps", or the count without a plan. */
  note: string;
  open: boolean;
  /** Every row without a plan. */
  rows: ExerciseRow[];
  swaps: ExerciseRow[];
  /** "Swaps: barbell bench press, cable crossover, ..." Null without a plan or with no swaps. */
  swapsLine: string | null;
  /** Searching shows the swap rows without the tap. */
  swapsOpen: boolean;
}

export interface LibraryModel {
  mealCount: number;
  exerciseCount: number;
  meals: MealSection[];
  usuals: UsualModel[];
  exercises: ExerciseSection[];
}

const MEAL_SECTIONS: { id: MealSectionId; label: string; open: boolean; limit: number | null; has: (m: MealWithMacros) => boolean }[] = [
  { id: "breakfast", label: "Breakfast", open: true, limit: null, has: (m) => m.pool === "breakfast" },
  { id: "main", label: "Lunch and dinner", open: true, limit: MAINS_SHOWN, has: (m) => m.pool === "main" && m.mode === "any" },
  { id: "snack", label: "Snacks", open: false, limit: null, has: (m) => m.pool === "snack" },
  { id: "dessert", label: "Desserts", open: false, limit: null, has: (m) => m.pool === "dessert" },
  { id: "weekend", label: "Weekend only", open: false, limit: null, has: (m) => m.pool === "main" && m.mode === "weekend" },
];

const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name);
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const upperFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function mealRows(rows: Rows, today: ISODate, hasPlan: boolean): Map<string, MealRow> {
  const factor = hasPlan ? factorFor(targetsOn(rows, today).kcal) : null;
  const resting = new Map(
    rows("meal_state")
      .filter((r) => typeof r.rested_until === "string" && (r.rested_until as string) >= today)
      .map((r) => [r.slug as string, r.rested_until as ISODate]),
  );
  return new Map(
    [...meals.values()].map((raw) => {
      // Without a plan there is no target, so the recipe's own grams.
      const m = factor === null ? raw : scaledMeal(raw, factor);
      const until = resting.get(m.slug);
      return [
        m.slug,
        {
          slug: m.slug,
          name: m.name,
          sub: `${m.kcal} cal · ${m.protein} g${m.tags.includes("ground-beef") ? " · ground beef, once a week" : ""}`,
          resting: until ? `RESTING TO ${MONTH[Number(until.slice(5, 7)) - 1]} ${Number(until.slice(8, 10))}` : null,
          to: hasPlan ? `/meal/${m.slug}?from=library` : null,
        },
      ];
    }),
  );
}

export function buildLibrary(rows: Rows, now: Date, hasPlan: boolean, query = ""): LibraryModel {
  const today = mealDate(now);
  const q = query.trim().toLowerCase();
  const hit = (name: string) => name.toLowerCase().includes(q);
  const searching = q.length > 0;

  const mealsBySlug = mealRows(rows, today, hasPlan);
  const mealSections = MEAL_SECTIONS.map((s) => ({
    id: s.id,
    label: s.label,
    rows: [...meals.values()]
      .filter(s.has)
      .map((m) => mealsBySlug.get(m.slug)!)
      .filter((r) => hit(r.name))
      .sort(byName),
    open: searching || s.open,
    limit: searching ? null : s.limit,
  })).filter((s) => s.rows.length > 0);

  const inPlan = hasPlan ? planLifts(rows) : null;
  const best = bestSets(rows);
  const row = (id: string): ExerciseRow => {
    const ex = exercises.get(id)!;
    const plan = inPlan?.get(id);
    return {
      id,
      name: ex.name,
      image: exerciseImage(ex, 0),
      sub: plan ? `${EQUIPMENT[ex.equipment]} · ${upperFirst(joinAnd(plan.templates.map((t) => TEMPLATE_DAY[t].long)))}` : EQUIPMENT[ex.equipment],
      best: best.get(id) ?? null,
      to: `/lift/${id}?from=library`,
    };
  };
  const exerciseSections = BODY_PARTS.map(({ id: part, label }): ExerciseSection => {
    const all = [...exercises.values()].filter((e) => partOf(e) === part).sort(byName);
    const shown = all.filter((e) => hit(e.name));
    const planned = inPlan ? shown.filter((e) => inPlan.has(e.id)).map((e) => row(e.id)) : shown.map((e) => row(e.id));
    const swaps = inPlan ? shown.filter((e) => !inPlan.has(e.id)).map((e) => row(e.id)) : [];
    const plannedAll = inPlan ? all.filter((e) => inPlan.has(e.id)).length : all.length;
    const swapsAll = all.length - plannedAll;
    return {
      part,
      label,
      note: inPlan ? `${plannedAll} in plan · ${swapsAll} swap${swapsAll === 1 ? "" : "s"}` : String(all.length),
      open: searching || part === "chest",
      rows: planned,
      swaps,
      swapsLine: swaps.length ? `Swaps: ${swaps.map((s) => lowerFirst(s.name)).join(", ")}` : null,
      swapsOpen: searching,
    };
  }).filter((s) => s.rows.length + s.swaps.length > 0);

  return {
    mealCount: meals.size,
    exerciseCount: exercises.size,
    meals: mealSections,
    usuals: usualOrders(rows("usual_orders")).filter((u) => hit(u.name)),
    exercises: exerciseSections,
  };
}
```

- [ ] **Step 4: Run the test.** Same command as Step 2. Expected: PASS, 6 tests.

- [ ] **Step 5: Commit.**

```bash
git add app/library/model.ts tests/unit/library/model.test.ts
git commit -m "The Library model: meals at today's grams, usual orders, exercises by body part, search"
```

---

### Task 5: All lifts and the lift page

**Files:**
- Modify: `app/routes.ts`, `app/workout/model.ts`, `app/routes/workout.tsx`
- Create: `app/lifts/LiftsScreen.tsx`, `app/lifts/LiftScreen.tsx`, `app/routes/progress.lifts.tsx`, `app/routes/lift.tsx`
- Test: `tests/unit/workout/model.test.ts`, `tests/workers/no-plan.test.ts`

- [ ] **Step 1: Write the failing test for the workout's back button.** In `tests/unit/workout/model.test.ts`, add `workoutBack` to the `~/workout/model` import, and add at the end of the file:

```ts
describe("workoutBack", () => {
  it("goes back to the lift page that opened the workout, or to the screen named by from", () => {
    expect(workoutBack(null, "/lift/pec-deck?from=progress")).toBe("/lift/pec-deck?from=progress");
    expect(workoutBack("plan", null)).toBe("/plan");
    expect(workoutBack("progress", "https://example.com/")).toBe("/progress");
    expect(workoutBack(null, "/lift/pec-deck?from=elsewhere")).toBe("/");
  });
});
```

- [ ] **Step 2: Run it to make sure it fails.**

```bash
npx vitest run --project unit tests/unit/workout/model.test.ts
```

Expected: the new test FAILS, "workoutBack is not a function". The others pass.

- [ ] **Step 3: `workoutBack`.** Append to `app/workout/model.ts`:

```ts
const BACK: Record<string, string> = { today: "/", plan: "/plan", progress: "/progress" };

/** Where the workout's back button goes: the lift page that opened it, else the screen named by `from`. */
export function workoutBack(from: string | null, back: string | null): string {
  if (back && /^\/lift\/[a-z0-9-]+\?from=(library|progress)$/.test(back)) return back;
  return BACK[from ?? ""] ?? "/";
}
```

In `app/routes/workout.tsx`:
1. Change `import { buildWorkout } from "~/workout/model";` to `import { buildWorkout, workoutBack } from "~/workout/model";`.
2. Delete the line `const BACK: Record<string, string> = { today: "/", plan: "/plan", progress: "/progress" };`.
3. Replace `const back = BACK[params.get("from") ?? ""] ?? "/";` with `const back = workoutBack(params.get("from"), params.get("back"));`.

- [ ] **Step 4: Run it.** Same command as Step 2. Expected: PASS.

- [ ] **Step 5: Pin who can open the new paths.** In `tests/workers/no-plan.test.ts`, add `"/progress/lifts"` to the list in "sends plan-only screens back to Today", and `"/lift/pec-deck"` to the list in "lets Today, Library and Settings open".

```bash
npx vitest run --project workers tests/workers/no-plan.test.ts
```

Expected: PASS as written. The layout's `PLAN_ONLY` already matches `progress/` and not `lift`; this pins it before P4e moves the rule.

- [ ] **Step 6: The routes.** In `app/routes.ts`, inside the layout, add the two lines after `route("progress", "routes/progress.tsx"),`:

```ts
    route("progress/lifts", "routes/progress.lifts.tsx"),
    route("lift/:id", "routes/lift.tsx"),
```

- [ ] **Step 7: All lifts.** Create `app/lifts/LiftsScreen.tsx`:

```tsx
import { Link } from "react-router";
import { HeaderIcon } from "~/ui/GymFrame";
import { SectionHead } from "~/ui/SectionHead";
import { Sparkline } from "~/ui/Sparkline";
import type { LiftsModel } from "./model";

/** Option 6A: every lift by body part, with its best set, the last 4 sessions and the gain. */
export function LiftsScreen({ m }: { m: LiftsModel }) {
  return (
    <main className="mx-auto flex w-full max-w-[560px] flex-col gap-7 px-5 pb-12 pt-[max(20px,env(safe-area-inset-top))]">
      <header className="flex items-center gap-3">
        <HeaderIcon to="/progress" label="Back to Progress" icon="back" />
        <span className="font-num text-[16px] font-bold tracking-[0.02em]">PROGRESS</span>
      </header>
      <section className="flex flex-col gap-2">
        <h1 className="font-display text-[48px] uppercase leading-none">{m.title}</h1>
        <p className="font-num text-[18px] font-semibold text-ink-3">{m.meta}</p>
      </section>
      {m.sections.map((s) => (
        <section key={s.part} aria-labelledby={`part-${s.part}`} className="flex flex-col">
          <SectionHead id={`part-${s.part}`} note={String(s.rows.length)}>
            {s.label}
          </SectionHead>
          <ul className="flex flex-col">
            {s.rows.map((r) => (
              <li key={r.id}>
                <Link to={`/lift/${r.id}?from=progress`} className="flex min-h-[60px] items-center gap-3 border-b border-rule py-2">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-[16px] font-semibold">{r.name}</span>
                    <span className="text-[13px] text-ink-3">{r.sub}</span>
                  </span>
                  <Sparkline values={r.spark} />
                  <span className="tabular w-[54px] flex-none text-right font-num text-[16px] font-bold">
                    <span className="sr-only">Gain </span>
                    {r.gain}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
```

and `app/routes/progress.lifts.tsx`:

```tsx
import { useMemo } from "react";
import { pageTitle } from "~/brand";
import { LiftsScreen } from "~/lifts/LiftsScreen";
import { buildLifts } from "~/lifts/model";
import { useStoreVersion, useSyncClient, useSyncStatus } from "~/sync/react";

export const handle = { hideTabBar: true };

export function meta() {
  return [{ title: pageTitle("All lifts") }];
}

export default function AllLifts() {
  const client = useSyncClient();
  const ready = useSyncStatus()?.ready ?? false;
  const version = useStoreVersion();
  const model = useMemo(() => (client && ready ? buildLifts((t) => client.store.rows(t)) : null), [client, ready, version]);
  // The server and the first paint have no store yet. It loads from the phone in a few milliseconds.
  if (!model) return <main aria-busy="true" className="min-h-dvh" />;
  return <LiftsScreen m={model} />;
}
```

- [ ] **Step 8: The lift page.** Create `app/lifts/LiftScreen.tsx`:

```tsx
import { Link } from "react-router";
import { Icon } from "~/components/ui";
import { GoUpTag } from "~/ui/GoUpTag";
import { HeaderIcon } from "~/ui/GymFrame";
import { SectionHead } from "~/ui/SectionHead";
import { monthDay, type LiftPage } from "./model";

/** Top weight per session, dated under the line. */
function SessionChart({ points, unit }: { points: LiftPage["chart"]; unit: string }) {
  const W = 350;
  const H = 96;
  const values = points.map((p) => p.value);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const x = (i: number) => (points.length === 1 ? W / 2 : 10 + (i * (W - 20)) / (points.length - 1));
  const y = (v: number) => (hi === lo ? H / 2 : H - 12 - ((v - lo) * (H - 28)) / (hi - lo));
  const first = points[0];
  const last = points.at(-1)!;
  return (
    <figure className="flex flex-col gap-1">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`Top ${unit === "reps" ? "reps" : "weight"} per session, ${first.value} on ${monthDay(first.date)} to ${last.value} on ${monthDay(last.date)}.`}>
        <line x1="0" x2={W} y1={H - 4} y2={H - 4} stroke="var(--rule)" />
        {points.length > 1 && (
          <polyline points={points.map((p, i) => `${x(i)},${y(p.value)}`).join(" ")} fill="none" stroke="var(--ink)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
        )}
        {points.map((p, i) => (
          <circle key={`${p.date}-${i}`} cx={x(i)} cy={y(p.value)} r={i === points.length - 1 ? 5 : 4} fill="var(--ink)" />
        ))}
      </svg>
      <figcaption className="flex justify-between font-num text-[13px] font-semibold text-ink-3">
        <span>{`${monthDay(first.date)} · ${first.value}`}</span>
        {points.length > 1 && <span className="font-bold text-ink">{`${monthDay(last.date)} · ${last.value}`}</span>}
      </figcaption>
    </figure>
  );
}

/** Option 7A: one lift's page, from the Library or All lifts. */
export function LiftScreen({ p }: { p: LiftPage }) {
  return (
    <main className="mx-auto flex w-full max-w-[560px] flex-col gap-6 px-5 pb-12 pt-[max(20px,env(safe-area-inset-top))]">
      <header className="flex items-center gap-3">
        <HeaderIcon to={p.back.to} label={p.back.label} icon="back" />
        <span className="truncate font-num text-[16px] font-bold tracking-[0.02em]">{p.header}</span>
      </header>
      <section className="flex flex-col gap-2">
        <h1 className="font-display text-[48px] uppercase leading-none [overflow-wrap:anywhere]">{p.title}</h1>
        <p className="font-num text-[18px] font-semibold text-ink-3">{p.meta}</p>
      </section>
      <div className="grid grid-cols-2 gap-2">
        {p.images.map((src, i) => (
          <figure key={src} className="flex flex-col gap-1">
            <img src={src} alt="" loading="lazy" className="aspect-[4/3] w-full rounded-[6px] bg-well object-cover" />
            <figcaption className="text-[13px] text-ink-3">{i === 0 ? "Start" : "Finish"}</figcaption>
          </figure>
        ))}
      </div>

      {p.best ? (
        <>
          <section aria-label="Best set" className="flex items-end justify-between gap-3 border-t-2 border-ink pt-3">
            <span className="flex flex-col gap-1">
              <span className="text-[14px] font-semibold text-ink-3">Best set</span>
              <span className="tabular font-num text-[34px] font-bold leading-none">
                {p.best.text}
                <span className="ml-1 text-[18px] font-semibold text-ink-3">{p.best.unit}</span>
              </span>
            </span>
            <span className="flex flex-col items-end gap-1.5">
              {p.best.goUp && <GoUpTag />}
              <span className="font-num text-[15px] font-semibold text-ink-3">{p.best.change}</span>
            </span>
          </section>
          <SessionChart points={p.chart} unit={p.best.unit} />
          <section aria-labelledby="history" className="flex flex-col">
            <SectionHead id="history">History</SectionHead>
            <ul className="flex flex-col">
              {p.history.map((h, i) => {
                const body = (
                  <>
                    <span className="w-16 flex-none font-num text-[15px] font-bold text-ink-3">{h.label}</span>
                    <span className="tabular flex-1 font-num text-[19px] font-bold">{h.sets}</span>
                    {h.next && <span className="text-[14px] text-ink-3">{h.next}</span>}
                    {h.goUp && <GoUpTag />}
                  </>
                );
                const cls = "flex min-h-[52px] items-center gap-3 border-b border-rule";
                return <li key={`${h.date}-${i}`}>{h.to ? <Link to={h.to} className={cls}>{body}</Link> : <div className={cls}>{body}</div>}</li>;
              })}
            </ul>
          </section>
        </>
      ) : (
        <p className="border-t-2 border-ink pt-3 text-[16px] text-ink-2">No sets logged yet.</p>
      )}

      {p.swaps.length > 0 && (
        <section aria-labelledby="swaps" className="flex flex-col">
          <SectionHead id="swaps" note={p.swapsNote}>
            Swaps
          </SectionHead>
          <ul className="flex flex-col">
            {p.swaps.map((s) => (
              <li key={s.id}>
                <Link to={s.to} className="flex min-h-[58px] items-center gap-3 border-b border-rule py-2">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-[16px] font-semibold">{s.name}</span>
                    <span className="text-[13px] text-ink-3">{s.equipment}</span>
                  </span>
                  <span className="text-ink-3">
                    <Icon name="chevron" size={16} strokeWidth={2.4} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
```

and `app/routes/lift.tsx`:

```tsx
import { useMemo } from "react";
import { Link, useRouteLoaderData, useSearchParams } from "react-router";
import { pageTitle } from "~/brand";
import { exercises } from "~/content";
import { mealDate } from "~/domain/dates";
import { useNow } from "~/lib/use-now";
import { LiftScreen } from "~/lifts/LiftScreen";
import { buildLift } from "~/lifts/model";
import { useStoreVersion, useSyncClient, useSyncStatus } from "~/sync/react";
import { btn } from "~/ui/button";
import { Poster } from "~/ui/Poster";
import type { Route } from "./+types/lift";
import type { loader as layoutLoader } from "./app-layout";

export const handle = { hideTabBar: true };

export function meta({ params }: Route.MetaArgs) {
  return [{ title: pageTitle(exercises.get(params.id)?.name ?? "Lift") }];
}

/** One lift's page. It works without a plan, so the Library's exercise rows open it for everyone. */
export default function Lift({ params }: Route.ComponentProps) {
  const layout = useRouteLoaderData<typeof layoutLoader>("routes/app-layout");
  const client = useSyncClient();
  const ready = useSyncStatus()?.ready ?? false;
  const version = useStoreVersion();
  const [search] = useSearchParams();
  const minute = Math.floor(useNow(60_000).getTime() / 60_000);
  const from = search.get("from") === "progress" ? "progress" : "library";
  const model = useMemo(
    () => (client && ready && layout ? buildLift((t) => client.store.rows(t), mealDate(new Date(minute * 60_000)), params.id, from, layout.hasPlan) : null),
    [client, ready, layout, version, minute, params.id, from],
  );
  // The server and the first paint have no store yet. It loads from the phone in a few milliseconds.
  if (!client || !ready || !layout) return <main aria-busy="true" className="min-h-dvh" />;
  if (!model) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-[560px] flex-col justify-center gap-6 px-5">
        <Poster lines={["Not in", "the library."]} meta="That exercise may have been renamed or removed." />
        <Link to="/library?tab=exercises" className={`${btn.outline} h-14 text-[17px]`}>
          Back to Library
        </Link>
      </main>
    );
  }
  return <LiftScreen p={model} />;
}
```

- [ ] **Step 9: Typecheck.**

```bash
npm run typecheck
```

Expected: no errors. Typegen writes `./+types/lift` from the new route.

- [ ] **Step 10: Look.** With `npm run dev` running, open `/progress/lifts`: "ALL 21 LIFTS." (more if a lift outside the plan has sets), five body parts in order, rows with "Best ... · Mon" sublines, sparklines and gains. Tap a lift: its page shows "ALL LIFTS · <PART>", the photos, the best set, the chart and HISTORY. Tap a session: the workout opens on that day, and its back button returns to the lift page. Tap a swap: that lift's page opens, still from All lifts. Open `/lift/pec-deck?from=library`: the header reads "LIBRARY · CHEST" and back goes to the Library's exercises.

- [ ] **Step 11: Commit.**

```bash
git add app/routes.ts app/workout/model.ts app/routes/workout.tsx app/lifts/LiftsScreen.tsx app/lifts/LiftScreen.tsx app/routes/progress.lifts.tsx app/routes/lift.tsx tests/unit/workout/model.test.ts tests/workers/no-plan.test.ts
git commit -m "All lifts by body part, and one page per lift with its best set, history and swaps"
```

---

### Task 6: Progress on the phone, and its server code goes

**Files:**
- Create: `app/progress/ProgressScreen.tsx`, `app/progress/WeighInsSheet.tsx`
- Modify: `app/routes/progress.tsx` (full rewrite), `tests/workers/workout-readers.test.ts`
- Delete: `app/server/progress.server.ts`, `app/components/WeighInSheet.tsx`, `app/components/WeightChart.tsx`, `tests/workers/progress.test.ts`, `tests/workers/progress-route.test.ts`

- [ ] **Step 1: "Fix a weigh-in".** Create `app/progress/WeighInsSheet.tsx`:

```tsx
import { useState } from "react";
import { Sheet } from "~/components/Sheet";
import { Icon } from "~/components/ui";
import type { ISODate } from "~/domain/types";
import { useMutate } from "~/sync/react";
import { btn } from "~/ui/button";

const DAY = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
const dayLabel = (d: ISODate) => DAY.format(new Date(`${d}T12:00:00Z`));

type WeighIn = { date: ISODate; weight: number };

/** "Fix a weigh-in": the last 10, newest first. A tap opens one to change or delete, as named changes. */
export function WeighInsSheet({ weighIns, onClose }: { weighIns: WeighIn[]; onClose: () => void }) {
  const mutate = useMutate();
  const [editing, setEditing] = useState<WeighIn | null>(null);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  function open(w: WeighIn) {
    setEditing(w);
    setValue(w.weight.toFixed(1));
    setError(null);
  }

  async function save(date: ISODate) {
    const weightLb = Number(value);
    if (!Number.isFinite(weightLb) || weightLb < 80 || weightLb > 500) return setError("Enter your weight in pounds.");
    if (await mutate("editWeighIn", { date, weightLb })) setEditing(null);
  }

  async function remove(date: ISODate) {
    if (await mutate("deleteWeighIn", { date })) setEditing(null);
  }

  return (
    <Sheet open onClose={onClose} title={editing ? dayLabel(editing.date) : "Fix a weigh-in"}>
      {editing ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save(editing.date);
          }}
          className="flex flex-col gap-3"
        >
          <label className="flex flex-col gap-1.5">
            <span className="text-[14px] font-semibold text-ink-3">Weight</span>
            <span className="flex h-14 items-center gap-2 rounded-[6px] border-[1.5px] border-border bg-field px-3.5">
              <input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                inputMode="decimal"
                autoFocus
                className="tabular min-w-0 flex-1 bg-transparent font-num text-[22px] font-bold outline-none"
              />
              <span className="font-num text-[18px] font-semibold text-ink-3">lb</span>
            </span>
          </label>
          {error && <p className="text-[15px] font-semibold">{error}</p>}
          <div className="flex gap-2.5">
            <button type="button" onClick={() => void remove(editing.date)} className={`${btn.outline} h-14 px-5 text-[16px]`}>
              Delete
            </button>
            <button type="submit" className={`${btn.primary} h-14 flex-1`}>
              Save
            </button>
          </div>
          <button type="button" onClick={() => setEditing(null)} className={btn.quiet}>
            Back to the list
          </button>
        </form>
      ) : (
        <ul className="flex flex-col border-t border-rule">
          {weighIns.map((w) => (
            <li key={w.date}>
              <button type="button" onClick={() => open(w)} className="flex min-h-[52px] w-full items-center justify-between gap-3 border-b border-rule text-left">
                <span className="text-[16px]">{dayLabel(w.date)}</span>
                <span className="tabular flex items-center gap-1.5 font-num text-[18px] font-bold">
                  {w.weight.toFixed(1)} lb
                  <span className="text-ink-3">
                    <Icon name="chevron" size={16} strokeWidth={2.4} />
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}
```

- [ ] **Step 2: The screen.** Create `app/progress/ProgressScreen.tsx`:

```tsx
import { useState } from "react";
import { Link } from "react-router";
import { btn } from "~/ui/button";
import { JoinedChoice } from "~/ui/JoinedChoice";
import { Poster } from "~/ui/Poster";
import { SectionHead } from "~/ui/SectionHead";
import { StatGrid } from "~/ui/StatGrid";
import { TrendChart } from "~/ui/TrendChart";
import type { ProgressModel, Range } from "./model";
import { WeighInsSheet } from "./WeighInsSheet";

const RANGES: { value: Range; label: string }[] = [
  { value: "4w", label: "4W" },
  { value: "phase", label: "PHASE" },
  { value: "all", label: "ALL" },
];

/** Mock `Progress`, on the phone's copy. */
export function ProgressScreen({ m, range, onRange }: { m: ProgressModel; range: Range; onRange: (r: Range) => void }) {
  const [fixing, setFixing] = useState(false);
  const { labels } = m.chart;
  return (
    <main className="mx-auto flex w-full max-w-[560px] flex-col gap-7 px-5 pb-8 pt-[max(20px,env(safe-area-inset-top))]">
      <Poster lines={m.poster} meta={m.meta} />

      <section aria-labelledby="weight" className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between gap-3">
          <h2 id="weight" className="font-display text-[28px] uppercase">
            Weight
          </h2>
          <div className="w-[200px]">
            <JoinedChoice label="Range" choices={RANGES} value={range} onPick={onRange} height="h-11" />
          </div>
        </div>
        <TrendChart
          points={m.chart.points}
          goal={m.chart.goal}
          projection={m.chart.projection}
          label={`Weight. ${labels.start}. ${labels.today}.${labels.end ? ` Goal ${labels.end}.` : ""}`}
        />
        <div className="flex justify-between gap-2 font-num text-[14px] font-semibold text-ink-3">
          <span>{labels.start}</span>
          <span className="font-bold text-ink">{labels.today}</span>
          {labels.end && <span>{labels.end}</span>}
        </div>
        <p className="text-[15px] leading-[1.45] text-ink-2">{m.note}</p>
        {m.weighIns.length > 0 && (
          <button type="button" onClick={() => setFixing(true)} className={btn.quiet}>
            Fix a weigh-in
          </button>
        )}
      </section>

      <StatGrid label="Body" columns={2} cells={m.body} />

      <section aria-labelledby="stronger" className="flex flex-col">
        {m.stronger.length > 0 && (
          <>
            <SectionHead id="stronger">Stronger</SectionHead>
            <ul className="flex flex-col">
              {m.stronger.map((s) => (
                <li key={s.id} className="flex min-h-[54px] items-center gap-3 border-b border-rule">
                  <span className="flex-1 text-[16px] font-semibold">{s.name}</span>
                  <span className="tabular font-num text-[18px] font-bold text-ink-3">
                    <span className="sr-only">from </span>
                    {s.from} <span aria-hidden="true">→</span>
                    <span className="sr-only"> to</span>
                  </span>
                  <span className="tabular w-16 text-right font-num text-[22px] font-bold">{s.to}</span>
                </li>
              ))}
            </ul>
          </>
        )}
        <Link to="/progress/lifts" className={btn.quiet}>
          {m.liftsLink}
        </Link>
      </section>

      <section aria-labelledby="showing-up" className="flex flex-col gap-3">
        <SectionHead id="showing-up">Showing up</SectionHead>
        <StatGrid label="Showing up" columns={3} cells={m.showingUp} ruled={false} />
        <p className="text-[15px] leading-[1.45] text-ink-2">{m.streakLine}</p>
      </section>

      {fixing && <WeighInsSheet weighIns={m.weighIns} onClose={() => setFixing(false)} />}
    </main>
  );
}
```

- [ ] **Step 3: The route.** Replace `app/routes/progress.tsx` with:

```tsx
import { useMemo, useState } from "react";
import { pageTitle } from "~/brand";
import { useNow } from "~/lib/use-now";
import { buildProgress, type Range } from "~/progress/model";
import { ProgressScreen } from "~/progress/ProgressScreen";
import { useStoreVersion, useSyncClient, useSyncStatus } from "~/sync/react";

export function meta() {
  return [{ title: pageTitle("Progress") }];
}

/** No loader: Progress reads the phone's copy, like Today. */
export default function Progress() {
  const client = useSyncClient();
  const ready = useSyncStatus()?.ready ?? false;
  const version = useStoreVersion();
  const [range, setRange] = useState<Range>("phase");
  const minute = Math.floor(useNow(60_000).getTime() / 60_000);
  const model = useMemo(
    () => (client && ready ? buildProgress((t) => client.store.rows(t), new Date(minute * 60_000), range) : null),
    [client, ready, version, minute, range],
  );
  // The server and the first paint have no store yet. It loads from the phone in a few milliseconds.
  if (!model) return <main aria-busy="true" className="min-h-dvh" />;
  return <ProgressScreen m={model} range={range} onRange={setRange} />;
}
```

- [ ] **Step 4: The worker test that read v1 Progress keeps its counts.** Replace `tests/workers/workout-readers.test.ts` with:

```ts
import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { addDays, localDate } from "~/domain/dates";
import { datesWithWorkouts } from "~/server/history.server";
import { processPush } from "~/sync/push.server";
import { db } from "./helpers";

// The server's history counts keep reading workouts the new screens write.
const now = new Date();
const at = now.toISOString();
const day = (n: number) => addDays(localDate(now), -n);
const push = (clientId: string, mutations: { name: string; args: unknown }[]) => processPush(env.DB, { clientId, mutations: mutations.map((m, i) => ({ id: i + 1, ...m })) }, now);

describe("the server's counts see workouts made on the new screens", () => {
  it("counts Your own, checked off without numbers, on its day", async () => {
    const date = day(1);
    const res = await push("phone-1", [
      { name: "planWorkout", args: { clientId: "own-1", date, templateId: "custom", at } },
      { name: "setLifts", args: { workout: "own-1", lifts: [{ position: 100, exercise: "pull-up", repMin: 8, repMax: 12, from: "added" }] } },
      { name: "checkLift", args: { workout: "own-1", exercise: "pull-up", done: true } },
      { name: "finishWorkout", args: { workout: "own-1", at } },
    ]);
    expect(res.rejected).toEqual([]);
    expect(await datesWithWorkouts(db(), date, date)).toEqual(new Set([date]));
  });

  it("leaves a workout planned but never started out of the counts", async () => {
    const date = day(2);
    await push("phone-2", [{ name: "planWorkout", args: { clientId: "plan-only", date, templateId: "wed-legs-shoulders", at } }]);
    expect(await datesWithWorkouts(db(), date, date)).toEqual(new Set());
  });
});
```

- [ ] **Step 5: The v1 Progress code goes.**

```bash
git rm app/server/progress.server.ts app/components/WeighInSheet.tsx tests/workers/progress.test.ts tests/workers/progress-route.test.ts
rg -n "progress.server|progressData|nextPhotoDate|WeighInSheet\b|WeightChart" app tests
```

Expected from `rg`: only `app/progress/model.ts` (`nextPhotoDate`), `tests/unit/progress/model.test.ts`, and `app/components/WeightChart.tsx` itself. If nothing imports `WeightChart`, delete it too:

```bash
git rm app/components/WeightChart.tsx
```

If the check-in still imports it, keep it; P4f's cleanup takes it. The photo-date test moved to `tests/unit/progress/model.test.ts` in Task 3. The weigh-in edit and delete cases are covered by the `editWeighIn` and `deleteWeighIn` mutator tests in `tests/unit/sync/mutators.test.ts`.

- [ ] **Step 6: Run the touched tests and typecheck.**

```bash
npx vitest run --project unit tests/unit/progress/model.test.ts tests/unit/ui/trend-chart.test.ts
npx vitest run --project workers tests/workers/workout-readers.test.ts tests/workers/no-plan.test.ts
npm run typecheck
```

Expected: PASS, no type errors.

- [ ] **Step 7: Look.** With `npm run dev` running, open `/progress` at 390 px next to the `Progress` artboard: the poster and its meta, WEIGHT with the joined 4W / PHASE / ALL (PHASE picked), the chart with dots, the trend, the dashed pace line into the goal band on the right, the three labels under it, the note, and "Fix a weigh-in". Tap 4W and ALL: the chart redraws without the band. Tap "Fix a weigh-in", pick a day, change the weight and Save: the sheet returns to the list with the new number, and the chart moves. Then the Waist and Photos pair, STRONGER, the link to All lifts, and SHOWING UP with the streak line.

- [ ] **Step 8: Commit.**

```bash
git add app/progress/ProgressScreen.tsx app/progress/WeighInsSheet.tsx app/routes/progress.tsx tests/workers/workout-readers.test.ts
git commit -m "Progress reads the phone's copy: the trend against the goal, fix a weigh-in, stronger and showing up"
```

(`git rm` in Step 5 already staged the deletions.)

---

### Task 7: The Library on the phone

**Files:**
- Create: `app/library/LibraryScreen.tsx`
- Modify: `app/routes/library.tsx` (full rewrite)

- [ ] **Step 1: The screen.** Create `app/library/LibraryScreen.tsx`:

```tsx
import { useState, type ReactNode } from "react";
import { Link } from "react-router";
import { Icon } from "~/components/ui";
import type { ISODate } from "~/domain/types";
import { useMutate } from "~/sync/react";
import type { UsualModel } from "~/today/usuals";
import { btn } from "~/ui/button";
import { JoinedChoice } from "~/ui/JoinedChoice";
import { SectionHead } from "~/ui/SectionHead";
import type { ExerciseRow, ExerciseSection, LibraryModel, MealRow, MealSection } from "./model";

export type LibraryTab = "meals" | "exercises";

const toggled = (set: Set<string>, key: string) => {
  const next = new Set(set);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
};

/** A body part or meal section that opens in place: Anton 24 and a count with a chevron. */
function Fold({ label, sub, count, open, onToggle, children }: { label: string; sub?: string; count: string; open: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <div className="flex flex-col border-b border-rule">
      <button type="button" aria-expanded={open} onClick={onToggle} className="flex min-h-14 items-center justify-between gap-3 text-left">
        <span className="flex flex-col">
          <span className="font-display text-[24px] uppercase">{label}</span>
          {sub && <span className="text-[13px] text-ink-3">{sub}</span>}
        </span>
        <span className="flex items-center gap-1 font-num text-[15px] font-semibold text-ink-3">
          {count}
          <span className={open ? "rotate-90" : ""}>
            <Icon name="chevron" size={14} strokeWidth={2.4} />
          </span>
        </span>
      </button>
      {open && <ul className="flex flex-col">{children}</ul>}
    </div>
  );
}

function MealLine({ r }: { r: MealRow }) {
  const body = (
    <>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={`text-[16px] font-semibold ${r.resting ? "text-ink-3" : ""}`}>{r.name}</span>
        <span className="text-[13px] text-ink-3">{r.sub}</span>
      </span>
      {r.resting && <span className="flex-none whitespace-nowrap rounded-[3px] border-[1.5px] border-ink px-1.5 py-0.5 font-num text-[13px] font-bold">{r.resting}</span>}
    </>
  );
  const cls = "flex min-h-[58px] items-center gap-3 border-b border-rule py-2";
  return <li>{r.to ? <Link to={r.to} className={cls}>{body}</Link> : <div className={cls}>{body}</div>}</li>;
}

function UsualLine({ u, date }: { u: UsualModel; date: ISODate }) {
  const mutate = useMutate();
  const [logged, setLogged] = useState(false);
  async function log() {
    if (await mutate("logUsual", { clientId: crypto.randomUUID(), usual: u.key, date })) setLogged(true);
  }
  return (
    <li className="flex min-h-[60px] items-center gap-3 border-b border-rule py-2">
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[16px] font-semibold">{u.name}</span>
        <span className="text-[13px] text-ink-3">{u.sub}</span>
      </span>
      <button type="button" disabled={logged} onClick={() => void log()} className={`${btn.outline} h-11 px-4 text-[16px] disabled:border-border disabled:text-ink-3`}>
        {logged ? "Logged" : "Log"}
      </button>
    </li>
  );
}

function OpenMeals({ s }: { s: MealSection }) {
  const [all, setAll] = useState(false);
  const shown = s.limit !== null && !all ? s.rows.slice(0, s.limit) : s.rows;
  return (
    <section aria-labelledby={`meals-${s.id}`} className="flex flex-col">
      <SectionHead id={`meals-${s.id}`} note={String(s.rows.length)}>
        {s.label}
      </SectionHead>
      <ul className="flex flex-col">
        {shown.map((r) => (
          <MealLine key={r.slug} r={r} />
        ))}
      </ul>
      {shown.length < s.rows.length && (
        <button type="button" onClick={() => setAll(true)} className={btn.quiet}>
          Show all {s.rows.length}
        </button>
      )}
    </section>
  );
}

function Meals({ m, date, searching }: { m: LibraryModel; date: ISODate; searching: boolean }) {
  const [opened, setOpened] = useState<Set<string>>(new Set());
  const folded = m.meals.filter((s) => !s.open);
  return (
    <>
      {m.meals
        .filter((s) => s.open)
        .map((s) => (
          <OpenMeals key={s.id} s={s} />
        ))}
      {(folded.length > 0 || m.usuals.length > 0) && (
        <section aria-label="More meals" className="flex flex-col border-t-2 border-ink">
          {folded.map((s) => (
            <Fold key={s.id} label={s.label} count={String(s.rows.length)} open={opened.has(s.id)} onToggle={() => setOpened(toggled(opened, s.id))}>
              {s.rows.map((r) => (
                <MealLine key={r.slug} r={r} />
              ))}
            </Fold>
          ))}
          {m.usuals.length > 0 && (
            <Fold
              label="Saved off-plan"
              sub="Your usual orders, one tap to log"
              count={String(m.usuals.length)}
              open={searching || opened.has("usuals")}
              onToggle={() => setOpened(toggled(opened, "usuals"))}
            >
              {m.usuals.map((u) => (
                <UsualLine key={u.key} u={u} date={date} />
              ))}
            </Fold>
          )}
        </section>
      )}
    </>
  );
}

function ExerciseLine({ r }: { r: ExerciseRow }) {
  return (
    <li>
      <Link to={r.to} className="flex min-h-16 items-center gap-3 border-b border-rule py-2">
        <img src={r.image} alt="" loading="lazy" className="size-12 flex-none rounded-[4px] bg-well object-cover" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-[16px] font-semibold">{r.name}</span>
          <span className="text-[13px] text-ink-3">{r.sub}</span>
        </span>
        {r.best && (
          <span className="flex flex-none flex-col items-end">
            <span className="tabular font-num text-[17px] font-bold">{r.best}</span>
            <span className="text-[13px] text-ink-3">best set</span>
          </span>
        )}
      </Link>
    </li>
  );
}

function BodyPart({ s, open, onToggle }: { s: ExerciseSection; open: boolean; onToggle: () => void }) {
  const [swaps, setSwaps] = useState(false);
  return (
    <Fold label={s.label} count={s.note} open={open} onToggle={onToggle}>
      {s.rows.map((r) => (
        <ExerciseLine key={r.id} r={r} />
      ))}
      {s.swapsLine && !(swaps || s.swapsOpen) && (
        <li>
          <button type="button" aria-expanded={false} onClick={() => setSwaps(true)} className="flex min-h-[52px] w-full items-center border-b border-rule py-2 text-left text-[15px] text-ink-3">
            {s.swapsLine}
          </button>
        </li>
      )}
      {(swaps || s.swapsOpen) && s.swaps.map((r) => <ExerciseLine key={r.id} r={r} />)}
    </Fold>
  );
}

function Exercises({ m, searching }: { m: LibraryModel; searching: boolean }) {
  const [opened, setOpened] = useState<Set<string>>(() => new Set(m.exercises.filter((s) => s.open).map((s) => s.part)));
  return (
    <section aria-label="Exercises" className="flex flex-col border-t-2 border-ink">
      {m.exercises.map((s) => (
        <BodyPart key={s.part} s={s} open={searching || opened.has(s.part)} onToggle={() => setOpened(toggled(opened, s.part))} />
      ))}
    </section>
  );
}

/** Mocks `LibraryMeals` and `LibraryExercises`, on the phone's copy. */
export function LibraryScreen({
  m,
  tab,
  onTab,
  query,
  onQuery,
  date,
}: {
  m: LibraryModel;
  tab: LibraryTab;
  onTab: (t: LibraryTab) => void;
  query: string;
  onQuery: (q: string) => void;
  date: ISODate;
}) {
  const searching = query.trim() !== "";
  const nothing = tab === "meals" ? m.meals.length === 0 && m.usuals.length === 0 : m.exercises.length === 0;
  return (
    <main className="mx-auto flex w-full max-w-[560px] flex-col gap-[22px] px-5 pb-8 pt-[max(20px,env(safe-area-inset-top))]">
      <h1 className="font-display text-[64px] uppercase leading-[0.92]">Library.</h1>
      <div className="flex flex-col gap-3">
        <JoinedChoice
          label="Library"
          choices={[
            { value: "meals" as const, label: `Meals · ${m.mealCount}` },
            { value: "exercises" as const, label: `Exercises · ${m.exerciseCount}` },
          ]}
          value={tab}
          onPick={onTab}
          height="h-[46px]"
        />
        <label className="flex h-12 items-center gap-2.5 rounded-[6px] border-[1.5px] border-border bg-field px-3.5">
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="text-ink-3">
            <circle cx="11" cy="11" r="6.5" />
            <path d="M20 20l-4.2-4.2" />
          </svg>
          <span className="sr-only">{tab === "meals" ? "Search meals" : "Search exercises"}</span>
          <input
            type="search"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder={tab === "meals" ? "Search meals" : "Search exercises"}
            className="h-full min-w-0 flex-1 bg-transparent text-[17px] outline-none placeholder:text-muted"
          />
        </label>
      </div>
      {nothing ? (
        <p className="text-[16px] text-ink-3">Nothing matches "{query.trim()}".</p>
      ) : tab === "meals" ? (
        <Meals m={m} date={date} searching={searching} />
      ) : (
        <Exercises m={m} searching={searching} />
      )}
    </main>
  );
}
```

- [ ] **Step 2: The route.** Replace `app/routes/library.tsx` with:

```tsx
import { useMemo, useState } from "react";
import { useRouteLoaderData, useSearchParams } from "react-router";
import { pageTitle } from "~/brand";
import { mealDate } from "~/domain/dates";
import { LibraryScreen, type LibraryTab } from "~/library/LibraryScreen";
import { buildLibrary } from "~/library/model";
import { useNow } from "~/lib/use-now";
import { useStoreVersion, useSyncClient, useSyncStatus } from "~/sync/react";
import type { loader as layoutLoader } from "./app-layout";

export function meta() {
  return [{ title: pageTitle("Library") }];
}

/** No loader: the Library reads the phone's copy. It works for everyone, with a plan or without. */
export default function Library() {
  const layout = useRouteLoaderData<typeof layoutLoader>("routes/app-layout");
  const client = useSyncClient();
  const ready = useSyncStatus()?.ready ?? false;
  const version = useStoreVersion();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const minute = Math.floor(useNow(60_000).getTime() / 60_000);
  const tab: LibraryTab = params.get("tab") === "exercises" ? "exercises" : "meals";
  const model = useMemo(
    () => (client && ready && layout ? buildLibrary((t) => client.store.rows(t), new Date(minute * 60_000), layout.hasPlan, query) : null),
    [client, ready, layout, version, minute, query],
  );
  // The server and the first paint have no store yet. It loads from the phone in a few milliseconds.
  if (!model) return <main aria-busy="true" className="min-h-dvh" />;
  return (
    <LibraryScreen
      m={model}
      tab={tab}
      onTab={(t) => setParams(t === "meals" ? {} : { tab: t }, { replace: true, preventScrollReset: true })}
      query={query}
      onQuery={setQuery}
      date={mealDate(new Date(minute * 60_000))}
    />
  );
}
```

- [ ] **Step 3: Typecheck.**

```bash
npm run typecheck
rg -n "export (async )?function (loader|action)" app/routes/plan.tsx app/routes/groceries.tsx app/routes/progress.tsx app/routes/progress.lifts.tsx app/routes/lift.tsx app/routes/library.tsx
```

Expected: no type errors, and no hits from `rg`: none of P4's rebuilt screens has a loader or action left.

- [ ] **Step 4: Look.** With `npm run dev` running, open `/library` next to `LibraryMeals`: "LIBRARY.", the joined "Meals · 25 / Exercises · 49", the white search field, BREAKFAST 4 with a resting tag if a meal rests, LUNCH AND DINNER with 3 rows and "Show all 8", then the folded SNACKS 5, DESSERTS 5, WEEKEND ONLY 3 and SAVED OFF-PLAN. Open SAVED OFF-PLAN and tap Log on a usual: it turns to "Logged", and Today shows the entry. Switch to Exercises next to `LibraryExercises`: CHEST open with "4 in plan · 8 swaps", thumbnails, best sets, and the swaps line; tap it to show the swap rows. Type "curl": Arms and Legs open with only the curls. Tap a row: its lift page opens with "LIBRARY · ..." and back returns here.

- [ ] **Step 5: Commit.**

```bash
git add app/library/LibraryScreen.tsx app/routes/library.tsx
git commit -m "The Library reads the phone's copy: meals, usual orders with one-tap Log, and exercises by body part"
```

---

### Task 8: Look at every screen against the mocks

- [ ] **Step 1: Sign in locally** with a temporary password, as N2's Task 11 did. Save the hash, swap it, and put it back in Step 6:

```bash
npx wrangler d1 execute rocky-core --local --command "select password_hash from users where name_key = 'kameron'"
npx tsx -e 'import("./app/server/password.ts").then(async (m) => console.log(await m.hashPassword("local-look-check")))'
npx wrangler d1 execute rocky-core --local --command "update users set password_hash = '<hash printed above>' where name_key = 'kameron'"
```

- [ ] **Step 2: Compare at 390 x 844** with `npm run dev` running, side by side:
1. **`Progress`:** poster 64 to 68 px, the joined range control, the 190 px chart with grey dots, the 3 px ink trend and its 5 px end dot, the well-tinted goal band, the labels row with "Today ..." bold, the body pair under a 2 px ink rule, STRONGER rows at 54 px with the muted "250 →", SHOWING UP's three cells with 1 px dividers and no top rule.
2. **Option 6A:** the 58 x 22 sparklines with the ink end dot, gains right-aligned at 54 px.
3. **Option 7A:** the 48 px title, the two 4:3 photos with Start and Finish, the 34 px best set with "lb", the brass GO UP, HISTORY rows at 52 px, SWAPS with the note.
4. **`LibraryMeals` and `LibraryExercises`:** the 64 px "LIBRARY.", 46 px tabs, the 48 px field, 58 px meal rows, the ink-outlined resting tag, 64 px exercise rows with 48 px thumbnails, the folded sections at 56 px.
5. Red appears only on Save in "Fix a weigh-in", the active tab and the focus ring. Brass only on GO UP.
6. Run F3's contrast snippet on each screen. Expected: `all text passes`.

- [ ] **Step 3: Catherine.** Sign in as Catherine the same way (Step 1 with `name_key = 'catherine'`). `/progress` and `/progress/lifts` go to Today. `/library` opens: meals at recipe grams with no links, every exercise as a plain row under its body part, and a row opens its lift page with the meta "<Equipment> · <Part>" and "No sets logged yet."

- [ ] **Step 4: Offline.** In DevTools go offline and reload `/progress`, `/progress/lifts`, `/lift/pec-deck` and `/library`. Each opens from the phone's copy.

- [ ] **Step 5: Commit any fixes** from this task, with a message naming what was fixed.

- [ ] **Step 6: Put the passwords back.**

```bash
npx wrangler d1 execute rocky-core --local --command "update users set password_hash = '<saved hash>' where name_key = 'kameron'"
npx wrangler d1 execute rocky-core --local --command "update users set password_hash = '<Catherine's saved hash>' where name_key = 'catherine'"
```

---

### Task 9: Full suite, and ship

- [ ] **Step 1: Run the whole suite once.**

```bash
npm run typecheck && npm test
```

Expected: all green. Fix only the failing files, then re-run those files only.

- [ ] **Step 2: Push the branch and hand over the commit.**

```bash
git push origin v2/p4-checkin-plan-progress-library
git rev-parse HEAD
```

Report the sha to Kameron with the calls at the top of this plan, and wait for him to say ship. No migrations, no new secrets.

- [ ] **Step 3: Ship that commit.** Only after Kameron says so:

```bash
git push origin <sha>:main
gh api repos/kameronpduhon/rocky-the-coach/commits/<sha>/check-suites --jq '.check_suites[] | "\(.app.name) \(.status) \(.conclusion)"'
```

Expected within a few minutes: the Workers Builds suite `completed success`. If it sits `queued` for more than 6 minutes, tell Kameron; he runs `! npm run deploy`.

---

### Task 10: Verify on the wire

- [ ] **Step 1: The new Progress is live.** Find each route's chunk and its imports through the manifest linked from the login page, and grep them for strings only the new build has:

```bash
BASE=https://kampduh.com
MANIFEST=$(curl -s $BASE/login | grep -o '/assets/manifest-[A-Za-z0-9_-]*\.js' | head -1); echo "$MANIFEST"
chunks() { curl -s "$BASE$MANIFEST" | grep -o "\"routes/$1\":{[^}]*" | grep -o '/assets/[A-Za-z0-9_.-]*\.js' | sort -u | while read -r f; do curl -s "$BASE$f"; done; }
chunks progress | grep -oE "lifts, best sets and history|Fix a weigh-in|Tap to fix" | sort | uniq -c
```

Expected: "lifts, best sets and history" and "Fix a weigh-in" at least once each, and no "Tap to fix" (v1's weigh-in list). If the new strings are missing, the deploy hasn't landed: check Task 9 Step 3 again.

- [ ] **Step 2: The two new routes and the Library are live.**

```bash
chunks progress.lifts | grep -oE "Best set, and gain since" | sort | uniq -c
chunks lift | grep -oE "No sets logged yet" | sort | uniq -c
chunks library | grep -oE "Your usual orders, one tap to log|In the plan:" | sort | uniq -c
```

Expected: one line for each of the first three strings, and no "In the plan:" (v1's exercise subline). An empty result for `progress.lifts` or `lift` means the manifest has no such route yet: the old build is still serving.

- [ ] **Step 3: Report.** One or two sentences to Kameron: P4d is live, and P4e (`docs/superpowers/plans/2026-10-28-p4e-worker-endpoints.md`) is next.
