# P4c: Plan and Groceries Implementation Plan

> **For agentic workers:** implement this plan task-by-task with the `executing-plans` skill. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Plan and Groceries are rebuilt on the phone's copy, in the Corner look, and lose their server loaders and actions:
- **Groceries (option 5A).** The week's foods by aisle in store order, a 44 px check circle per food, "12 of 37" in the cart, checked rows that stay put and go muted. A tap runs `checkGrocery`. A future week the check-in links to is previewed at the check-in's rests and calories (`rest=`, `kcal=`).
- **Plan (mock `Plan`).** "Week 4 / of 13.", the 13-week strip with deload, maintenance and the checkpoint, the targets row with where each number came from, THE WEEK with one row per day, a day sheet for future days ("Move to another day", "Train this day"), and the groceries card.
- **The v1 code they leave behind goes:** the plan and groceries loaders and actions, `app/server/groceries.server.ts`, and next-week swaps (`encodeSwap`, `parseSwaps`, `swaps` in `previewWeek`), whose last reader was v1 groceries.

**Starts from P4b's result.** P4a (data, rules, named changes) and P4b (the one-page check-in) are merged and live, on top of N3. This plan uses their interfaces as the spec's Named changes table and domain section name them, with the signatures P4a's plan (`docs/superpowers/plans/2026-10-28-p4a-checkin-data.md`, "Interfaces other steps build on") gives:

| From | What this plan uses |
|---|---|
| P4a, Named changes | `checkGrocery { week, food, checked }`: puts or deletes `grocery_checks` (`week_start`, `food_id`). Its refusal label is "Grocery check" |
| P4a, Content | `plan.goal`: `{ date: "2027-01-01", low: 195, high: 198 }`, required by `PlanSchema` |
| P4a, `app/checkin/meals.ts` | `previewNextWeek(rows, monday, rest)`: the week after `monday` as Finish would write it. `mealRepeats(rows, monday)` and `defaultRests(repeats)`: the rest switches as the check-in opens (on at 4 or more) |
| P4a, Week plan | `/api/sync/pull` and the 5-minute cron run `ensureWeekPlan`, so this week's 35 `planned_meals` rows are on the phone |
| P4b, kit | `StatGrid` and `LinkCard` in `app/ui/` (spec section 3, "Shared kit"). Task 1 checks their props and creates either one if P4b didn't |
| P4b, check-in | The groceries link `/groceries?week=<next Monday>&from=check-in&kcal=<picked calories>&rest=<slug>...` |
| N3 | `targetsOn(rows, date)` in `app/today/slots.ts` with the check-ins' burns, so a maintenance week reads the burn |
| Already live | `moveWorkout`, `buildWorkout`, `resolveLifts`, `doneDates`, `weekSchedule`, `MoveSheet` |

**Architecture:**
- **Two pure models,** as `app/meal/model.ts` is: `app/groceries/model.ts` (`weekGroceries`) and `app/plan/model.ts` (`buildPlan`). They read the store through the `Rows` reader and are unit tested with plain rows.
- **The routes have no loader and no action.** Each reads the store through `useSyncClient`, `useSyncStatus` and `useStoreVersion`, like `/meal/:slug` and `/workout`, so both open with no signal and both are ready for P4f's SPA mode.
- **Every write is a named change:** `checkGrocery` on Groceries, `moveWorkout` from the day sheet.
- **Plan reuses the workout screen's reading.** Done, moved up and edited come from `buildWorkout`, so Plan and the workout screen never disagree.

**Tech Stack:** React Router 8.4 (framework mode, SSR still on), the F2 sync layer and P4a's mutators, Tailwind 4 with the Corner tokens, Vitest 4 (unit project for pure modules, workers project for D1).

**Spec:** `docs/superpowers/specs/2026-10-28-checkin-plan-progress-library-design.md`: section 3 "Groceries" and "Plan", calls 11, 12, 20, the edge cases table, rollout step 3, Testing ("The groceries model", "The Plan model", "On the wire"). **Branch:** `v2/p4-checkin-plan-progress-library`, worktree `/Users/kameron/Code/rocky-wt/p4`. **Previous:** P4b. **Next:** `docs/superpowers/plans/2026-10-28-p4d-progress-library.md`.

**Mocks:**
- Artboard `Plan` on https://claude.ai/artifact/65WeReuGH5ZageJng9K6nq.
- Option 5A (groceries by aisle) on the options board https://claude.ai/artifact/Ke3qgxSC3uQFwGKCJpsKSU, and band 8's Plan frame, which has the real counts.
- **Design system:** `docs/design/system.md`. Where it and a mock disagree on looks, the mock wins, except the colour rules. Real data wins over the mock's numbers: a real week has 37 grocery items, not 24, and Wednesday is 6 lifts, not "7 lifts, edited".

**There are no migrations in P4c.**

## Calls made in this plan (flag them when shipping)

- **Groceries' preview is the check-in's.** A future week with no rows is P4a's `previewNextWeek`, the function Finish writes with, so the list and the week that gets written agree. The spec's edge table says a future week with no params "previews with v1's default rests"; v1 rested anything eaten 3 or more times, and the check-in's switches now start on at 4 or more (`defaultRests`). The preview uses the check-in's.
- **A link with `kcal=` and no `rest=` means nothing rests.** The check-in's link always carries `kcal`, and lists only the switches that are on. With every switch off it has no `rest=`, which must not fall back to the defaults.
- **`kcal=` is used only for a future week that isn't planned yet,** and only between 1,200 and 4,000. A planned week always reads its own target.
- **A past or current week with no plan rows** is built from the rotation on the phone with no new rests, the way `ensureWeekPlan` would (`previewNextWeek` from the week before, with `rest` empty). P4a's pull makes this week's rows, so in practice this is a week before the app existed.
- **The Plan poster clamps the week** to 1 to 13: after Jan 3 it keeps reading "Week 13 / of 13." until a next phase exists.
- **THE WEEK rows the spec's table doesn't cover:**
    - **Today, a rest day with the extra:** the raised row, "Rest" and "Today · optional: arms and back extra, 35 min", tapping to `/workout`. Once done: "Today · arms and back extra · done" with the check.
    - **A weekday rest day with no extra** (a workout moved off it): "Rest", with "Workout moved" when a move made it a rest day. A future one opens the day sheet with "Train this day".
    - **A workout on a relaxed day** stays a workout row, so it can still be logged or moved. Relaxed wins over a rest day, the extra and Saturday. The plan's two relaxed days are Thanksgiving (a Thursday) and Christmas (a Friday, a workout day).
    - **Sunday wins over relaxed,** so the check-in link always shows.
- **The extra's minutes come from the workout screen's estimate:** 4 lifts x 2 sets is 35 min, and a deload week's single sets make it 20. The mock says 30.
- **Steps' subline can read "down 500"** when a check-in lowered the goal. The spec lists only "up", "same as last week" and "starting goal".
- **Past days are links to that day's workout** (`/workout?date=<day>&from=plan`): the Done screen for a done workout, the log for a missed one. Past rest days with the extra done link the same way.
- **The day sheet** shows the day's name as its title, the workout (or "Optional: arms and back extra"), the lifts as "2 × 8 to 12", then one outline button that opens the existing move sheet. `MoveSheet` loses its v1 `revalidate`, since nothing reads the server after this.
- **Section heads keep the design system's 28 px Anton**; the groceries mock draws its aisle heads at 24.

---

## Ground rules

- Everything from the earlier plans applies:
    - No em dashes in code, copy, comments, commits or docs. No emojis.
    - No `Co-Authored-By` lines in commits.
    - Names in copy come from `APP_NAME` and `COACH_NAME` in `app/brand.ts`, never a literal. (No copy in this plan names either.)
    - Look with `npm run dev`.
    - During tasks, run only the files named in the step, plus `npm run typecheck` where a step says so. One full `npm run typecheck && npm test` at the end (Task 8).
    - One commit per task. Stage by path (`git add <paths>`, `git rm <paths>`), never `git add -A` or `git add .`: other agents write plan files in this worktree.
    - Never switch branches.
    - Token colours only. Red only for the primary action and live state (today's row, this week's cell).
- `app/groceries/*`, `app/plan/*`, `app/ui/*`, `app/today/*` and `app/domain/*` must not import `cloudflare:workers` or any `*.server.ts`. They run in the browser.
- Store rows are raw D1 rows: snake_case, booleans `0`/`1`, JSON columns as strings.
- Unit test dates use Chicago daylight time (`-05:00`) and stay before November 1, 2026, except the tests that pass a later date on purpose (Thanksgiving week, the maintenance week, Sunday Nov 1). Those use times far from midnight and from the 5pm check-in window, so the hour's offset after Nov 1 changes neither the day nor the window.

## Files

| File | Responsibility |
|---|---|
| `app/ui/StatGrid.tsx`, `app/ui/LinkCard.tsx` | From P4b; created here only if P4b didn't (Task 1) |
| `app/components/ui.tsx` | The `cart` icon, if P4b didn't add it |
| `app/groceries/model.ts` (new) | `weekGroceries`: the week's foods by aisle at the week's grams, the preview, the checks |
| `app/groceries/GroceriesScreen.tsx` (new) | Option 5A |
| `app/routes/groceries.tsx` | Rewritten: no loader, no action |
| `app/plan/model.ts` (new) | `buildPlan`: poster, strip, targets, THE WEEK, the day sheets, the groceries count |
| `app/plan/PlanScreen.tsx`, `app/plan/DaySheet.tsx` (new) | Mock `Plan` and the day sheet |
| `app/routes/plan.tsx` | Rewritten: no loader, no action |
| `app/components/MoveSheet.tsx` | The v1 revalidate goes |
| `app/server/groceries.server.ts`, `tests/workers/groceries.test.ts` | Deleted |
| `app/server/checkin.server.ts` | v1's `mealRepeats` and `rotationMeals` go if nothing else reads them |
| `app/domain/next-week.ts` | `encodeSwap`, `parseSwaps` and `swaps` go; `previewWeek` too if nothing calls it |
| `tests/unit/groceries/model.test.ts`, `tests/unit/plan/model.test.ts` (new) | The two models |
| `tests/unit/domain/next-week.test.ts` | Swap tests go |

---

### Task 1: The kit pieces Plan and Groceries use

The spec's shared kit lists `StatGrid` ("Plan's targets row (3)") and `LinkCard` ("groceries on Plan and the check-in"). P4b builds both for the check-in. This task checks they are there with the props this plan and P4d call them with, and creates either one only if it is missing.

**Files:**
- Create if missing: `app/ui/StatGrid.tsx`, `app/ui/LinkCard.tsx`
- Modify if missing: `app/components/ui.tsx` (the `cart` icon)

- [ ] **Step 1: See what P4b left.**

```bash
cd /Users/kameron/Code/rocky-wt/p4 && git branch --show-current && ls app/ui/StatGrid.tsx app/ui/LinkCard.tsx; rg -n "export function (StatGrid|LinkCard)" app/ui; rg -n "^  cart:" app/components/ui.tsx
```

Expected: `v2/p4-checkin-plan-progress-library`, then whatever P4b made.

- [ ] **Step 2: `StatGrid`.** This plan calls it as `<StatGrid label="..." columns={3} cells={[{ label, value, sub }]} />`, and P4d adds `ruled={false}` for a grid under a section head and leaves `label` out of a cell.
    - **If `app/ui/StatGrid.tsx` exists:** read its props. If they match, change nothing. If P4b named them differently, keep P4b's component as it is and change this plan's two calls (Task 5's `PlanScreen`, and P4d's `ProgressScreen`) to P4b's names. If it lacks a way to leave the top rule off, add `ruled?: boolean` (default `true`) as below.
    - **If it doesn't exist,** create it:

```tsx
import type { ReactNode } from "react";

export interface Stat {
  label?: string;
  value: ReactNode;
  sub?: string | null;
}

/**
 * The ruled grid of label, big number and subline: the check-in's 2 x 2, Plan's targets, Progress's body pair and
 * showing-up row. `ruled` draws the 2 px ink rule on top, for a grid that has no section head over it.
 */
export function StatGrid({ label, cells, columns, ruled = true }: { label: string; cells: Stat[]; columns: 2 | 3; ruled?: boolean }) {
  return (
    <section
      aria-label={label}
      className={`grid border-b border-b-rule ${ruled ? "border-t-2 border-t-ink" : ""}`}
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {cells.map((c, i) => {
        const col = i % columns;
        return (
          <div
            key={i}
            className={`flex min-w-0 flex-col py-3 ${col === 0 ? "pr-2.5" : "pl-3 pr-2"} ${col < columns - 1 ? "border-r border-r-rule" : ""} ${i >= columns ? "border-t border-t-rule" : ""}`}
          >
            {c.label && <span className="text-[14px] font-semibold text-ink-3">{c.label}</span>}
            <span className="tabular font-num text-[28px] font-bold leading-tight">{c.value}</span>
            {c.sub && <span className="text-[13px] text-ink-3">{c.sub}</span>}
          </div>
        );
      })}
    </section>
  );
}
```

- [ ] **Step 3: `LinkCard`.** This plan calls it as `<LinkCard to="/groceries" icon="cart" title="This week's groceries" sub="34 of 37 checked off" />`. Same rule: keep P4b's if it exists and adapt Task 5's call to its props. Otherwise create `app/ui/LinkCard.tsx`:

```tsx
import { Link } from "react-router";
import { Icon } from "~/components/ui";

/** A 1.5 px ink outline card that goes somewhere: the groceries on Plan and the check-in. */
export function LinkCard({ to, icon, title, sub }: { to: string; icon: string; title: string; sub: string }) {
  return (
    <Link to={to} className="flex min-h-[60px] items-center gap-3 rounded-[6px] border-[1.5px] border-ink px-3.5 py-2.5">
      <Icon name={icon} size={22} strokeWidth={2} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[17px] font-bold">{title}</span>
        <span className="text-[14px] text-ink-3">{sub}</span>
      </span>
      <span className="text-ink-3">
        <Icon name="chevron" size={16} strokeWidth={2.4} />
      </span>
    </Link>
  );
}
```

- [ ] **Step 4: The cart icon.** If Step 1 found no `cart:` in `app/components/ui.tsx`, add this entry to `PATHS`, after `camera` (the path is the mock's):

```tsx
  cart: (
    <>
      <path d="M3 4h2l2.4 11h11l2-8H6.3" />
      <circle cx="9" cy="19.5" r="1.5" />
      <circle cx="17" cy="19.5" r="1.5" />
    </>
  ),
```

- [ ] **Step 5: Typecheck.**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 6: Commit,** only if a step created or changed a file. Stage only the files you touched:

```bash
git add app/ui/StatGrid.tsx app/ui/LinkCard.tsx app/components/ui.tsx
git commit -m "The stat grid, the link card and the cart icon, for Plan and Groceries"
```

---

### Task 2: The grocery list, read from the phone's copy

Every number below was worked out from the content: `scaledMeal` at the week's factor, summed over the week's slugs, then v1's `friendlyGrams` (over 200 g to the nearest 50, else to the nearest 5). The fixture week has the same five meals each day: steak and eggs, the chicken and rice bowl, Greek yogurt and berries, honey-glazed chicken thighs, and protein ice cream. That is 15 foods. A rotation week, which `previewNextWeek` builds, has 37.

**Files:**
- Create: `app/groceries/model.ts`
- Test: `tests/unit/groceries/model.test.ts`

- [ ] **Step 1: Write the failing test.** Create `tests/unit/groceries/model.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { addDays } from "~/domain/dates";
import { weekGroceries, type GroceriesModel } from "~/groceries/model";
import type { Row } from "~/sync/tables";

const MON = "2026-10-26";
const WED = "2026-10-28";
const NEXT = "2026-11-02";
const rowsOf = (t: Record<string, Row[]>) => (name: string) => t[name] ?? [];
const DAY = { breakfast: "steak-and-eggs", lunch: "chicken-and-rice-bowl", snack: "greek-yogurt-and-berries", dinner: "honey-glazed-chicken-thighs", dessert: "protein-ice-cream" };
const week = (monday: string): Row[] =>
  Array.from({ length: 7 }, (_, i) => addDays(monday, i)).flatMap((date) => Object.entries(DAY).map(([slot, meal_slug]) => ({ date, slot, meal_slug, swapped: 0 })));
// Sunday's check-in trimmed 100 cal a day from Monday Oct 26.
const trimmed: Row[] = [{ effective_from: MON, kcal: 2300, protein_g: 180, step_goal: 8500 }];
const item = (m: GroceriesModel, food: string) => m.sections.flatMap((s) => s.rows).find((r) => r.food === food);
// This week steak and eggs was eaten 4 times and the bowl 3, so only steak and eggs rests by default.
const eaten: Row[] = [
  ...[0, 1, 2, 3].map((i) => ({ client_id: `b-${i}`, date: addDays(MON, i), slot: "breakfast", meal_slug: "steak-and-eggs", category: "planned", kcal: 525, protein_g: 58 })),
  ...[0, 1, 2].map((i) => ({ client_id: `l-${i}`, date: addDays(MON, i), slot: "lunch", meal_slug: "chicken-and-rice-bowl", category: "planned", kcal: 605, protein_g: 55 })),
];
const thisWeek = rowsOf({ planned_meals: week(MON), targets: trimmed, meal_logs: eaten });

describe("weekGroceries", () => {
  it("sums a planned week by aisle at that week's grams, with that week's checks", () => {
    const checks: Row[] = [
      { week_start: MON, food_id: "egg-whole" },
      { week_start: MON, food_id: "white-rice-cooked" },
      { week_start: "2026-10-19", food_id: "butter" },
    ];
    const m = weekGroceries(rowsOf({ planned_meals: week(MON), targets: trimmed, grocery_checks: checks }), WED);
    expect(m).toMatchObject({ monday: MON, header: "WEEK OF OCT 26", preview: false, kcal: 2300, count: 15, checked: 2 });
    expect(m.sections.map((s) => [s.label, s.done, s.rows.length])).toEqual([
      ["Meat and seafood", 0, 3],
      ["Dairy and eggs", 1, 5],
      ["Produce", 0, 4],
      ["Pantry", 1, 3],
    ]);
    // The bowl and the thighs carry 175 g of cooked rice each at 2,300: 14 x 175 = 2,450.
    expect(item(m, "white-rice-cooked")).toEqual({ food: "white-rice-cooked", name: "White rice", sub: "Cooked weight", grams: 2450, checked: true });
    // An egg is 50 g, so 700 g is about 14.
    expect(item(m, "egg-whole")).toEqual({ food: "egg-whole", name: "Eggs", sub: "About 14 eggs", grams: 700, checked: true });
    // Last week's butter check doesn't carry over.
    expect(item(m, "butter")).toMatchObject({ grams: 90, checked: false });
  });

  it("moves only the flex foods with the target", () => {
    const full = weekGroceries(rowsOf({ planned_meals: week(MON) }), WED);
    const cut = weekGroceries(rowsOf({ planned_meals: week(MON), targets: trimmed }), WED);
    expect(full.kcal).toBe(2400);
    expect(["white-rice-cooked", "butter", "honey"].map((f) => [item(full, f)!.grams, item(cut, f)!.grams])).toEqual([
      [2800, 2450],
      [105, 90],
      [175, 155],
    ]);
    for (const f of ["chicken-breast-raw", "chicken-thigh-raw", "sirloin-raw"]) expect(item(cut, f)!.grams, f).toBe(item(full, f)!.grams);
  });

  it("previews a future week from the rotation, resting what the check-in rests by default", () => {
    const m = weekGroceries(thisWeek, WED, { week: NEXT });
    expect(m).toMatchObject({ monday: NEXT, header: "WEEK OF NOV 2", preview: true, kcal: 2300, count: 37, checked: 0 });
    // Steak and eggs rests, so there is less sirloin than with nothing resting.
    expect(item(m, "sirloin-raw")!.grams).toBe(600);
    expect(item(weekGroceries(thisWeek, WED, { week: NEXT, rest: [], kcal: "2300" }), "sirloin-raw")!.grams).toBe(750);
  });

  it("takes the check-in's rests and calories", () => {
    const m = weekGroceries(thisWeek, WED, { week: NEXT, rest: ["chicken-and-rice-bowl"], kcal: "2200" });
    expect(m.kcal).toBe(2200);
    expect(item(m, "chicken-breast-raw")!.grams).toBe(200);
    expect(item(m, "white-rice-cooked")!.grams).toBe(1000);
  });

  it("weighs a planned week at its own target, and ignores calories that make no sense", () => {
    expect(weekGroceries(thisWeek, WED, { week: MON, kcal: "1800" }).kcal).toBe(2300);
    expect(weekGroceries(thisWeek, WED, { week: NEXT, kcal: "lots" }).kcal).toBe(2300);
  });

  it("builds a past week with no plan from the rotation, without the preview note", () => {
    expect(weekGroceries(rowsOf({}), WED, { week: "2026-10-19" })).toMatchObject({ monday: "2026-10-19", preview: false, kcal: 2400, count: 37 });
  });
});
```

- [ ] **Step 2: Run it to make sure it fails.**

```bash
npx vitest run --project unit tests/unit/groceries/model.test.ts
```

Expected: FAIL. `~/groceries/model` doesn't exist yet.

- [ ] **Step 3: Write the model.** Create `app/groceries/model.ts`:

```ts
// The week's shopping list, worked out from the phone's copy. Pure: the browser and the unit tests both run it.
import { defaultRests, mealRepeats, previewNextWeek } from "~/checkin/meals";
import { foods, meals } from "~/content";
import { factorFor, scaledMeal } from "~/content/scaled";
import { addDays, isISODate, weekStart } from "~/domain/dates";
import { buildGroceryList, SECTION_LABEL, type Section } from "~/domain/groceries";
import type { ISODate } from "~/domain/types";
import { targetsOn, type Rows } from "~/today/slots";

const MONTH = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

export interface GroceryRow {
  food: string;
  name: string;
  /** "About 24 eggs", or "Cooked weight" for a food weighed cooked. */
  sub: string | null;
  grams: number;
  checked: boolean;
}

export interface GrocerySection {
  section: Section;
  label: string;
  done: number;
  rows: GroceryRow[];
}

export interface GroceriesModel {
  monday: ISODate;
  /** "WEEK OF NOV 2" */
  header: string;
  /** A future week not yet written to the plan, built as the check-in previews it. */
  preview: boolean;
  kcal: number;
  count: number;
  checked: number;
  sections: GrocerySection[];
}

export interface GroceriesAsk {
  week?: string | null;
  /** Slugs to rest in a preview. Null means the check-in's defaults. */
  rest?: string[] | null;
  /** The calories a preview is weighed at, from the check-in's pick. */
  kcal?: string | null;
}

const FOOD_SECTIONS = new Map([...foods].map(([id, f]) => [id, { name: f.name, section: f.section }]));

function subline(foodId: string, grams: number): string | null {
  const f = foods.get(foodId)!;
  const each = f.eachG && f.eachLabel ? Math.round(grams / f.eachG) : 0;
  if (each > 0) return `About ${each} ${f.eachLabel}${each === 1 ? "" : "s"}`;
  return f.state === "cooked" ? "Cooked weight" : null;
}

export function weekGroceries(rows: Rows, today: ISODate, ask: GroceriesAsk = {}): GroceriesModel {
  const monday = isISODate(ask.week) ? weekStart(ask.week) : weekStart(today);
  const sunday = addDays(monday, 6);
  const planned = rows("planned_meals").filter((r) => (r.date as ISODate) >= monday && (r.date as ISODate) <= sunday);
  const future = monday > weekStart(today);
  const preview = planned.length === 0 && future;
  // With no rows yet, the week comes from the rotation as the check-in previews it: the week before it is the one
  // under review. A past or current week rests nothing new, as the server's generator wouldn't.
  const before = addDays(monday, -7);
  const rest = future ? (ask.rest ?? defaultRests(mealRepeats(rows, before))) : [];
  const slugs = planned.length > 0 ? planned.map((r) => r.meal_slug as string) : previewNextWeek(rows, before, rest).map((p) => p.slug);
  const asked = Number(ask.kcal);
  const kcal = preview && Number.isInteger(asked) && asked >= 1200 && asked <= 4000 ? asked : targetsOn(rows, monday).kcal;
  const factor = factorFor(kcal);
  const ingredients = new Map([...meals.values()].map((m) => [m.slug, scaledMeal(m, factor).ingredients.map((i) => ({ foodId: i.food, grams: i.grams }))]));
  const checked = new Set(rows("grocery_checks").filter((r) => r.week_start === monday).map((r) => r.food_id as string));
  const sections = buildGroceryList(slugs, ingredients, FOOD_SECTIONS).map((g): GrocerySection => {
    const list = g.items.map((i) => ({ food: i.foodId, name: i.name, sub: subline(i.foodId, i.grams), grams: i.grams, checked: checked.has(i.foodId) }));
    return { section: g.section, label: SECTION_LABEL[g.section], done: list.filter((r) => r.checked).length, rows: list };
  });
  const [, m, d] = monday.split("-").map(Number);
  return {
    monday,
    header: `WEEK OF ${MONTH[m - 1]} ${d}`,
    preview,
    kcal,
    count: sections.reduce((n, s) => n + s.rows.length, 0),
    checked: sections.reduce((n, s) => n + s.done, 0),
    sections,
  };
}
```

- [ ] **Step 4: Run the test.** Same command as Step 2. Expected: PASS, 6 tests.

- [ ] **Step 5: Commit.**

```bash
git add app/groceries/model.ts tests/unit/groceries/model.test.ts
git commit -m "The grocery list reads the phone's copy: by aisle, at the week's grams, with the check-in's preview"
```

---

### Task 3: Groceries on the phone (option 5A)

**Files:**
- Create: `app/groceries/GroceriesScreen.tsx`
- Modify: `app/routes/groceries.tsx` (full rewrite)

- [ ] **Step 1: The screen.** Create `app/groceries/GroceriesScreen.tsx`:

```tsx
import { Icon } from "~/components/ui";
import { useMutate } from "~/sync/react";
import { HeaderIcon } from "~/ui/GymFrame";
import { SectionHead } from "~/ui/SectionHead";
import type { GroceriesModel, GroceryRow } from "./model";

/** Option 5A: aisles in store order, a check circle per food, and checked rows that stay put, muted. */
export function GroceriesScreen({ m, fromCheckIn }: { m: GroceriesModel; fromCheckIn: boolean }) {
  const mutate = useMutate();
  const toggle = (r: GroceryRow) => void mutate("checkGrocery", { week: m.monday, food: r.food, checked: !r.checked });
  return (
    <main className="mx-auto flex w-full max-w-[560px] flex-col gap-7 px-5 pb-12 pt-[max(20px,env(safe-area-inset-top))]">
      <header className="flex items-center gap-3">
        <HeaderIcon to={fromCheckIn ? "/check-in" : "/plan"} label={fromCheckIn ? "Back to the check-in" : "Back to Plan"} icon="back" />
        <span className="font-num text-[16px] font-bold tracking-[0.02em]">{m.header}</span>
      </header>

      <section className="flex flex-col gap-2">
        <h1 className="font-display text-[48px] uppercase leading-none">Groceries.</h1>
        <p className="flex flex-wrap items-baseline gap-x-2.5">
          <span className="tabular font-num text-[34px] font-bold leading-none">
            {m.checked} of {m.count}
          </span>
          <span className="font-num text-[16px] font-semibold text-ink-3">in the cart · at {m.kcal.toLocaleString("en-US")} cal</span>
        </p>
        {m.preview && <p className="text-[15px] leading-[1.45] text-ink-2">Built from next week's meals as the check-in has them. It updates when you finish.</p>}
      </section>

      {m.count === 0 && <p className="text-[16px] text-ink-3">No meals planned for this week yet.</p>}
      {m.sections.map((s) => (
        <section key={s.section} aria-labelledby={`aisle-${s.section}`} className="flex flex-col">
          <SectionHead id={`aisle-${s.section}`} note={`${s.done} of ${s.rows.length}`}>
            {s.label}
          </SectionHead>
          <ul className="flex flex-col">
            {s.rows.map((r) => (
              <li key={r.food}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={r.checked}
                  onClick={() => toggle(r)}
                  className="flex min-h-[60px] w-full items-center gap-3 border-b border-rule py-2 text-left"
                >
                  <span aria-hidden="true" className={`flex size-11 flex-none items-center justify-center rounded-full ${r.checked ? "bg-ink text-paper" : "border-[1.5px] border-border"}`}>
                    {r.checked && <Icon name="check" size={20} strokeWidth={3} />}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className={`text-[16px] font-semibold ${r.checked ? "text-muted line-through decoration-underline" : ""}`}>{r.name}</span>
                    {r.sub && <span className="text-[13px] text-ink-3">{r.sub}</span>}
                  </span>
                  <span className={`tabular whitespace-nowrap font-num text-[20px] font-bold ${r.checked ? "text-muted" : ""}`}>
                    {r.grams.toLocaleString("en-US")}
                    <span className="ml-0.5 text-[14px] font-semibold text-ink-3">g</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
```

The checked circle is ink with a paper check, not red (spec call 20). A refused `checkGrocery` shows in the sync notice as "Grocery check didn't save. ..." and the store puts the row back.

- [ ] **Step 2: The route.** Replace `app/routes/groceries.tsx` with:

```tsx
import { useMemo } from "react";
import { useSearchParams } from "react-router";
import { pageTitle } from "~/brand";
import { mealDate } from "~/domain/dates";
import { GroceriesScreen } from "~/groceries/GroceriesScreen";
import { weekGroceries } from "~/groceries/model";
import { useNow } from "~/lib/use-now";
import { useStoreVersion, useSyncClient, useSyncStatus } from "~/sync/react";

export const handle = { hideTabBar: true };

export function meta() {
  return [{ title: pageTitle("Groceries") }];
}

/** No loader: the list reads the phone's copy, so it opens in the store with no signal. */
export default function Groceries() {
  const client = useSyncClient();
  const ready = useSyncStatus()?.ready ?? false;
  const version = useStoreVersion();
  const [params] = useSearchParams();
  const minute = Math.floor(useNow(60_000).getTime() / 60_000);
  const week = params.get("week");
  const kcal = params.get("kcal");
  // The check-in's link always carries kcal, so a link with kcal and no rest means nothing rests.
  const rest = params.has("rest") || kcal !== null ? params.getAll("rest").filter(Boolean).join(",") : null;
  const model = useMemo(
    () =>
      client && ready
        ? weekGroceries((t) => client.store.rows(t), mealDate(new Date(minute * 60_000)), { week, kcal, rest: rest === null ? null : rest.split(",").filter(Boolean) })
        : null,
    [client, ready, version, minute, week, kcal, rest],
  );
  // The server and the first paint have no store yet. It loads from the phone in a few milliseconds.
  if (!model) return <main aria-busy="true" className="min-h-dvh" />;
  return <GroceriesScreen m={model} fromCheckIn={params.get("from") === "check-in"} />;
}
```

- [ ] **Step 3: Typecheck.**

```bash
npm run typecheck
```

Expected: no errors. `app/server/groceries.server.ts` still compiles: v1 Plan imports it until Task 5.

- [ ] **Step 4: Look.** With `npm run dev` running and signed in, open `/groceries`. The header reads "WEEK OF <this Monday>", the title "Groceries.", then "0 of 37 in the cart · at <calories> cal" (or the count of this week's real rows), and four aisles in the order Meat and seafood, Dairy and eggs, Produce, Pantry, each with "0 of n". Tap a row: the circle fills ink, the name goes muted and struck through, the aisle note and the big number move by one, and the row stays where it was. Tap it again to clear it. Then open `/groceries?week=<next Monday>&from=check-in&kcal=2300`: the back button reads "Back to the check-in", and the preview note shows under the title.

- [ ] **Step 5: Commit.**

```bash
git add app/groceries/GroceriesScreen.tsx app/routes/groceries.tsx
git commit -m "Groceries reads the phone's copy, by aisle with check circles, and checks run checkGrocery"
```

---

### Task 4: The Plan model

The fixture is week 4, Monday Oct 26 to Sunday Nov 1, read on Wednesday Oct 28 at 9am. Monday's workout is done: pec deck and lat pulldown hit 12 on both sets (the top of 8 to 12), so 2 lifts moved up, and incline press (6 to 10) didn't. The day names and lift counts come from `content/plan.json`.

**Files:**
- Create: `app/plan/model.ts`
- Test: `tests/unit/plan/model.test.ts`

- [ ] **Step 1: Write the failing test.** Create `tests/unit/plan/model.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildPlan, type PlanModel } from "~/plan/model";
import type { Row } from "~/sync/tables";

const at = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00-05:00`);
const rowsOf = (t: Record<string, Row[]>) => (name: string) => t[name] ?? [];
const MON = "2026-10-26";
const TUE = "2026-10-27";
const WED = "2026-10-28";
const SAT = "2026-10-31";
const days = (m: PlanModel) => m.days.map((d) => [d.weekday, d.title, d.sub]);
const session = (o: Row): Row => ({ id: null, client_id: "w-mon", date: MON, template_id: "mon-chest-back-arms", started_at: `${MON}T17:00:00Z`, ended_at: `${MON}T18:00:00Z`, lifts: null, feel: null, ...o });
let n = 0;
const set = (o: Row): Row => ({ id: null, client_id: `s-${++n}`, session_key: "w-mon", exercise_id: "pec-deck", position: 1, set_number: 1, weight_lb: 130, reps: 12, logged_at: `${MON}T17:05:00Z`, ...o });
// Monday: pec deck and lat pulldown hit the top of 8 to 12 on both sets, so they move up. Incline press (6 to 10) didn't.
const monday = {
  workout_sessions: [session({})],
  set_logs: [
    set({ exercise_id: "incline-dumbbell-press", position: 0, weight_lb: 55, reps: 9 }),
    set({ exercise_id: "incline-dumbbell-press", position: 0, set_number: 2, weight_lb: 55, reps: 8 }),
    set({}),
    set({ set_number: 2 }),
    set({ exercise_id: "lat-pulldown", position: 2, weight_lb: 125 }),
    set({ exercise_id: "lat-pulldown", position: 2, set_number: 2, weight_lb: 125 }),
  ],
};
const weekend: Row[] = [
  { date: SAT, slot: "breakfast", meal_slug: "steak-and-eggs", swapped: 0 },
  { date: SAT, slot: "dinner", meal_slug: "chicken-fajita-bowl", swapped: 0 },
  { date: SAT, slot: "lunch", meal_slug: "steak-salad", swapped: 0 },
];
const targets: Row[] = [
  { effective_from: "2026-10-19", kcal: 2400, protein_g: 180, step_goal: 7000 },
  { effective_from: MON, kcal: 2300, protein_g: 180, step_goal: 7500 },
];

describe("buildPlan", () => {
  it("reads week 4: the poster, the strip and its legend", () => {
    const m = buildPlan(rowsOf({}), at(WED, "09:00"));
    expect(m.poster).toEqual(["Week 4", "of 13."]);
    expect(m.meta).toBe("Oct 26 to Nov 1 · Phase 1 ends Jan 1");
    expect(m.cells.map((c) => c.state)).toEqual(["done", "done", "done", "current", ...Array(9).fill("ahead")]);
    expect(m.cells.filter((c) => c.type !== "standard").map((c) => [c.n, c.type])).toEqual([
      [8, "deload"],
      [12, "maintenance"],
      [13, "checkpoint"],
    ]);
    // Each date is that week's Monday; the checkpoint's is the goal date.
    expect(m.legend.map((l) => l.text)).toEqual(["Wk 8 deload, Nov 23", "Wk 12 maintenance, Dec 21", "Wk 13 checkpoint, Jan 1"]);
  });

  it("lists the week Monday first, from what was logged and what is planned", () => {
    const m = buildPlan(rowsOf({ ...monday, planned_meals: weekend, targets }), at(WED, "09:00"));
    expect(days(m)).toEqual([
      ["MON", "Chest, back, arms", "Done · 2 lifts moved up"],
      ["TUE", "Rest", "Arms and back extra, skipped"],
      ["WED", "Legs, shoulders", "Today · noon · 6 lifts"],
      // 4 lifts x 2 sets, at the workout screen's 3.5 minutes a set plus 5 to warm up: 35.
      ["THU", "Rest", "Optional: arms and back extra, 35 min"],
      ["FRI", "Chest, shoulders, arms", "Noon · 6 lifts · tap to change"],
      ["SAT", "Rest · weekend meals", "Steak salad, chicken fajita bowl"],
      ["SUN", "Rest · weekend meals", "Check-in opens at 5pm"],
    ]);
    expect(m.days.map((d) => [d.today, d.done, d.to, d.sheet?.action ?? null])).toEqual([
      [false, true, "/workout?date=2026-10-26&from=plan", null],
      [false, false, null, null],
      [true, false, "/workout", null],
      [false, false, null, "train"],
      [false, false, null, "move"],
      [false, false, null, null],
      [false, false, "/check-in", null],
    ]);
    expect(m.days[4].sheet).toEqual({
      title: "Friday",
      workout: "Chest, shoulders, arms",
      lifts: [
        { name: "Flat dumbbell press", sets: "2 × 6 to 10" },
        { name: "Cable fly, low to high", sets: "2 × 10 to 12" },
        { name: "Dumbbell lateral raise", sets: "2 × 10 to 15" },
        { name: "Reverse pec deck", sets: "2 × 10 to 15" },
        { name: "Incline dumbbell curl", sets: "2 × 8 to 12" },
        { name: "Overhead cable triceps extension", sets: "2 × 8 to 12" },
      ],
      action: "move",
    });
    expect(m.days[3].sheet?.lifts.map((l) => l.name)).toEqual(["Pull-ups", "Cable lateral raise", "Hammer curl", "Rope pushdown"]);
  });

  it("asks to log a past workout that wasn't, and marks a done extra", () => {
    const extra = {
      workout_sessions: [session({ client_id: "w-tue", date: TUE, template_id: "optional-arms-back" })],
      set_logs: [set({ session_key: "w-tue", exercise_id: "hammer-curl", position: 2, weight_lb: 30, reps: 10 })],
    };
    const m = buildPlan(rowsOf(extra), at(WED, "09:00"));
    expect(days(m).slice(0, 2)).toEqual([
      ["MON", "Chest, back, arms", "Not logged · tap to log it"],
      ["TUE", "Rest", "Arms and back extra · Done"],
    ]);
    expect(m.days[0]).toMatchObject({ done: false, to: "/workout?date=2026-10-26&from=plan" });
    expect(m.days[1]).toMatchObject({ done: true, to: "/workout?date=2026-10-27&from=plan" });
  });

  it("shows today's workout as edited, then done with what moved up", () => {
    const lifts = [
      { position: 0, exercise: "leg-press", repMin: 8, repMax: 12, from: "plan" },
      { position: 100, exercise: "hammer-curl", repMin: 8, repMax: 12, from: "added" },
    ];
    const planned = session({ client_id: "w-wed", date: WED, template_id: "wed-legs-shoulders", started_at: null, ended_at: null, lifts: JSON.stringify(lifts) });
    expect(buildPlan(rowsOf({ workout_sessions: [planned] }), at(WED, "09:00")).days[2].sub).toBe("Today · noon · 2 lifts, edited");
    const finished = {
      workout_sessions: [session({ client_id: "w-wed", date: WED, template_id: "wed-legs-shoulders", started_at: `${WED}T17:00:00Z`, ended_at: `${WED}T18:00:00Z` })],
      set_logs: [set({ session_key: "w-wed", exercise_id: "leg-press", position: 0, weight_lb: 280 }), set({ session_key: "w-wed", exercise_id: "leg-press", position: 0, set_number: 2, weight_lb: 280 })],
    };
    expect(buildPlan(rowsOf(finished), at(WED, "19:00")).days[2]).toMatchObject({ sub: "Today · done · 1 lift moved up", done: true, to: "/workout" });
  });

  it("offers today's extra on a rest day", () => {
    expect(buildPlan(rowsOf({}), at("2026-10-29", "09:00")).days[3]).toMatchObject({ title: "Rest", sub: "Today · optional: arms and back extra, 35 min", today: true, to: "/workout" });
  });

  it("makes Thanksgiving a relaxed day", () => {
    expect(buildPlan(rowsOf({}), at("2026-11-25", "09:00")).days[3]).toMatchObject({ title: "Relaxed day", sub: "Counts no matter what", to: null, sheet: null });
  });

  it("says when the check-in opens, is open, and is done", () => {
    // Nov 1 is on standard time, so these read an hour earlier in Chicago: 3pm, 6pm and 6:30pm.
    expect(buildPlan(rowsOf({}), at("2026-11-01", "16:00")).days[6].sub).toBe("Check-in opens at 5pm");
    expect(buildPlan(rowsOf({}), at("2026-11-01", "19:00")).days[6].sub).toBe("Check-in is open");
    expect(buildPlan(rowsOf({ check_ins: [{ week_start: MON, completed_at: "2026-11-01T23:30:00Z" }] }), at("2026-11-01", "19:30")).days[6].sub).toBe("Check-in done");
  });

  it("follows a moved workout", () => {
    const moves: Row[] = [
      { date: "2026-10-30", template_id: null },
      { date: SAT, template_id: "fri-chest-shoulders-arms" },
    ];
    const m = buildPlan(rowsOf({ schedule_moves: moves }), at(WED, "09:00"));
    expect(days(m).slice(4, 6)).toEqual([
      ["FRI", "Rest", "Workout moved"],
      ["SAT", "Chest, shoulders, arms", "Noon · 6 lifts · tap to change"],
    ]);
    expect(m.days[4].sheet?.action).toBe("train");
    expect(m.schedule.map((d) => d.templateId)).toEqual(["mon-chest-back-arms", null, "wed-legs-shoulders", null, null, "fri-chest-shoulders-arms", null]);
  });

  it("says where each target came from", () => {
    const cells = (t: Row[], date = WED) => buildPlan(rowsOf({ targets: t }), at(date, "09:00")).targets.map((c) => [c.label, c.value, c.sub]);
    expect(cells([])).toEqual([
      ["Calories", "2,400", "starting target"],
      ["Protein", "180 g", "every day"],
      ["Steps", "7,000", "starting goal"],
    ]);
    expect(cells(targets)).toEqual([
      ["Calories", "2,300", "from the check-in"],
      ["Protein", "180 g", "every day"],
      ["Steps", "7,500", "up 500"],
    ]);
    // Week 12 eats the plan's 2,800 before any check-in has a burn. The step goal didn't move at the last check-in.
    const later: Row[] = [targets[1], { effective_from: "2026-12-14", kcal: 2200, protein_g: 180, step_goal: 7500 }];
    expect(cells(later, "2026-12-23")).toEqual([
      ["Calories", "2,800", "maintenance week"],
      ["Protein", "180 g", "every day"],
      ["Steps", "7,500", "same as last week"],
    ]);
  });

  it("counts this week's groceries", () => {
    expect(buildPlan(rowsOf({}), at(WED, "09:00")).groceries).toEqual({ checked: 0, count: 37 });
  });
});
```

- [ ] **Step 2: Run it to make sure it fails.**

```bash
npx vitest run --project unit tests/unit/plan/model.test.ts
```

Expected: FAIL. `~/plan/model` doesn't exist yet.

- [ ] **Step 3: Write the model.** Create `app/plan/model.ts`:

```ts
// Everything the Plan screen shows, worked out from the phone's copy. Pure: the browser and the unit tests both run it.
import { exercises, meals, plan } from "~/content";
import { weekSchedule, type ScheduleDay } from "~/content/schedule";
import { resolveBaseTargets } from "~/content/targets";
import { isRelaxedDay, optionalTemplateFor, setsFor, templateFor, weekNumber, weekType, type Moves } from "~/domain/calendar";
import { checkInWindow } from "~/domain/checkin";
import { addDays, mealDate, weekStart, weekday } from "~/domain/dates";
import { SLOTS, type ISODate, type Slot, type WeekType } from "~/domain/types";
import { weekGroceries } from "~/groceries/model";
import { DAY_NAME, targetEntries, targetsOn, type Rows } from "~/today/slots";
import { choiceLabel, resolveLifts, workoutMinutes } from "~/workout/lifts";
import { buildWorkout, count } from "~/workout/model";
import { doneDates } from "~/workout/sessions";

const DOW = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const WEEKS = Math.max(...Object.keys(plan.weekTypes).map(Number));

export const monthDay = (d: ISODate) => `${MONTH[Number(d.slice(5, 7)) - 1]} ${Number(d.slice(8, 10))}`;

/** "Oct 26 to Nov 1", or "Nov 2 to 8" inside one month. */
export function weekRange(monday: ISODate): string {
  const sunday = addDays(monday, 6);
  return `${monthDay(monday)} to ${monday.slice(5, 7) === sunday.slice(5, 7) ? Number(sunday.slice(8, 10)) : monthDay(sunday)}`;
}

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

export interface PhaseCell {
  n: number;
  state: "done" | "current" | "ahead";
  type: WeekType;
}

export interface StatCell {
  label: string;
  value: string;
  sub: string;
}

export interface DaySheet {
  /** "Friday" */
  title: string;
  /** "Chest, shoulders, arms", or the optional extra on a rest day. */
  workout: string | null;
  lifts: { name: string; sets: string }[];
  /** "Move to another day" from a workout day, "Train this day" from a rest day. */
  action: "move" | "train";
}

export interface PlanDay {
  date: ISODate;
  /** "MON" */
  weekday: string;
  title: string;
  sub: string;
  today: boolean;
  /** The ink check: the day's workout is done. */
  done: boolean;
  /** Where a tap goes, or null. */
  to: string | null;
  /** Future days open the day sheet instead. */
  sheet: DaySheet | null;
}

export interface PlanModel {
  date: ISODate;
  poster: string[];
  meta: string;
  cells: PhaseCell[];
  legend: { type: WeekType; text: string }[];
  targets: StatCell[];
  days: PlanDay[];
  /** For the move sheet. */
  schedule: ScheduleDay[];
  groceries: { checked: number; count: number };
}

function targetCells(rows: Rows, today: ISODate): StatCell[] {
  const entries = targetEntries(rows);
  const t = targetsOn(rows, today);
  const latest = entries.filter((e) => e.effectiveFrom <= today).at(-1) ?? null;
  const steps = latest ? latest.stepGoal - resolveBaseTargets(entries, addDays(latest.effectiveFrom, -1)).stepGoal : 0;
  const n = (v: number) => v.toLocaleString("en-US");
  return [
    { label: "Calories", value: n(t.kcal), sub: weekType(plan, today) === "maintenance" ? "maintenance week" : latest ? "from the check-in" : "starting target" },
    { label: "Protein", value: `${t.proteinG} g`, sub: "every day" },
    { label: "Steps", value: n(t.stepGoal), sub: !latest ? "starting goal" : steps > 0 ? `up ${n(steps)}` : steps < 0 ? `down ${n(-steps)}` : "same as last week" },
  ];
}

/** The weekend-only mains planned that day, in slot order: "Steak salad, chicken fajita bowl". */
function weekendMains(rows: Rows, date: ISODate): string | null {
  const names = rows("planned_meals")
    .filter((r) => r.date === date)
    .sort((a, b) => SLOTS.indexOf(a.slot as Slot) - SLOTS.indexOf(b.slot as Slot))
    .map((r) => meals.get(r.meal_slug as string))
    .filter((m) => m?.mode === "weekend")
    .map((m, i) => (i === 0 ? m!.name : lowerFirst(m!.name)));
  return names.length ? names.join(", ") : null;
}

function liftList(rows: Rows, templateId: string, date: ISODate): DaySheet["lifts"] {
  const open = rows("workout_sessions").find((r) => r.date === date && !r.ended_at) ?? null;
  const sets = setsFor(plan, date);
  return resolveLifts(rows, open, templateId, date).map((l) => ({ name: exercises.get(l.exercise)!.name, sets: `${sets} × ${l.repMin} to ${l.repMax}` }));
}

function sundayLine(rows: Rows, now: Date, monday: ISODate): string {
  if (rows("check_ins").some((r) => r.week_start === monday)) return "Check-in done";
  return checkInWindow(now) === monday ? "Check-in is open" : "Check-in opens at 5pm";
}

function dayRow(rows: Rows, now: Date, today: ISODate, date: ISODate, moves: Moves, done: Set<ISODate>): PlanDay {
  const wd = weekday(date);
  const base = { date, weekday: DOW[wd], today: date === today, done: false, to: null, sheet: null };
  const past = date < today;
  const future = date > today;
  const logIt = `/workout?date=${date}&from=plan`;
  const templateId = templateFor(plan, date, moves);

  if (templateId) {
    const title = choiceLabel(templateId);
    if (past && !done.has(date)) return { ...base, title, sub: "Not logged · tap to log it", to: logIt };
    if (past) {
      const up = buildWorkout(rows, now, { date }).movedUp.length;
      return { ...base, title, sub: up ? `Done · ${count(up, "lift")} moved up` : "Done", done: true, to: logIt };
    }
    if (future) {
      const lifts = liftList(rows, templateId, date);
      return { ...base, title, sub: `Noon · ${count(lifts.length, "lift")} · tap to change`, sheet: { title: DAY_NAME[wd], workout: title, lifts, action: "move" } };
    }
    // Today: the workout screen's own reading, so a workout picked on Today shows here too.
    const w = buildWorkout(rows, now);
    const shown = w.templateId ? choiceLabel(w.templateId) : title;
    if (w.screen === "done") {
      const up = w.movedUp.length;
      return { ...base, title: shown, sub: up ? `Today · done · ${count(up, "lift")} moved up` : "Today · done", done: true, to: "/workout" };
    }
    const usual = resolveLifts(rows, null, w.templateId ?? templateId, date).map((l) => l.exercise).join();
    const edited = w.lifts.map((l) => l.exercise).join() !== usual;
    return { ...base, title: shown, sub: `Today · noon · ${count(w.lifts.length, "lift")}${edited ? ", edited" : ""}`, to: "/workout" };
  }

  if (wd === 0) return { ...base, title: "Rest · weekend meals", sub: sundayLine(rows, now, weekStart(date)), to: "/check-in" };
  if (isRelaxedDay(plan, date)) return { ...base, title: "Relaxed day", sub: "Counts no matter what" };
  if (wd === 6) return { ...base, title: "Rest · weekend meals", sub: weekendMains(rows, date) ?? "Restaurant meal fits, protein first" };

  const extraId = optionalTemplateFor(plan, date);
  if (!extraId) {
    return { ...base, title: "Rest", sub: date in moves ? "Workout moved" : "", sheet: future ? { title: DAY_NAME[wd], workout: null, lifts: [], action: "train" } : null };
  }
  const extra = choiceLabel(extraId);
  const minutes = workoutMinutes(plan.templates[extraId]!.exercises.length * setsFor(plan, date));
  if (past) return done.has(date) ? { ...base, title: "Rest", sub: `${extra} · Done`, done: true, to: logIt } : { ...base, title: "Rest", sub: `${extra}, skipped` };
  if (future) {
    return {
      ...base,
      title: "Rest",
      sub: `Optional: ${lowerFirst(extra)}, ${minutes} min`,
      sheet: { title: DAY_NAME[wd], workout: `Optional: ${lowerFirst(extra)}`, lifts: liftList(rows, extraId, date), action: "train" },
    };
  }
  return done.has(date)
    ? { ...base, title: "Rest", sub: `Today · ${lowerFirst(extra)} · done`, done: true, to: "/workout" }
    : { ...base, title: "Rest", sub: `Today · optional: ${lowerFirst(extra)}, ${minutes} min`, to: "/workout" };
}

export function buildPlan(rows: Rows, now: Date): PlanModel {
  const today = mealDate(now);
  const monday = weekStart(today);
  const week = Math.min(Math.max(weekNumber(plan, today), 1), WEEKS);
  const moves: Moves = Object.fromEntries(rows("schedule_moves").map((r) => [r.date as string, (r.template_id as string | null) ?? null]));
  const done = doneDates(rows, today);
  const mondayOf = (k: number) => addDays(plan.phaseStart, (k - 1) * 7);
  const cells = Array.from({ length: WEEKS }, (_, i): PhaseCell => {
    const k = i + 1;
    return { n: k, state: k < week ? "done" : k === week ? "current" : "ahead", type: weekType(plan, mondayOf(k)) };
  });
  const groceries = weekGroceries(rows, today);
  return {
    date: today,
    poster: [`Week ${week}`, `of ${WEEKS}.`],
    meta: `${weekRange(monday)} · Phase 1 ends ${monthDay(plan.goal.date)}`,
    cells,
    legend: cells
      .filter((c) => c.type !== "standard")
      .map((c) => ({ type: c.type, text: `Wk ${c.n} ${c.type}, ${monthDay(c.type === "checkpoint" ? plan.goal.date : mondayOf(c.n))}` })),
    targets: targetCells(rows, today),
    days: Array.from({ length: 7 }, (_, i) => dayRow(rows, now, today, addDays(monday, i), moves, done)),
    schedule: weekSchedule(monday, moves, done),
    groceries: { checked: groceries.checked, count: groceries.count },
  };
}
```

- [ ] **Step 4: Run the test.** Same command as Step 2. Expected: PASS, 10 tests.

- [ ] **Step 5: Commit.**

```bash
git add app/plan/model.ts tests/unit/plan/model.test.ts
git commit -m "The Plan model: the week number, the 13-week strip, the targets and one row per day"
```

---

### Task 5: Plan on the phone, and the server code it leaves behind

**Files:**
- Create: `app/plan/PlanScreen.tsx`, `app/plan/DaySheet.tsx`
- Modify: `app/routes/plan.tsx` (full rewrite), `app/components/MoveSheet.tsx`
- Delete: `app/server/groceries.server.ts`, `tests/workers/groceries.test.ts`
- Maybe modify: `app/server/checkin.server.ts`

- [ ] **Step 1: The day sheet.** Create `app/plan/DaySheet.tsx`:

```tsx
import { Sheet } from "~/components/Sheet";
import { btn } from "~/ui/button";
import type { DaySheet as DaySheetModel } from "./model";

/** A future day: its lifts, then the move. The move itself is the move sheet's, so Plan and the workout share it. */
export function DaySheet({ sheet, onClose, onMove }: { sheet: DaySheetModel; onClose: () => void; onMove: () => void }) {
  return (
    <Sheet open onClose={onClose} title={sheet.title} dismiss="cancel">
      {sheet.workout && <p className="mb-2 text-[17px] font-bold">{sheet.workout}</p>}
      {sheet.lifts.length > 0 && (
        <ul className="mb-5 flex flex-col border-t border-rule">
          {sheet.lifts.map((l) => (
            <li key={l.name} className="flex min-h-12 items-center justify-between gap-3 border-b border-rule">
              <span className="text-[16px]">{l.name}</span>
              <span className="tabular whitespace-nowrap font-num text-[15px] font-bold text-ink-3">{l.sets}</span>
            </li>
          ))}
        </ul>
      )}
      <button type="button" onClick={onMove} className={`${btn.outline} h-14 w-full text-[16px]`}>
        {sheet.action === "move" ? "Move to another day" : "Train this day"}
      </button>
    </Sheet>
  );
}
```

- [ ] **Step 2: The screen.** Create `app/plan/PlanScreen.tsx`:

```tsx
import { useState } from "react";
import { Link } from "react-router";
import { MoveSheet } from "~/components/MoveSheet";
import { Icon } from "~/components/ui";
import { LinkCard } from "~/ui/LinkCard";
import { Poster } from "~/ui/Poster";
import { SectionHead } from "~/ui/SectionHead";
import { StatGrid } from "~/ui/StatGrid";
import { DaySheet } from "./DaySheet";
import type { PhaseCell, PlanDay, PlanModel } from "./model";

// The deload's hatch, drawn in the mock's colours: on-ink-2 in the cell, underline in the legend's swatch.
const HATCH = { backgroundImage: "repeating-linear-gradient(135deg, var(--on-ink-2) 0 3px, transparent 3px 7px)" };
const HATCH_SMALL = { backgroundImage: "repeating-linear-gradient(135deg, var(--underline) 0 2px, transparent 2px 5px)" };

function cellLabel(c: PhaseCell): string {
  const type = c.type === "checkpoint" ? ", January 1 checkpoint" : c.type === "standard" ? "" : `, ${c.type}`;
  return `Week ${c.n}${type}${c.state === "current" ? ", this week" : c.state === "done" ? ", done" : ""}`;
}

function cellClass(c: PhaseCell): string {
  const base = "flex h-10 items-center justify-center rounded-[3px]";
  if (c.state === "done") return `${base} bg-ink`;
  if (c.state === "current") return `${base} border-[2.5px] border-red`;
  if (c.type === "checkpoint") return `${base} border-2 border-ink`;
  if (c.type === "maintenance") return `${base} border-[1.5px] border-border bg-well`;
  return `${base} border-[1.5px] border-border`;
}

function Flag() {
  return (
    <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="text-ink">
      <path d="M5 3h2v18H5zM7 4h11l-2.5 4L18 12H7z" />
    </svg>
  );
}

function PhaseStrip({ m }: { m: PlanModel }) {
  return (
    <section aria-label={`${m.cells.length}-week phase`} className="flex flex-col gap-2.5">
      <ol className="grid gap-[3px] text-center font-num text-[12px] font-bold" style={{ gridTemplateColumns: `repeat(${m.cells.length}, minmax(0, 1fr))` }}>
        {m.cells.map((c) => (
          <li
            key={c.n}
            aria-label={cellLabel(c)}
            aria-current={c.state === "current" ? "step" : undefined}
            className={`flex flex-col gap-1 ${c.state === "current" ? "text-red" : c.state === "ahead" ? "text-ink-3" : ""}`}
          >
            <span className={cellClass(c)} style={c.state === "ahead" && c.type === "deload" ? HATCH : undefined}>
              {c.state === "ahead" && c.type === "checkpoint" && <Flag />}
            </span>
            <span aria-hidden="true">{c.n}</span>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[14px] text-ink-2">
        {m.legend.map((l) => (
          <span key={l.text} className="flex items-center gap-1.5">
            {l.type === "deload" && <span aria-hidden="true" className="size-3 border-[1.5px] border-border" style={HATCH_SMALL} />}
            {l.type === "maintenance" && <span aria-hidden="true" className="size-3 border-[1.5px] border-border bg-well" />}
            {l.text}
          </span>
        ))}
      </div>
    </section>
  );
}

function DayRow({ d, past, onOpen }: { d: PlanDay; past: boolean; onOpen: (d: PlanDay) => void }) {
  const body = (
    <>
      <span className={`w-[42px] flex-none font-num text-[15px] font-bold ${d.today ? "text-red" : "text-ink-3"}`}>{d.weekday}</span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={d.today ? "text-[17px] font-bold" : `text-[16px] ${past ? "text-ink-3" : ""}`}>{d.title}</span>
        {d.sub && <span className={`text-[13px] ${d.today ? "text-ink-3" : "text-muted"}`}>{d.sub}</span>}
      </span>
      {d.done ? (
        <span role="img" aria-label="Done">
          <Icon name="check" size={18} strokeWidth={2.8} />
        </span>
      ) : (
        (d.to || d.sheet) && (
          <span className="text-ink-3">
            <Icon name="chevron" size={16} strokeWidth={2.4} />
          </span>
        )
      )}
    </>
  );
  const cls = `flex items-center gap-3 border-b border-rule text-left ${d.today ? "-mx-3 min-h-16 border-t-2 border-t-red bg-raised px-3" : "min-h-[58px] w-full"}`;
  if (d.to) return <Link to={d.to} className={cls}>{body}</Link>;
  if (d.sheet) {
    return (
      <button type="button" onClick={() => onOpen(d)} className={cls}>
        {body}
      </button>
    );
  }
  return <div className={cls}>{body}</div>;
}

/** Mock `Plan`, on the phone's copy. */
export function PlanScreen({ m }: { m: PlanModel }) {
  const [open, setOpen] = useState<PlanDay | null>(null);
  const [moving, setMoving] = useState<string | null>(null);
  const anchor = m.schedule.find((s) => s.date === moving);
  return (
    <main className="mx-auto flex w-full max-w-[560px] flex-col gap-7 px-5 pb-8 pt-[max(20px,env(safe-area-inset-top))]">
      <Poster lines={m.poster} meta={m.meta} />
      <PhaseStrip m={m} />
      <StatGrid label="This week's targets" columns={3} cells={m.targets} />
      <section aria-labelledby="the-week" className="flex flex-col">
        <SectionHead id="the-week">The week</SectionHead>
        {m.days.map((d) => (
          <DayRow key={d.date} d={d} past={d.date < m.date} onOpen={setOpen} />
        ))}
      </section>
      <LinkCard to="/groceries" icon="cart" title="This week's groceries" sub={`${m.groceries.checked} of ${m.groceries.count} checked off`} />
      {open?.sheet && (
        <DaySheet
          sheet={open.sheet}
          onClose={() => setOpen(null)}
          onMove={() => {
            setMoving(open.date);
            setOpen(null);
          }}
        />
      )}
      {anchor && <MoveSheet open onClose={() => setMoving(null)} anchor={anchor} week={m.schedule} today={m.date} />}
    </main>
  );
}
```

- [ ] **Step 3: The route.** Replace `app/routes/plan.tsx` with:

```tsx
import { useMemo } from "react";
import { pageTitle } from "~/brand";
import { useNow } from "~/lib/use-now";
import { buildPlan } from "~/plan/model";
import { PlanScreen } from "~/plan/PlanScreen";
import { useStoreVersion, useSyncClient, useSyncStatus } from "~/sync/react";

export function meta() {
  return [{ title: pageTitle("Plan") }];
}

/** No loader: Plan reads the phone's copy, like Today. */
export default function Plan() {
  const client = useSyncClient();
  const ready = useSyncStatus()?.ready ?? false;
  const version = useStoreVersion();
  const minute = Math.floor(useNow(30_000).getTime() / 60_000);
  const model = useMemo(() => (client && ready ? buildPlan((t) => client.store.rows(t), new Date(minute * 60_000)) : null), [client, ready, version, minute]);
  // The server and the first paint have no store yet. It loads from the phone in a few milliseconds.
  if (!model) return <main aria-busy="true" className="min-h-dvh" />;
  return <PlanScreen m={model} />;
}
```

- [ ] **Step 4: The move sheet stops reloading the server.** In `app/components/MoveSheet.tsx`:

1. Delete the line `import { useRevalidator } from "react-router";`.
2. Change `import { useMutate, useSyncClient } from "~/sync/react";` to `import { useMutate } from "~/sync/react";`.
3. Delete the two lines `const client = useSyncClient();` and `const revalidator = useRevalidator();`.
4. Replace the `move` function with:

```tsx
  async function move(to: string) {
    setBusy(true);
    const ok = await mutate("moveWorkout", { a: anchor.date, b: to });
    setBusy(false);
    if (ok) onClose();
  }
```

The store updates the moment the change runs, so Plan and the workout screen redraw on their own.

- [ ] **Step 5: The v1 groceries server module goes.**

```bash
git rm app/server/groceries.server.ts tests/workers/groceries.test.ts
rg -n "groceries.server|groceryList|setGroceryCheck" app tests
```

Expected from `rg`: nothing.

- [ ] **Step 6: v1's meal helpers in the check-in server module, if nothing else reads them.**

```bash
rg -n "checkin\.server" app tests
```

Look at what each importer takes from `app/server/checkin.server.ts`. P4b removed `checkInData`, and P4a's check-in has its own `mealRepeats` and `rotationMeals` in `app/checkin/meals.ts`. If no importer takes the server module's `mealRepeats` or `rotationMeals`, delete both functions there, then delete each import in that file whose name no longer appears in it. If something still takes them, leave them.

- [ ] **Step 7: Run the touched tests and typecheck.**

```bash
npx vitest run --project unit tests/unit/plan/model.test.ts tests/unit/groceries/model.test.ts tests/unit/workout/model.test.ts
npx vitest run --project workers tests/workers/no-plan.test.ts tests/workers/schedule.test.ts
npm run typecheck
```

Expected: all PASS, no type errors. `no-plan.test.ts` still sends Catherine's `/plan` and `/groceries` to Today: the layout's middleware does that, not the routes.

- [ ] **Step 8: Look.** With `npm run dev` running, open `/plan` at 390 px wide next to the `Plan` artboard:
    - "WEEK 4 / OF 13." (or this week's number), the meta "<Mon> to <Sun> · Phase 1 ends Jan 1".
    - The strip: done weeks ink, this week a red outline and a red number, week 8 hatched, week 12 tinted, week 13 an ink outline with the flag. The legend under it names Nov 23, Dec 21 and Jan 1.
    - The targets grid under a 2 px ink rule with its three sublines.
    - THE WEEK: today's row raised, with a 2 px red rule above and a red weekday. Done days carry the ink check.
    - Tap a future workout: the day sheet lists its lifts as "2 × 8 to 12". "Move to another day" opens the move sheet; pick a day and both rows change at once, with no reload.
    - The groceries card at the bottom reads "<n> of <m> checked off" and opens Groceries, whose back button returns to Plan.

- [ ] **Step 9: Commit.**

```bash
git add app/plan/PlanScreen.tsx app/plan/DaySheet.tsx app/routes/plan.tsx app/components/MoveSheet.tsx
git add app/server/checkin.server.ts   # only if Step 6 changed it
git commit -m "Plan reads the phone's copy: the phase strip, the targets, the week, and the day sheet; v1 groceries server code goes"
```

(`git rm` in Step 5 already staged the deletions.)

---

### Task 6: Next-week swaps go

Their last reader was v1 groceries (`parseSwaps`). The check-in (P4b) has no swaps (spec option 4A), and P4a's `previewNextWeek` calls `generateWeek` directly. `swapFits` and `MealSwap` stay: the meal screen and `swapMeal` use them.

**Files:**
- Modify: `app/domain/next-week.ts`, any caller that passes `swaps`
- Test: `tests/unit/domain/next-week.test.ts`

- [ ] **Step 1: Change the test first.** Replace `tests/unit/domain/next-week.test.ts` with:

```ts
import { describe, expect, it } from 'vitest';
import { previewWeek, swapFits } from '~/domain/next-week';
import type { RotationMeal } from '~/domain/rotation';

const meals: RotationMeal[] = [
  ...['b1', 'b2', 'b3'].map((slug) => ({ slug, pool: 'breakfast' as const, mode: 'any' as const, tags: [] })),
  ...['m1', 'm2', 'm3', 'm4', 'm5'].map((slug) => ({ slug, pool: 'main' as const, mode: 'any' as const, tags: [] })),
  { slug: 'w1', pool: 'main', mode: 'weekend', tags: [] },
  ...['s1', 's2', 's3'].map((slug) => ({ slug, pool: 'snack' as const, mode: 'any' as const, tags: [] })),
  ...['d1', 'd2', 'd3'].map((slug) => ({ slug, pool: 'dessert' as const, mode: 'any' as const, tags: [] })),
];

describe('swapFits', () => {
  it('needs the same pool, a mode that fits the day, and a meal that is not resting', () => {
    expect(swapFits({ date: '2026-10-20', slot: 'lunch', slug: 'm2' }, meals, [])).toBe(true);
    expect(swapFits({ date: '2026-10-20', slot: 'lunch', slug: 'b1' }, meals, [])).toBe(false);
    expect(swapFits({ date: '2026-10-20', slot: 'dinner', slug: 'w1' }, meals, [])).toBe(false);
    expect(swapFits({ date: '2026-10-24', slot: 'dinner', slug: 'w1' }, meals, [])).toBe(true);
    expect(swapFits({ date: '2026-10-20', slot: 'lunch', slug: 'm2' }, meals, ['m2'])).toBe(false);
  });
});

describe('previewWeek', () => {
  const base = { weekStart: '2026-10-19', meals, lastEaten: {}, rested: [] as string[] };

  it('fills 35 slots and leaves out rested meals', () => {
    expect(previewWeek(base)).toHaveLength(35);
    expect(previewWeek({ ...base, rested: ['m1'] }).map((p) => p.slug)).not.toContain('m1');
  });
});
```

- [ ] **Step 2: Run it.**

```bash
npx vitest run --project unit tests/unit/domain/next-week.test.ts
```

Expected: PASS already (the swap tests are gone, and an absent `swaps` field is fine at run time). The type check in Step 5 is what proves the field is gone.

- [ ] **Step 3: Remove the swaps.** In `app/domain/next-week.ts`:

1. Change the types import to `import { slotPool, type ISODate, type Pool, type Slot } from './types';` (`SLOTS` was only for `parseSwaps`).
2. Delete the `swaps: MealSwap[];` line from `NextWeekInput`.
3. Replace `previewWeek` with:

```ts
/**
 * Next week's plan as the check-in shows it: the rotation with the chosen rests.
 * Pure so the check-in page can redraw it in the browser as the rest switches change.
 */
export function previewWeek(input: NextWeekInput): PlannedMeal[] {
  return generateWeek({ weekStart: input.weekStart, meals: input.meals, lastEaten: input.lastEaten, rested: input.rested });
}
```

4. Delete `encodeSwap` and `parseSwaps`, with their doc comment.

- [ ] **Step 4: Drop `swaps` from every caller, and `previewWeek` if it has none.**

```bash
rg -n "swaps: \[|encodeSwap|parseSwaps" app tests
rg -n "previewWeek|NextWeekInput" app tests
```

From the first: delete the `swaps` line in any hit (a `swaps: []` P4b passes to `previewWeek`, if it calls it). Run it again: nothing.

From the second: if the only hits are in `app/domain/next-week.ts` and its test, nothing calls `previewWeek` any more. Delete `previewWeek` and `NextWeekInput` from `next-week.ts`, the `describe('previewWeek')` block from the test, `previewWeek` from the test's import, and the `generateWeek` and `PlannedMeal` imports if nothing else in the file uses them.

- [ ] **Step 5: Run the callers' tests and typecheck.**

```bash
npx vitest run --project unit tests/unit/domain/next-week.test.ts tests/unit/groceries/model.test.ts tests/unit/checkin
npm run typecheck
```

Expected: PASS, no type errors. (`tests/unit/checkin` holds P4a's and P4b's check-in tests.)

- [ ] **Step 6: Commit.** Stage `next-week.ts`, its test, and each file Step 4 changed:

```bash
git add app/domain/next-week.ts tests/unit/domain/next-week.test.ts
git add <each other file Step 4 changed>
git commit -m "Next-week swaps go: encodeSwap, parseSwaps and previewWeek's swaps had no reader left"
```

---

### Task 7: Look at both screens against the mocks

- [ ] **Step 1: Sign in locally** with a temporary password, as N2's Task 11 did. Save the hash, swap it, and put it back in Step 5:

```bash
npx wrangler d1 execute rocky-core --local --command "select password_hash from users where name_key = 'kameron'"
npx tsx -e 'import("./app/server/password.ts").then(async (m) => console.log(await m.hashPassword("local-look-check")))'
npx wrangler d1 execute rocky-core --local --command "update users set password_hash = '<hash printed above>' where name_key = 'kameron'"
```

- [ ] **Step 2: Compare at 390 x 844** with `npm run dev` running, side by side with the artboards:
1. **`Plan`:** the poster at 64 to 68 px, the strip cells 40 px tall with their numbers under them, the legend swatches, the targets grid's 2 px ink rule and 1 px dividers, THE WEEK's 58 px rows with 42 px weekday labels, the raised today row, and the 1.5 px ink outline groceries card with the cart icon.
2. **Option 5A:** the 44 px circles, the 20 px grams with a small "g", "About 14 eggs" and "Cooked weight" sublines, each aisle's "n of m".
3. Red appears only on today's row and weekday, this week's strip cell and the focus ring.
4. Run F3's contrast snippet on both screens. Expected: `all text passes`.

- [ ] **Step 3: Offline.** In DevTools go offline and reload `/plan`, then `/groceries`. Both open from the phone's copy. Check a grocery item: "Saving 1 change... (offline)" shows at the top. Go back online and it clears.

- [ ] **Step 4: Commit any fixes** from this task, with a message naming what was fixed.

- [ ] **Step 5: Put the password back.**

```bash
npx wrangler d1 execute rocky-core --local --command "update users set password_hash = '<saved hash>' where name_key = 'kameron'"
```

---

### Task 8: Full suite, and ship

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

### Task 9: Verify on the wire

- [ ] **Step 1: The new Plan is live.** Find the plan route's chunk and its imports through the manifest linked from the login page, and grep them for strings only the new build has:

```bash
BASE=https://kampduh.com
MANIFEST=$(curl -s $BASE/login | grep -o '/assets/manifest-[A-Za-z0-9_-]*\.js' | head -1); echo "$MANIFEST"
curl -s "$BASE$MANIFEST" | grep -o '"routes/plan":{[^}]*' | grep -o '/assets/[A-Za-z0-9_.-]*\.js' | sort -u | while read -r f; do curl -s "$BASE$f"; done \
  | grep -oE "checked off|The week|Grocery list" | sort | uniq -c
```

Expected: "checked off" and "The week" at least once each, and no "Grocery list" (v1's card). If the new strings are missing, the deploy hasn't landed: check Task 8 Step 3 again.

- [ ] **Step 2: The new Groceries is live.**

```bash
curl -s "$BASE$MANIFEST" | grep -o '"routes/groceries":{[^}]*' | grep -o '/assets/[A-Za-z0-9_.-]*\.js' | sort -u | while read -r f; do curl -s "$BASE$f"; done \
  | grep -oE "in the cart|Everything for the week" | sort | uniq -c
```

Expected: "in the cart" at least once, and no "Everything for the week" (v1's intro line).

- [ ] **Step 3: Report.** One or two sentences to Kameron: P4c is live, and P4d (`docs/superpowers/plans/2026-10-28-p4d-progress-library.md`) is next.
