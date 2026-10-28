# N2: The Meal Screens and the Close-out Implementation Plan

> **For agentic workers:** implement this plan task-by-task with the `executing-plans` skill. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every meal tap runs on the phone, and days start closing out so N3's engine has tracked days to read:
- **The Meal screen is rebuilt on the phone's copy.** Today's slot (Ate it, Skipped it, Swap, Cooking for, a batch, a leftover portion) and browse mode ("Have it for dinner tonight").
- **The close-out.** A sheet that asks about unmarked meals at 9:15pm, and once the next morning, plus the reminder that opens it.
- **Skipped meals** collapse to one line on Today.
- **Usual orders** sit first in "Ate something else".
- **The v1 meal route's actions and the offline queue go.** Only the photo upload still talks to the server.
- **A server gap from N1 is closed.** An offline swap or batch no longer stops its week's plan being generated.

**Architecture:**
- **Pure reading rules.**
    - `app/today/slots.ts` works out a day's five meals at that day's grams and how each was answered. Today, the close-out and the Meal screen all read it.
    - `app/today/closeout.ts` and `app/today/usuals.ts` add the close-out rows, the Save label and the usual-order list.
    - `app/content/was.ts` holds the "Was" line: the last target change in 7 days and its reason.
    - `app/meal/model.ts` builds everything the Meal screen shows.
- **Writes are N1's named changes.** `logMeal`, `skipMeal`, `unlogMeal`, `closeOutDay`, `swapMeal`, `startBatch`, `logOffPlan` with `usualId`, `logUsual`, `removeUsual`. No mutator changes in N2.
- **`/meal/:slug` has no loader**, like Today and `/workout`. Its one action takes the photo upload to R2.
- **One server change:** `processPush` generates the week before it applies `swapMeal` or `startBatch`.

**Tech Stack:** React Router 8.4 (framework mode, SSR on), the F2 sync layer and N1 mutators, Tailwind 4 with the F3 tokens, Vitest 4 (unit project for pure modules, workers project for D1).

**Spec:** `docs/superpowers/specs/2026-10-27-nutrition-design.md` (section 2 "Scaled meals" and "The 'Was' line", section 3 "Close-out reminder", section 4 "Today", "Meal", "Library" and "Ate something else", section 5, rollout step 2, Testing). **N1 plan:** `docs/superpowers/plans/2026-10-27-n1-nutrition-data.md`. **Branch:** `v2/n2-meal-screens`, from `main` at `3ee246b` (N1 merged and live). This plan is committed there.

**Mocks:**
- Artboards `MealOne`, `MealBatch`, `MealLeftover`, `MealSwap` and `Corner2Lunch` on https://claude.ai/artifact/65WeReuGH5ZageJng9K6nq.
- The options board https://claude.ai/artifact/1yW7smtJTuSnjXQUCjdo9q. Picked: 1C (close-out sheet), 2A (quiet skip, "Have it for dinner" from the Library), 3A (usual orders first). 4A, the check-in call block, is N3 and not in this plan.
- The N2 states board, https://claude.ai/artifact/MYV7M9EruYxnzrhdyedbXV, for the four states neither mock drew. Picked: A in all four bands.
- **Design system:** `docs/design/system.md`. Where it and a mock disagree on looks, the mock wins, except the colour rules.

**There are no migrations in N2.** Every table and column it uses landed in N1.

## Questions for Kameron (answered Oct 28: option A in every band, and the recommendation on the other three)

1. **Four states the mocks don't show.** The N2 states board (https://claude.ai/artifact/MYV7M9EruYxnzrhdyedbXV) renders each with 2 or 3 options, using Wednesday Oct 28's real meals at the 2,300 grams.
    - **Recommendation:** A in every band.
        - **After Ate it or Skipped it:** the dock reads "Eaten at 2:04pm" or "Skipped", with a quiet Undo. A skipped meal on Today is one muted line with "Skipped" where "Eaten" goes.
        - **A meal with a photo:** the photo fills the same 170 px box the mock gives "Add a photo", with a small camera button to change it.
        - **The off-plan form:** Category is a select under "Something new". "All 8 usuals" is a quiet link under the first five. A long press swaps that row's Log for an outline Remove.
        - **A resting meal in browse mode:** "Resting to Nov 24" sits under the meta line, and there is no dock.
    - If you pick another option in a band, only that band's component code changes (Task 8 or Task 9).
2. **Which slot "Have it for…" offers.** The spec says the next open slot of the meal's pool "whose time hasn't passed". Read literally, at 6:45pm with lunch still unmarked it offers "Have it for lunch today", because dinner's 6:30 has passed.
    - **Recommendation:** use the window Today already uses for its "next" row: a slot stays current until the next slot starts. At 6:45pm that is dinner, until dessert at 8:00pm. Only after that does it fall back to the first open slot.
    - **The literal way:** a slot drops out the minute its time passes.
3. **The 9:15pm close-out push on a holiday.** Today the reminder code silences every push on a holiday (Thanksgiving, Christmas) except the Sunday check-in.
    - **Recommendation:** keep that. No close-out push on a holiday. The next morning's sheet still asks about it once.
    - **The other way:** let the close-out through on holidays, because a relaxed day is still a tracked day for the engine.
4. **A meal that is already on today's plan, opened from the Library.** Browse mode would offer "Have it for dinner tonight. Replaces honey-glazed chicken thighs", when it is the thighs.
    - **Recommendation:** a meal on today's plan always opens as its slot (Ate it, Swap, Cooking for), wherever the link came from. Back still returns to the Library. Browse mode is for meals not on today's plan, as the spec's heading says.
    - **The other way:** browse mode from the Library always, with no dock when the meal is already planned today.

## Calls made in this plan (flag them in the PR)

- **No loader for `/meal/:slug`.** The spec says a `clientLoader` with `hydrate = true`. Today and `/workout` were built without a loader instead, reading the store through hooks, and that is what works with no signal. A loader would make offline navigation to a meal fail. The server renders an empty `aria-busy` page. An unknown slug shows "Not in the library."
- **The week is generated before `swapMeal` and `startBatch` land on the server** (Task 1). With "Always" on a week the phone had never seen, the server rests whatever meal the generator put in that slot. The phone showed the fallback meal there, so the rested meal can differ from the one on screen. That needs an offline Monday plus "Always", so it is left as is.
- **Close-out:**
    - **The quiet link** shows from dessert's time (8:00pm) while any slot is unmarked, even if nothing was logged.
    - **The morning sheet** asks once per day per phone. The day is saved in `localStorage` under `rocky-closeout-asked`, with an in-memory fallback when storage is blocked.
    - **The push's `?closeout=today`** is removed from the URL once the sheet opens, so a reload doesn't reopen it.
    - **The Save label with one row** reads "Save: eaten" or "Save: skipped". The spec only covers two or more.
    - **The reminder body is singular for one meal:** "1 meal isn't marked. One tap closes out today."
- **Meal screen:**
    - **State labels.** "Raw" and "Cooked" show only on protein and flex foods, where the state changes what you weigh. Fruit and vegetables show only their note: "On the side", as `MealOne` has it, not "Raw, on the side".
    - **Batch sublines follow the spec's rule:** "Raw, 220 g a portion", "Cooked, 175 g a portion", "9 g a portion", "100 g a portion, on the side". The mock's "cook it all at once" and "add when you eat" are left out.
    - **Batch totals use v1's portion rounding,** so 9 g of butter times 3 is 25 g.
    - **After Save, Cooking for hides,** because the batch is cooked. The meta then reads "Lunch for Wed, Thu, Fri · 605 cal each", as `MealBatch` does. The dock reads "ATE TODAY'S PORTION" while portions are above 1.
    - **The later-days line names only days the batch planned.** A Saturday batch of 3 says "Sunday lunch will say…". Monday is next week, which `startBatch` leaves alone. With no later day, the line is left out.
    - **Leftover:**
        - Only the main protein row says "from the batch", as the spec says. The mock also labels the rice.
        - There are no Steps on a leftover day, as `MealLeftover` has it.
        - The closing line is the spec's "One portion left for Friday." without the mock's "Reheat 2 minutes, add the butter, eat."
    - **No "Was" line on a batch portion.** Its grams are the batch's, not the day's.
    - **The "Was" reason's weekday** is the day before the change: "Sunday's check-in" for a Monday change. The week after maintenance reads "Maintenance week is over, so rice and butter come back down." That copy is new, since the spec has no line for it.
    - **Swap shows only while the slot is unmarked.** `swapMeal` refuses an eaten slot.
    - **Ate it stays on the Meal screen.** The dock turns into "Eaten at 2:04pm" with Undo, as the spec says. v1 went back to Today.
    - **The photo shows in every state.** `MealBatch` and `MealLeftover` leave it out, which reads as cropping to fit the frame.
    - **The dock button is 60 px,** as the meal mocks draw it. The system says 64 in the gym.
- **Usual orders:** a row with 0 g protein leaves the protein out ("100 cal · drink"), as mock 3A does. Ties in uses go to the most recently used, then the name.
- **The off-plan sheet keeps its Done button.** Mock 3A shows none, but the sheet is long and the backdrop above it is a thin strip.
- **The new sheets have no grab bar.** The mocks draw one, but the sheets don't drag.
- **The old offline queue is dropped.** A v1 "Ate it" still waiting in a phone's `localStorage` queue at deploy is lost. The queue drains within 15 seconds of signal, so only a phone offline across the deploy loses one.
- **v1 code that stays, with no app caller after N2:** `logPlannedMeal`, `createBatch` and `openBatch` in `meals.server.ts`, because worker tests seed history with them. `swapPlanned` goes, with its two tests, because the `swapMeal` mutator tests cover the same rules. `mainProtein` moves to `app/meal/model.ts`.
- **The Library doesn't change.** N1 already shows scaled calories on its rows, and its link (`/meal/<slug>?from=library`) has no `slot`, so it opens browse mode.

---

## Ground rules

- Everything from the earlier plans applies:
    - No em dashes in code, copy, commits or docs.
    - No `Co-Authored-By` lines.
    - Look with `npm run dev`.
    - One full `npm run typecheck && npm test` at the end. During tasks, run only the files named in the step.
    - Token colours only. Red only for the primary action and live state.
    - Kameron reviews and merges. The build session does not merge.
- `app/today/*`, `app/meal/*`, `app/content/*`, `app/domain/*` and `app/ui/*` must not import `cloudflare:workers` or any `*.server.ts`. They run in the browser.
- Store rows are raw D1 rows: snake_case, booleans `0`/`1`, JSON columns as strings.
- Unit test dates use Chicago daylight time (`-05:00`), so they stay before November 1, 2026.

## Files

| File | Responsibility |
|---|---|
| `app/sync/push.server.ts` | Generates the week before `swapMeal` or `startBatch` applies |
| `app/today/slots.ts` (new) | A day's five meals at the day's grams, eaten or skipped; targets from the store; day and slot names |
| `app/today/closeout.ts` (new) | Today's and yesterday's unmarked meals; the Save label |
| `app/today/usuals.ts` (new) | Usual orders in the order the sheet lists them |
| `app/today/model.ts` | Reads slots from `slots.ts`; skipped slots; `closeOut` and `usuals` |
| `app/today/CloseOutSheet.tsx`, `app/today/OffPlanSheet.tsx` (new) | The two Today sheets |
| `app/routes/today.tsx` | Skipped rows, the close-out link and sheet, the new off-plan sheet |
| `app/content/was.ts` (new) | The "Was" line: the latest target change in 7 days, and its reason |
| `app/meal/model.ts` (new) | `buildMeal`, `scaleRows`, `batchMeta`, `mainProtein` |
| `app/meal/MealScreen.tsx`, `MealSwapSheet.tsx`, `BatchCard.tsx`, `PhotoBox.tsx` (new) | The Meal screen |
| `app/ui/JoinedChoice.tsx` (new) | The meal mocks' joined choice control |
| `app/components/Sheet.tsx` | A `dismiss` prop: Done, Cancel or nothing |
| `app/routes/meal.tsx` | Full rewrite: no loader, a photo-only action |
| `app/domain/reminders.ts`, `app/server/reminders.server.ts` | The close-out reminder |
| `app/components/PendingSync.tsx` | Reads only the sync status |
| `app/lib/offline-queue.ts` | Deleted |
| `app/server/meals.server.ts`, `app/server/meal-plan.server.ts` | `mainProtein` and `swapPlanned` removed |

---

### Task 1: The server generates the week before a planned meal lands in it

The N1 review found this. `swapMeal` and `startBatch` write `planned_meals` rows. `ensureWeekPlan` treats a week with any row as generated. So a swap made offline on a Monday, before the phone ever pulled that week, lands one row, and the week is never generated: every other day falls back to the first meal of each pool.

**Files:**
- Modify: `app/sync/push.server.ts`
- Test: `tests/workers/sync-push.test.ts`

- [ ] **Step 1: Write the failing tests.** In `tests/workers/sync-push.test.ts`, add `import { addDays } from "~/domain/dates";` to the imports. Add this helper under `const now = ...`:

```ts
const plannedWeek = async (monday: string) =>
  (
    await env.DB.prepare("SELECT date, slot, meal_slug, swapped FROM planned_meals WHERE date BETWEEN ? AND ? ORDER BY date, slot")
      .bind(monday, addDays(monday, 6))
      .all<{ date: string; slot: string; meal_slug: string; swapped: number }>()
  ).results;
```

Add these two tests inside the `describe`:

```ts
  // Weeks no other test here generates. Nov 16 and Nov 23 are Mondays, and each push lands on that Monday at noon.
  it("generates the week before an offline swap lands in it, so the other days keep their plan", async () => {
    const monday = "2026-11-16";
    const res = await processPush(
      env.DB,
      { clientId: "phone-week-swap", mutations: [{ id: 1, name: "swapMeal", args: { date: monday, slot: "dinner", mealSlug: "steak-and-baked-potato", always: false } }] },
      new Date("2026-11-16T18:00:00Z"),
    );
    expect(res.rejected).toEqual([]);
    const week = await plannedWeek(monday);
    expect(week).toHaveLength(35);
    expect(week.filter((r) => r.swapped === 1)).toEqual([{ date: monday, slot: "dinner", meal_slug: "steak-and-baked-potato", swapped: 1 }]);
  });

  it("generates the week before an offline batch plans its later days", async () => {
    const monday = "2026-11-23";
    const res = await processPush(
      env.DB,
      {
        clientId: "phone-week-batch",
        mutations: [{ id: 1, name: "startBatch", args: { clientId: "b-week", date: monday, slot: "lunch", mealSlug: "chicken-and-rice-bowl", portions: 3, cookedWeightG: 495 } }],
      },
      new Date("2026-11-23T18:00:00Z"),
    );
    expect(res.rejected).toEqual([]);
    const week = await plannedWeek(monday);
    expect(week).toHaveLength(35);
    expect(week.filter((r) => r.swapped === 1).map((r) => [r.date, r.slot, r.meal_slug])).toEqual([
      ["2026-11-24", "lunch", "chicken-and-rice-bowl"],
      ["2026-11-25", "lunch", "chicken-and-rice-bowl"],
    ]);
  });
```

- [ ] **Step 2: Run them to make sure they fail.**

```bash
npx vitest run --project workers tests/workers/sync-push.test.ts
```

Expected: the two new tests FAIL. The swap week has 1 row, not 35, and the batch week has 2. This is the bug: nothing generated those weeks. The other push tests pass.

- [ ] **Step 3: Generate the week first.** In `app/sync/push.server.ts`:

1. Replace the imports with:

```ts
import { z } from "zod";
import { getDb } from "~/db/client";
import { daysBetween, isISODate, localDate, weekStart } from "~/domain/dates";
import { ensureWeekPlan } from "~/server/meal-plan.server";
import { MutationRejected, runMutation, type MutationContext } from "./mutators";
import { ServerTx, StorageError } from "./server-tx.server";
```

2. Add above `processPush`:

```ts
// These write planned_meals rows. ensureWeekPlan takes a week with any row as generated, so a row landing in a week
// nobody has opened yet would stop the rest of it being planned. Generate the week first.
const WRITES_PLANNED_MEALS = new Set(["swapMeal", "startBatch"]);

async function generateWeekFirst(d1: D1Database, name: string, args: unknown, ctx: MutationContext): Promise<void> {
  if (!WRITES_PLANNED_MEALS.has(name)) return;
  const date = (args as { date?: unknown } | null)?.date;
  // A date the change refuses anyway (malformed, or past tomorrow) generates nothing.
  if (!isISODate(date) || daysBetween(ctx.today, date) > 1) return;
  try {
    await ensureWeekPlan(getDb(d1), weekStart(date));
  } catch (err) {
    throw new StorageError(String(err));
  }
}
```

3. In the loop, change:

```ts
    if (m.id <= last) continue;
    const tx = new ServerTx(d1);
```

to:

```ts
    if (m.id <= last) continue;
    await generateWeekFirst(d1, m.name, m.args, ctx);
    const tx = new ServerTx(d1);
```

- [ ] **Step 4: Run the push tests.** Same command as Step 2. Expected: PASS, the N1 batch test included. It now generates the week of Nov 2 before planning Nov 4.

- [ ] **Step 5: Commit.**

```bash
git add app/sync/push.server.ts tests/workers/sync-push.test.ts
git commit -m "Generate the week before an offline swap or batch lands in it"
```

---

### Task 2: A day's slots, read once, with skips answered

**Files:**
- Create: `app/today/slots.ts`
- Modify: `app/today/model.ts`
- Test: `tests/unit/today/model.test.ts`

- [ ] **Step 1: Write the failing test.** Add to `tests/unit/today/model.test.ts`, inside the `describe`:

```ts
  it("answers a skipped slot, so the poster and the list move on to the next meal", () => {
    const skip: Row = { id: null, client_id: "s-1", date: WED, slot: "lunch", meal_slug: null, name: "Lunch", category: "skipped", kcal: 0, protein_g: 0, relaxed: 0, portions: 1, logged_at: `${WED}T19:00:00Z` };
    const m = asPlan(buildToday(rowsOf({ planned_meals: planned(WED), meal_logs: [ate(WED, "breakfast", 1, `${WED}T12:40:00Z`), skip] }), at(WED, "14:30"), true));
    expect(m.slots.find((s) => s.slot === "lunch")).toMatchObject({ logKey: null, skipKey: "s-1", next: false });
    expect(m.slots.find((s) => s.next)?.slot).toBe("snack");
    expect(m.next).toEqual({ kind: "meal", slot: "snack" });
  });
```

At 2:30pm the noon workout's window has closed, and lunch's window runs until the 3:30 snack, so without the skip lunch would still be next.

- [ ] **Step 2: Run it to make sure it fails.**

```bash
npx vitest run --project unit tests/unit/today/model.test.ts
```

Expected: the new test FAILS. `skipKey` is undefined and lunch is still next.

- [ ] **Step 3: Create `app/today/slots.ts`:**

```ts
// A day's five planned meals at that day's grams, and how each was answered. Today, the close-out and the meal screen
// all read it, so they never disagree about what was planned. Pure: the browser and the unit tests both run it.
import { meals, plan, type MealWithMacros } from "~/content";
import { factorFor, scaledMeal } from "~/content/scaled";
import { resolveTargets, type TargetEntry, type Targets } from "~/content/targets";
import { dayMode } from "~/domain/calendar";
import { parseTime } from "~/domain/dates";
import { SLOTS, slotPool, type ISODate, type Slot } from "~/domain/types";
import { keyOf } from "~/sync/tables";
import type { Rows } from "~/workout/sessions";

export type { Rows };

export const SLOT_LABEL: Record<Slot, string> = { breakfast: "Breakfast", lunch: "Lunch", snack: "Snack", dinner: "Dinner", dessert: "Dessert" };
export const DAY_NAME = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function shortClock(minutes: number): string {
  const h24 = Math.floor(minutes / 60) % 24;
  return `${h24 % 12 === 0 ? 12 : h24 % 12}:${String(minutes % 60).padStart(2, "0")}`;
}

export function targetEntries(rows: Rows): TargetEntry[] {
  return rows("targets")
    .map((r) => ({ effectiveFrom: r.effective_from as string, kcal: Number(r.kcal), proteinG: Number(r.protein_g), stepGoal: Number(r.step_goal) }))
    .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
}

export function targetsOn(rows: Rows, date: ISODate): Targets {
  return resolveTargets(targetEntries(rows), date);
}

export function restedOn(rows: Rows, date: ISODate): Set<string> {
  return new Set(rows("meal_state").filter((r) => typeof r.rested_until === "string" && (r.rested_until as string) >= date).map((r) => r.slug as string));
}

/** The same rule as plannedForDate's fallback: the first meal of the slot's pool that fits the day and isn't resting. */
function fallbackMeal(slot: Slot, date: ISODate, rested: Set<string>): MealWithMacros {
  const mode = dayMode(date);
  const pick = [...meals.values()].find((m) => m.pool === slotPool(slot) && (m.mode === "any" || mode === "weekend") && !rested.has(m.slug));
  if (!pick) throw new Error(`No meal for ${slot}`);
  return pick;
}

export interface DaySlot {
  slot: Slot;
  /** "2:00", as the mock's list shows it. */
  time: string;
  minutes: number;
  meal: MealWithMacros;
  /** The store key of the log that ate it, or null. */
  logKey: string | null;
  /** The store key of the skip that answered it, or null. */
  skipKey: string | null;
  /** When it was eaten, from its log. */
  loggedAt: string | null;
}

export function daySlots(rows: Rows, date: ISODate, factor = factorFor(targetsOn(rows, date).kcal)): DaySlot[] {
  const rested = restedOn(rows, date);
  const planned = new Map(rows("planned_meals").filter((r) => r.date === date).map((r) => [r.slot as string, r.meal_slug as string]));
  const logs = rows("meal_logs").filter((r) => r.date === date);
  return SLOTS.map((slot) => {
    const at = parseTime(plan.slotTimes[slot]);
    const eaten = logs.find((l) => l.slot === slot && l.category === "planned");
    const skip = logs.find((l) => l.slot === slot && l.category === "skipped");
    return {
      slot,
      time: shortClock(at),
      minutes: at,
      meal: scaledMeal(meals.get(planned.get(slot) ?? "") ?? fallbackMeal(slot, date, rested), factor),
      logKey: eaten ? keyOf("meal_logs", eaten) : null,
      skipKey: skip ? keyOf("meal_logs", skip) : null,
      loggedAt: eaten ? (eaten.logged_at as string) : null,
    };
  });
}
```

- [ ] **Step 4: Point `app/today/model.ts` at it.**

1. Replace the import block (from `import { exercises, foods, meals, ...` through `import { doneDates, ... } from "~/workout/sessions";`) and the `export type { Rows };` line with:

```ts
import { exercises, foods, messages, plan, type MealWithMacros } from "~/content";
import { factorFor } from "~/content/scaled";
import type { Targets } from "~/content/targets";
import { dayMode, isRelaxedDay, isTrainingDay, optionalTemplateFor, setsFor, templateFor, weekNumber, weekType, type Moves } from "~/domain/calendar";
import { checkInWindow } from "~/domain/checkin";
import { addDays, formatClock, localDate, localMinutes, mealDate, weekStart, weekday } from "~/domain/dates";
import { countedDay, dessertAllowance, fullDay, habitStreak, overAllowanceDates, type DayActivity } from "~/domain/habits";
import { pickSituation, renderMessage } from "~/domain/messages";
import { nextUp, type NextUp } from "~/domain/next-up";
import { nextSuggestion } from "~/domain/progression";
import type { ISODate } from "~/domain/types";
import { sevenDayAverage } from "~/domain/weight";
import { keyOf, type Row } from "~/sync/tables";
import { resolveLifts, titleLines, workoutMinutes, workoutTitle } from "~/workout/lifts";
import { doneDates, lastSession, loggedDates, sessionKey, type Rows } from "~/workout/sessions";
import { DAY_NAME, daySlots, targetsOn, type DaySlot } from "./slots";

export type { Rows };
export { SLOT_LABEL, shortClock } from "./slots";
```

2. Delete the local `const DAY_NAME = [...]` line, the `export const SLOT_LABEL = ...` line, the `shortClock` function and the `fallbackMeal` function. `DOW`, `MONTH`, `MONTH_SHORT` and `WEEKS` stay.

3. Replace the `SlotModel` interface with:

```ts
export interface SlotModel extends DaySlot {
  /** The meal "Ate it" is for in the list. */
  next: boolean;
}
```

4. In `buildToday`, replace everything from `const targets = resolveTargets(` through `const slots: SlotModel[] = base.map((x, i) => ({ ...x, next: i === nextIndex }));` with:

```ts
  const targets = targetsOn(rows, date);
  const relaxed = isRelaxedDay(plan, date);

  const todayLogs = mealLogs.filter((r) => r.date === date).sort((a, b) => s(a, "logged_at").localeCompare(s(b, "logged_at")));
  const base = daySlots(rows, date, factorFor(targets.kcal));
  const answered = (x: DaySlot) => x.logKey !== null || x.skipKey !== null;
  // "Next" in the list: the first unanswered meal whose window (until the next slot begins) is still open.
  const nextIndex = base.findIndex((x, i) => !answered(x) && minutes < (base[i + 1]?.minutes ?? 27 * 60));
  const slots: SlotModel[] = base.map((x, i) => ({ ...x, next: i === nextIndex }));
```

5. In the `nextUp({ ... })` call, change `slots: slots.map((x) => ({ slot: x.slot, minutes: x.minutes, eaten: x.logKey !== null })),` to:

```ts
    slots: slots.map((x) => ({ slot: x.slot, minutes: x.minutes, eaten: answered(x) })),
```

- [ ] **Step 5: Run Today's model test.** Same command as Step 2. Expected: PASS, every existing test included.

- [ ] **Step 6: Typecheck.** `npm run typecheck`. Expected: no errors. `today.tsx` still imports `SLOT_LABEL` from `~/today/model`, which re-exports it.

- [ ] **Step 7: Commit.**

```bash
git add app/today/slots.ts app/today/model.ts tests/unit/today/model.test.ts
git commit -m "One reading of a day's meals for Today and the meal screen; a skip answers its slot"
```

---

### Task 3: Close-out rows, the Save label, and usual orders

**Files:**
- Create: `app/today/closeout.ts`, `app/today/usuals.ts`
- Modify: `app/today/model.ts`
- Test: `tests/unit/today/closeout.test.ts`, `tests/unit/today/model.test.ts`

- [ ] **Step 1: Write the failing tests.**

1. Create `tests/unit/today/closeout.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { closeOutLabel } from "~/today/closeout";
import { usualOrders } from "~/today/usuals";

describe("closeOutLabel", () => {
  it("names the mix of eaten and skipped", () => {
    expect(closeOutLabel(2, 0)).toBe("Save: both eaten");
    expect(closeOutLabel(3, 0)).toBe("Save: all 3 eaten");
    expect(closeOutLabel(2, 1)).toBe("Save: 2 eaten, 1 skipped");
    expect(closeOutLabel(0, 2)).toBe("Save: all skipped");
    expect(closeOutLabel(1, 0)).toBe("Save: eaten");
    expect(closeOutLabel(0, 1)).toBe("Save: skipped");
  });
});

describe("usualOrders", () => {
  it("lists the most used first, then the latest, and leaves out zero protein", () => {
    const rows = [
      { client_id: "usual-ranch-water", name: "Ranch Water", category: "drink", kcal: 100, protein_g: 0, relaxed: 0, uses: 2, last_used_at: "2026-10-20T01:00:00Z" },
      { client_id: "u-1", name: "Chipotle bowl, double chicken", category: "meal", kcal: 1050, protein_g: 75, relaxed: 1, uses: 2, last_used_at: "2026-10-27T18:00:00Z" },
      { client_id: "usual-restaurant-meal", name: "Restaurant meal", category: "meal", kcal: 900, protein_g: 50, relaxed: 1, uses: 0, last_used_at: null },
    ];
    expect(usualOrders(rows)).toEqual([
      { key: "u-1", name: "Chipotle bowl, double chicken", sub: "1,050 cal · 75 g · relaxed" },
      { key: "usual-ranch-water", name: "Ranch Water", sub: "100 cal · drink" },
      { key: "usual-restaurant-meal", name: "Restaurant meal", sub: "900 cal · 50 g · relaxed" },
    ]);
  });
});
```

2. Add to `tests/unit/today/model.test.ts`, inside the `describe`:

```ts
  it("offers to close out today after dessert's time while a meal is unmarked", () => {
    const logs = [ate(WED, "breakfast", 1, `${WED}T12:40:00Z`), ate(WED, "lunch", 2, `${WED}T19:10:00Z`)];
    const evening = asPlan(buildToday(rowsOf({ planned_meals: planned(WED), meal_logs: logs }), at(WED, "21:15"), true));
    const dinner = meals.get(SLUGS.dinner)!;
    expect(evening.closeOut.link).toBe(true);
    expect(evening.closeOut.today?.title).toBe("Close out Wednesday");
    expect(evening.closeOut.today?.rows.map((r) => r.slot)).toEqual(["snack", "dinner", "dessert"]);
    expect(evening.closeOut.today?.rows[1]).toEqual({ slot: "dinner", mealSlug: dinner.slug, name: dinner.name, sub: `Dinner · ${dinner.kcal} cal · ${dinner.protein} g` });
    expect(asPlan(buildToday(rowsOf({ planned_meals: planned(WED), meal_logs: logs }), at(WED, "19:00"), true)).closeOut.link).toBe(false);
  });

  it("asks about yesterday only while it is half answered", () => {
    const TUE = "2026-10-27";
    const ask = (meal_logs: Row[]) => asPlan(buildToday(rowsOf({ planned_meals: [...planned(TUE), ...planned(WED)], meal_logs }), at(WED, "07:10"), true)).closeOut.yesterday;
    const half = ask([ate(TUE, "breakfast", 1, `${TUE}T12:40:00Z`)]);
    expect(half).toMatchObject({ date: TUE, title: "Close out yesterday" });
    expect(half?.rows).toHaveLength(4);
    expect(ask([])).toBeNull();
    expect(ask(["breakfast", "lunch", "snack", "dinner", "dessert"].map((slot, i) => ate(TUE, slot, i + 1, `${TUE}T1${i}:00:00Z`)))).toBeNull();
  });

  it("lists usual orders, most used first", () => {
    const usual = (client_id: string, name: string, uses: number, last_used_at: string | null): Row => ({ client_id, name, category: "meal", kcal: 900, protein_g: 50, relaxed: 1, uses, last_used_at, created_at: "2026-10-27T00:00:00Z" });
    const m = asPlan(buildToday(rowsOf({ planned_meals: planned(WED), usual_orders: [usual("a", "Restaurant meal", 0, null), usual("b", "Chipotle bowl", 3, `${WED}T18:00:00Z`)] }), at(WED, "12:00"), true));
    expect(m.usuals.map((u) => u.name)).toEqual(["Chipotle bowl", "Restaurant meal"]);
  });
```

- [ ] **Step 2: Run them to make sure they fail.**

```bash
npx vitest run --project unit tests/unit/today/closeout.test.ts tests/unit/today/model.test.ts
```

Expected: `closeout.test.ts` FAILS with "Failed to load url ~/today/closeout". The three new model tests FAIL on `closeOut` and `usuals` being undefined.

- [ ] **Step 3: Create `app/today/closeout.ts`:**

```ts
// Closing out a day: every meal not yet marked, asked about at bedtime and once the next morning (option 1C).
import { dayCompleteness } from "~/domain/completeness";
import { addDays, weekday } from "~/domain/dates";
import type { ISODate, Slot } from "~/domain/types";
import { DAY_NAME, daySlots, SLOT_LABEL, type DaySlot, type Rows } from "./slots";

export interface CloseOutRow {
  slot: Slot;
  mealSlug: string;
  name: string;
  /** "Dinner · 570 cal · 54 g" */
  sub: string;
}

export interface CloseOutModel {
  date: ISODate;
  title: string;
  rows: CloseOutRow[];
}

function unmarked(slots: DaySlot[]): CloseOutRow[] {
  return slots
    .filter((s) => s.logKey === null && s.skipKey === null)
    .map((s) => ({ slot: s.slot, mealSlug: s.meal.slug, name: s.meal.name, sub: `${SLOT_LABEL[s.slot]} · ${s.meal.kcal} cal · ${s.meal.protein} g` }));
}

/** Today while a meal is unmarked, and yesterday while it is half answered. A day with nothing logged is never asked about. */
export function closeOutDays(rows: Rows, today: ISODate, todaySlots: DaySlot[]): { today: CloseOutModel | null; yesterday: CloseOutModel | null } {
  const todayRows = unmarked(todaySlots);
  const y = addDays(today, -1);
  const yLogs = rows("meal_logs")
    .filter((r) => r.date === y)
    .map((r) => ({ slot: (r.slot as string | null) ?? null, category: r.category as string }));
  return {
    today: todayRows.length ? { date: today, title: `Close out ${DAY_NAME[weekday(today)]}`, rows: todayRows } : null,
    yesterday: dayCompleteness(yLogs) === "partial" ? { date: y, title: "Close out yesterday", rows: unmarked(daySlots(rows, y)) } : null,
  };
}

/** The red button says what Save will record. */
export function closeOutLabel(eaten: number, skipped: number): string {
  const total = eaten + skipped;
  if (skipped === 0) return total === 1 ? "Save: eaten" : total === 2 ? "Save: both eaten" : `Save: all ${total} eaten`;
  if (eaten === 0) return total === 1 ? "Save: skipped" : "Save: all skipped";
  return `Save: ${eaten} eaten, ${skipped} skipped`;
}
```

- [ ] **Step 4: Create `app/today/usuals.ts`:**

```ts
// Usual orders: off-plan entries saved for one-tap logging, most used first (option 3A).
import { keyOf, type Row } from "~/sync/tables";

/** The sheet shows this many, then "All <n> usuals". */
export const USUALS_SHOWN = 5;

export interface UsualModel {
  key: string;
  name: string;
  /** "1,050 cal · 75 g · relaxed", or "100 cal · drink" with no protein. */
  sub: string;
}

export function usualOrders(rows: Row[]): UsualModel[] {
  return [...rows]
    .sort(
      (a, b) =>
        Number(b.uses ?? 0) - Number(a.uses ?? 0) ||
        String(b.last_used_at ?? "").localeCompare(String(a.last_used_at ?? "")) ||
        String(a.name).localeCompare(String(b.name)),
    )
    .map((u) => ({
      key: keyOf("usual_orders", u),
      name: u.name as string,
      sub: [`${Number(u.kcal).toLocaleString("en-US")} cal`, Number(u.protein_g) > 0 ? `${u.protein_g} g` : null, u.relaxed ? "relaxed" : (u.category as string)].filter(Boolean).join(" · "),
    }));
}
```

- [ ] **Step 5: Add them to the Today model.** In `app/today/model.ts`:

1. Add to the imports:

```ts
import { closeOutDays, type CloseOutModel } from "./closeout";
import { usualOrders, type UsualModel } from "./usuals";
```

2. Add to `PlanToday`, after `trendLine: string | null;`:

```ts
  /** Today's and yesterday's unmarked meals, and whether the quiet "Close out today" link shows. */
  closeOut: { today: CloseOutModel | null; yesterday: CloseOutModel | null; link: boolean };
  usuals: UsualModel[];
```

3. In the returned object, after `trendLine: ...,` add:

```ts
    // The link shows from dessert's time while any slot is unmarked.
    closeOut: { ...closeOutDays(rows, date, base), link: minutes >= base[base.length - 1].minutes && base.some((x) => !answered(x)) },
    usuals: usualOrders(rows("usual_orders")),
```

- [ ] **Step 6: Run them.** Same command as Step 2. Expected: PASS.

- [ ] **Step 7: Commit.**

```bash
git add app/today/closeout.ts app/today/usuals.ts app/today/model.ts tests/unit/today/closeout.test.ts tests/unit/today/model.test.ts
git commit -m "Close-out rows for today and a half-answered yesterday; usual orders, most used first"
```

---

### Task 4: The "Was" line

N1 built the grams, not the line that explains them. Before N3 the target only moves in a maintenance week, but N3's first call relies on this line.

**Files:**
- Create: `app/content/was.ts`
- Test: `tests/unit/was.test.ts`

- [ ] **Step 1: Write the failing test.** Create `tests/unit/was.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { recentTargetChange, wasReason, type TargetChange } from "~/content/was";

// Sunday Oct 25's check-in trimmed 100 cal a day from Monday Oct 26.
const cut = [{ effectiveFrom: "2026-10-26", kcal: 2300, proteinG: 180, stepGoal: 8500 }];

describe("recentTargetChange", () => {
  it("finds a change for the 7 days from the day it lands", () => {
    expect(recentTargetChange(cut, "2026-10-26")).toEqual({ on: "2026-10-26", fromKcal: 2400, toKcal: 2300, maintenance: null });
    expect(recentTargetChange(cut, "2026-11-01")?.on).toBe("2026-10-26");
    expect(recentTargetChange(cut, "2026-11-02")).toBeNull();
    expect(recentTargetChange([], "2026-10-28")).toBeNull();
  });

  it("tells a maintenance week from a check-in", () => {
    // Week 12 (maintenance) starts Monday Dec 21, and week 13 on Dec 28.
    expect(recentTargetChange([], "2026-12-21")).toEqual({ on: "2026-12-21", fromKcal: 2400, toKcal: 2800, maintenance: "start" });
    expect(recentTargetChange([], "2026-12-28")).toEqual({ on: "2026-12-28", fromKcal: 2800, toKcal: 2400, maintenance: "end" });
  });
});

describe("wasReason", () => {
  const trim: TargetChange = { on: "2026-10-26", fromKcal: 2400, toKcal: 2300, maintenance: null };

  it("names the check-in and at most two of the flex foods that moved", () => {
    expect(wasReason(trim, ["white-rice-cooked", "honey"])).toBe("Sunday's check-in trimmed 100 cal a day, so rice and honey took the cut.");
    expect(wasReason(trim, ["potato-russet-raw", "butter", "olive-oil"])).toBe("Sunday's check-in trimmed 100 cal a day, so potato and butter took the cut.");
    expect(wasReason({ ...trim, fromKcal: 2300, toKcal: 2450 }, ["white-rice-cooked"])).toBe("Sunday's check-in added 150 cal a day, so rice goes up.");
  });

  it("explains a maintenance week and its end", () => {
    expect(wasReason({ on: "2026-12-21", fromKcal: 2400, toKcal: 2800, maintenance: "start" }, ["white-rice-cooked", "butter"])).toBe("Maintenance week adds 400 cal a day, so rice and butter go up.");
    expect(wasReason({ on: "2026-12-28", fromKcal: 2800, toKcal: 2400, maintenance: "end" }, ["honey"])).toBe("Maintenance week is over, so honey comes back down.");
  });
});
```

- [ ] **Step 2: Run it to make sure it fails.**

```bash
npx vitest run --project unit tests/unit/was.test.ts
```

Expected: FAIL, "Failed to load url ~/content/was".

- [ ] **Step 3: Implement it.** Create `app/content/was.ts`:

```ts
// The "Was" line: for 7 days after the calorie target moves, a flex food shows what it weighed before, and the meal
// screen says why. Spec section 2.
import { weekType } from "~/domain/calendar";
import { addDays, weekday } from "~/domain/dates";
import type { ISODate } from "~/domain/types";
import { foods, plan } from "./index";
import { resolveTargets, type TargetEntry } from "./targets";

export const WAS_DAYS = 7;

export interface TargetChange {
  /** The first day of the new target. */
  on: ISODate;
  fromKcal: number;
  toKcal: number;
  /** A maintenance week starting or ending, rather than a check-in. */
  maintenance: "start" | "end" | null;
}

/** The latest change to the day's calorie target in the 7 days up to and including `date`. */
export function recentTargetChange(entries: TargetEntry[], date: ISODate): TargetChange | null {
  const maintenance = (d: ISODate) => weekType(plan, d) === "maintenance";
  for (let i = 0; i < WAS_DAYS; i++) {
    const on = addDays(date, -i);
    const before = addDays(on, -1);
    const toKcal = resolveTargets(entries, on).kcal;
    const fromKcal = resolveTargets(entries, before).kcal;
    if (toKcal === fromKcal) continue;
    return { on, fromKcal, toKcal, maintenance: maintenance(on) && !maintenance(before) ? "start" : !maintenance(on) && maintenance(before) ? "end" : null };
  }
  return null;
}

const SHORT: Record<string, string> = { "white-rice-cooked": "rice", "potato-russet-raw": "potato", "sweet-potato-raw": "sweet potato" };

/** How a flex food is named in a sentence: "rice", "potato", "honey". */
export function flexName(foodId: string): string {
  return SHORT[foodId] ?? foods.get(foodId)!.name.toLowerCase();
}

const DAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Why the grams moved, naming at most two of the meal's flex foods that changed. */
export function wasReason(change: TargetChange, foodIds: string[]): string {
  const names = [...new Set(foodIds.map(flexName))].slice(0, 2);
  const what = names.join(" and ");
  const many = names.length > 1;
  const n = Math.abs(change.toKcal - change.fromKcal).toLocaleString("en-US");
  if (change.maintenance === "start") return `Maintenance week adds ${n} cal a day, so ${what} ${many ? "go" : "goes"} up.`;
  if (change.maintenance === "end") return `Maintenance week is over, so ${what} ${many ? "come" : "comes"} back down.`;
  // Targets change on the Monday after the Sunday check-in.
  const checkIn = `${DAY[weekday(addDays(change.on, -1))]}'s check-in`;
  return change.toKcal < change.fromKcal
    ? `${checkIn} trimmed ${n} cal a day, so ${what} took the cut.`
    : `${checkIn} added ${n} cal a day, so ${what} ${many ? "go" : "goes"} up.`;
}
```

- [ ] **Step 4: Run it.** Same command as Step 2. Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add app/content/was.ts tests/unit/was.test.ts
git commit -m "The Was line: last week's grams and why they moved"
```

---

### Task 5: The meal model

Wednesday Oct 28 is the mocks' day: steak and eggs, chicken and rice bowl, Greek yogurt and berries, honey-glazed chicken thighs, protein ice cream. At 2,300 the bowl is 605 cal and 55 g, with rice 175 g and butter 9 g. At 2,300 and 460 cal per open slot, lemon butter cod (545 cal, 59 g) is the best fit for lunch, and salmon and rice (585 cal, 44 g) is 11 g short of the bowl.

**Files:**
- Create: `app/meal/model.ts`
- Test: `tests/unit/meal/model.test.ts`

- [ ] **Step 1: Write the failing test.** Create `tests/unit/meal/model.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { meals } from "~/content";
import { factorFor, scaledMeal } from "~/content/scaled";
import { batchMeta, buildMeal, mainProtein, scaleRows } from "~/meal/model";
import type { Row } from "~/sync/tables";

const WED = "2026-10-28";
const THU = "2026-10-29";
const FRI = "2026-10-30";
const BOWL = "chicken-and-rice-bowl";
const STEAK = "steak-and-baked-potato";
const at = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00-05:00`);
const rowsOf = (t: Record<string, Row[]>) => (name: string) => t[name] ?? [];
const DAY = { breakfast: "steak-and-eggs", lunch: BOWL, snack: "greek-yogurt-and-berries", dinner: "honey-glazed-chicken-thighs", dessert: "protein-ice-cream" };
const planned = (date: string): Row[] => Object.entries(DAY).map(([slot, meal_slug]) => ({ date, slot, meal_slug, swapped: 0 }));
// Sunday's check-in trimmed 100 cal a day from Monday Oct 26.
const trimmed: Row[] = [{ effective_from: "2026-10-26", kcal: 2300, protein_g: 180, step_goal: 8500 }];
const log = (slot: keyof typeof DAY, category: "planned" | "skipped", client_id: string, logged_at: string): Row => ({
  id: null, client_id, date: WED, slot, meal_slug: category === "planned" ? DAY[slot] : null, name: "x", category, kcal: category === "planned" ? 600 : 0, protein_g: 0, relaxed: 0, portions: 1, logged_at,
});
const batch = (o: Row): Row => ({ id: null, client_id: "b-1", meal_slug: BOWL, portions: 3, cooked_weight_g: 495, portion_g: 165, created_on: WED, portions_left: 3, factor: 1, ...o });
const lunch = (rows: Record<string, Row[]>, hhmm = "13:00", date = WED) => buildMeal(rowsOf(rows), at(date, hhmm), { slug: BOWL, slot: "lunch" })!;

describe("buildMeal", () => {
  it("opens today's lunch at the trimmed grams, with what rice and butter weighed before", () => {
    const m = lunch({ planned_meals: planned(WED), targets: trimmed });
    expect(m).toMatchObject({ mode: "today", slot: "lunch", state: "open", canCook: true, meta: "Lunch · 2:00 · 605 cal · 55 g protein" });
    expect(m.meal).toEqual(scaledMeal(meals.get(BOWL)!, factorFor(2300)));
    expect(scaleRows(m, 1).map((r) => [r.name, r.sub, r.grams, r.was])).toEqual([
      ["Chicken breast", "Raw", 220, null],
      ["White rice", "Cooked", 175, "Was 200."],
      ["Butter", null, 9, "Was 10."],
      ["Pineapple", "On the side", 100, null],
    ]);
    expect(m.wasNote).toBe("Sunday's check-in trimmed 100 cal a day, so rice and butter took the cut.");
  });

  it("weighs the whole batch, with a portion's worth in each subline", () => {
    const m = lunch({ planned_meals: planned(WED), targets: trimmed });
    expect(batchMeta(m, 3)).toBe("Lunch for Wed, Thu, Fri · 605 cal each");
    expect(scaleRows(m, 3).map((r) => [r.sub, r.grams, r.was])).toEqual([
      ["Raw, 220 g a portion", 660, null],
      ["Cooked, 175 g a portion", 525, "Was 600."],
      ["9 g a portion", 25, "Was 30."],
      ["100 g a portion, on the side", 300, null],
    ]);
  });

  it("shows when it was eaten, or that it was skipped, with the key Undo removes", () => {
    const eaten = lunch({ planned_meals: planned(WED), meal_logs: [log("lunch", "planned", "m-1", "2026-10-28T19:04:00Z")] }, "14:30");
    expect(eaten).toMatchObject({ state: "eaten", eatenAt: "2:04pm", logKey: "m-1", canCook: false, swaps: [] });
    const skipped = lunch({ planned_meals: planned(WED), meal_logs: [log("lunch", "skipped", "s-1", "2026-10-28T19:04:00Z")] }, "14:30");
    expect(skipped).toMatchObject({ state: "skipped", eatenAt: null, logKey: "s-1", canCook: false });
  });

  it("offers swaps that fit the slot and the day, best fit first, flagging the ones short on protein", () => {
    const m = lunch({ planned_meals: planned(WED), targets: trimmed });
    expect(m.swaps[0]).toMatchObject({ slug: "lemon-butter-cod-and-potatoes", kcal: 545, protein: 59, best: true, lowProtein: false });
    expect(m.swaps.find((o) => o.slug === "salmon-and-rice")).toMatchObject({ kcal: 585, protein: 44, best: false, lowProtein: true });
    expect(m.swaps.map((o) => o.slug)).not.toContain(BOWL);
    // Weekends only.
    expect(m.swaps.map((o) => o.slug)).not.toContain("chicken-fajita-bowl");
  });

  it("opens a meal on today's plan as its slot, even without one in the link", () => {
    const m = buildMeal(rowsOf({ planned_meals: planned(WED) }), at(WED, "13:00"), { slug: "honey-glazed-chicken-thighs", slot: null })!;
    expect(m).toMatchObject({ mode: "today", slot: "dinner" });
  });

  it("browses any other meal, offering the pool's slot that is still current", () => {
    const browse = (hhmm: string, meal_logs: Row[] = []) => buildMeal(rowsOf({ planned_meals: planned(WED), targets: trimmed, meal_logs }), at(WED, hhmm), { slug: STEAK, slot: null })!;
    const noon = browse("13:00");
    expect(noon).toMatchObject({ mode: "browse", slot: null, meta: "Lunch or dinner · 590 cal · 60 g protein", swaps: [], canCook: false, wasNote: null });
    expect(noon.haveIt).toEqual({ slot: "lunch", label: "Have it for lunch today", then: "Replaces chicken and rice bowl, just today." });
    expect(scaleRows(noon, 1).find((r) => r.name === "Russet potatoes")).toMatchObject({ sub: "Raw, was 300", grams: 260, was: null });
    // Lunch's window closed at the 3:30 snack, so dinner is current until dessert at 8:00.
    expect(browse("17:00").haveIt).toEqual({ slot: "dinner", label: "Have it for dinner tonight", then: "Replaces honey-glazed chicken thighs, just today." });
    expect(browse("21:00", [log("lunch", "planned", "m-1", "2026-10-28T19:04:00Z"), log("dinner", "skipped", "s-1", "2026-10-29T01:00:00Z")]).haveIt).toBeNull();
  });

  it("offers nothing for a resting meal or one that doesn't fit the day", () => {
    const resting = buildMeal(rowsOf({ planned_meals: planned(WED), meal_state: [{ slug: STEAK, photo_key: null, rested_until: "2026-11-24" }] }), at(WED, "13:00"), { slug: STEAK, slot: null })!;
    expect(resting).toMatchObject({ mode: "browse", restingUntil: "Nov 24", haveIt: null });
    expect(buildMeal(rowsOf({ planned_meals: planned(WED) }), at(WED, "13:00"), { slug: "chicken-fajita-bowl", slot: null })!.haveIt).toBeNull();
  });

  it("after a batch is saved, gives each portion and the days it planned", () => {
    const m = lunch({ planned_meals: [...planned(WED), ...planned(THU), ...planned(FRI)], batches: [batch({})] });
    expect(m).toMatchObject({ canCook: false, leftover: null, todayBatch: { portions: 3, portionG: 165, laterDays: ["Thursday", "Friday"] } });
  });

  it("the next day, weighs the cooked protein from the batch, at the grams the batch was cooked at", () => {
    const m = lunch({ planned_meals: planned(THU), targets: trimmed, batches: [batch({ portions_left: 2 })] }, "13:00", THU);
    expect(m.meal).toEqual(meals.get(BOWL));
    expect(m).toMatchObject({
      canCook: false,
      todayBatch: null,
      wasNote: null,
      meta: "Thursday lunch · portion 2 of 3 from Wednesday's batch",
      leftover: { portion: 2, portions: 3, cookedOn: "Wednesday", closing: "One portion left for Friday." },
    });
    expect(scaleRows(m, 1)[0]).toEqual({ food: "chicken-breast-raw", name: "Chicken breast, from the batch", sub: "Cooked, a third of 495 g", grams: 165, was: null, highlight: true });
    const last = lunch({ planned_meals: planned(FRI), batches: [batch({ portions_left: 1 })] }, "13:00", FRI);
    expect(last.leftover).toMatchObject({ portion: 3, closing: "Last portion." });
  });

  it("knows no meal it doesn't have, and finds each meal's main protein", () => {
    expect(buildMeal(rowsOf({}), at(WED, "13:00"), { slug: "nope", slot: null })).toBeNull();
    expect(mainProtein(meals.get(BOWL)!).food).toBe("chicken-breast-raw");
    expect(mainProtein(meals.get("egg-and-potato-hash")!).food).toBe("egg-white");
  });
});
```

- [ ] **Step 2: Run it to make sure it fails.**

```bash
npx vitest run --project unit tests/unit/meal/model.test.ts
```

Expected: FAIL, "Failed to load url ~/meal/model".

- [ ] **Step 3: Implement it.** Create `app/meal/model.ts`:

```ts
// Everything the meal screen shows, worked out from the phone's copy. Pure: the browser and the unit tests both run it.
import { foods, meals, type MealWithMacros } from "~/content";
import { factorFor, scaledMeal } from "~/content/scaled";
import { resolveTargets } from "~/content/targets";
import { recentTargetChange, wasReason, type TargetChange } from "~/content/was";
import { dayMode } from "~/domain/calendar";
import { addDays, formatClock, localDate, localMinutes, mealDate, weekday } from "~/domain/dates";
import { scaleGrams } from "~/domain/macros";
import { swapFits } from "~/domain/next-week";
import { scaleIngredient } from "~/domain/rescale";
import type { RotationMeal } from "~/domain/rotation";
import { slotPool, type ISODate, type Pool, type Slot } from "~/domain/types";
import type { Row } from "~/sync/tables";
import { DAY_NAME, daySlots, restedOn, SLOT_LABEL, targetEntries, type Rows } from "~/today/slots";

export type MealMode = "today" | "browse";
export type SlotState = "open" | "eaten" | "skipped";

const POOL_LABEL: Record<Pool, string> = { breakfast: "Breakfast", main: "Lunch or dinner", snack: "Snack", dessert: "Dessert" };
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export interface ScaleItem {
  food: string;
  name: string;
  /** "Raw" or "Cooked" on protein and flex foods, where the state changes what you weigh. */
  state: string | null;
  /** Grams for one portion. */
  grams: number;
  note: string | null;
  eachG: number | null;
  eachLabel: string | null;
  /** One portion's grams under the previous target, for the 7 days after it moved. Null when unchanged. */
  wasG: number | null;
}

export interface LeftoverModel {
  portion: number;
  portions: number;
  /** The weekday the batch was cooked. */
  cookedOn: string;
  portionG: number;
  cookedWeightG: number;
  closing: string;
}

export interface SwapOption {
  slug: string;
  name: string;
  kcal: number;
  protein: number;
  best: boolean;
  /** 10 g or more under the meal it replaces. */
  lowProtein: boolean;
}

export interface MealModel {
  mode: MealMode;
  date: ISODate;
  /** At the grams shown: the day's, or the batch's. */
  meal: MealWithMacros;
  slot: Slot | null;
  meta: string;
  /** Always "open" in browse mode. */
  state: SlotState;
  /** "2:04pm" */
  eatenAt: string | null;
  /** The eaten or skipped log, for Undo. */
  logKey: string | null;
  items: ScaleItem[];
  /** Why the grams moved, on the first changed row. Today's slot only. */
  wasNote: string | null;
  mainProtein: { food: string; name: string };
  /** "Cooking for" shows: today's slot, unmarked, with no batch open. */
  canCook: boolean;
  /** A batch of this meal cooked today. */
  todayBatch: { portions: number; portionG: number; laterDays: string[] } | null;
  /** Today's portion comes from a batch cooked on an earlier day. */
  leftover: LeftoverModel | null;
  swaps: SwapOption[];
  /** Browse mode's "Have it for…" dock. */
  haveIt: { slot: Slot; label: string; then: string } | null;
  /** "Nov 24", browse mode only. */
  restingUntil: string | null;
  photoKey: string | null;
  steps: string[];
}

export interface ScaleRow {
  food: string;
  name: string;
  sub: string | null;
  grams: number;
  /** "Was 200." on today's slot. Browse mode folds it into the subline instead. */
  was: string | null;
  /** The batch's protein on a leftover day. */
  highlight: boolean;
}

/** The ingredient carrying the most protein: the one a batch weighs after cooking. */
export function mainProtein(meal: MealWithMacros) {
  let best = meal.ingredients[0];
  let bestProtein = -1;
  for (const ing of meal.ingredients) {
    const p = (ing.grams / 100) * (foods.get(ing.food)?.proteinPer100 ?? 0);
    if (p > bestProtein) {
      best = ing;
      bestProtein = p;
    }
  }
  return best;
}

const monthDay = (d: ISODate) => `${MONTH[Number(d.slice(5, 7)) - 1]} ${Number(d.slice(8, 10))}`;
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const rotationMeals = (): RotationMeal[] => [...meals.values()].map((m) => ({ slug: m.slug, pool: m.pool, mode: m.mode, tags: m.tags }));

/** Same rule as the logMeal change: the newest batch of this meal with portions left, cooked up to 3 days ago. */
function openBatch(rows: Rows, slug: string, date: ISODate): Row | undefined {
  // A batch started on this phone has no id until the server numbers it, so it sorts as the newest.
  const order = (b: Row) => (b.id as number | null | undefined) ?? Number.MAX_SAFE_INTEGER;
  return rows("batches")
    .filter((b) => b.meal_slug === slug && Number(b.portions_left) > 0 && (b.created_on as string) >= addDays(date, -3) && (b.created_on as string) <= date)
    .sort((x, y) => (y.created_on as string).localeCompare(x.created_on as string) || order(y) - order(x))[0];
}

function scaleItems(meal: MealWithMacros, raw: MealWithMacros, change: TargetChange | null): ScaleItem[] {
  const before = change ? factorFor(change.fromKcal) : null;
  return meal.ingredients.map((i, n) => {
    const f = foods.get(i.food)!;
    const was = before === null ? null : scaleIngredient(raw.ingredients[n].grams, f.role, before);
    return {
      food: i.food,
      name: f.name,
      state: f.role !== "fixed" && f.state !== "as-is" ? capital(f.state) : null,
      grams: i.grams,
      note: i.note ?? null,
      eachG: f.eachG ?? null,
      eachLabel: f.eachLabel ?? null,
      wasG: was !== null && was !== i.grams ? was : null,
    };
  });
}

/** v1's fit order on scaled numbers: closest to what's left per open slot, with protein counting double. */
function swapOptions(rows: Rows, date: ISODate, slot: Slot, current: MealWithMacros, factor: number, perSlot: number): SwapOption[] {
  const rested = [...restedOn(rows, date)];
  const list = rotationMeals();
  const fit = (m: MealWithMacros) => Math.abs(m.kcal - perSlot) - 2 * m.protein;
  return [...meals.values()]
    .filter((m) => m.slug !== current.slug && swapFits({ date, slot, slug: m.slug }, list, rested))
    .map((m) => scaledMeal(m, factor))
    .sort((a, b) => fit(a) - fit(b))
    .map((m, i) => ({ slug: m.slug, name: m.name, kcal: m.kcal, protein: m.protein, best: i === 0, lowProtein: m.protein <= current.protein - 10 }));
}

export function buildMeal(rows: Rows, now: Date, p: { slug: string; slot: string | null }): MealModel | null {
  const raw = meals.get(p.slug);
  if (!raw) return null;
  const date = mealDate(now);
  const minutes = localMinutes(now) + (localDate(now) === date ? 0 : 24 * 60);
  const entries = targetEntries(rows);
  const targets = resolveTargets(entries, date);
  const factor = factorFor(targets.kcal);
  const slots = daySlots(rows, date, factor);
  const change = recentTargetChange(entries, date);
  // A meal on today's plan opens as its slot, wherever the link came from.
  const own = slots.find((s) => s.slot === p.slot) ?? slots.find((s) => s.meal.slug === raw.slug);
  const photoOf = (slug: string) => (rows("meal_state").find((r) => r.slug === slug)?.photo_key as string | null | undefined) ?? null;

  if (own) {
    const state: SlotState = own.logKey ? "eaten" : own.skipKey ? "skipped" : "open";
    const plannedRaw = meals.get(own.meal.slug)!;
    const batch = state === "open" ? openBatch(rows, plannedRaw.slug, date) : undefined;
    const meal = batch ? scaledMeal(plannedRaw, Number(batch.factor ?? 1)) : own.meal;
    const main = mainProtein(meal);
    const portions = Number(batch?.portions ?? 1);
    const left = Number(batch?.portions_left ?? 0) - 1;
    const leftover: LeftoverModel | null =
      batch && (batch.created_on as string) < date
        ? {
            portion: portions - left,
            portions,
            cookedOn: DAY_NAME[weekday(batch.created_on as string)],
            portionG: Number(batch.portion_g),
            cookedWeightG: Number(batch.cooked_weight_g),
            closing: left === 0 ? "Last portion." : left === 1 ? `One portion left for ${DAY_NAME[weekday(addDays(date, 1))]}.` : `${left} portions left.`,
          }
        : null;
    const todayBatch =
      batch && batch.created_on === date
        ? {
            portions,
            portionG: Number(batch.portion_g),
            laterDays: Array.from({ length: portions - 1 }, (_, i) => addDays(date, i + 1))
              .filter((d) => rows("planned_meals").some((r) => r.date === d && r.slot === own.slot && r.meal_slug === meal.slug))
              .map((d) => DAY_NAME[weekday(d)]),
          }
        : null;
    // A batch portion keeps the grams it was cooked at, so there is nothing to explain.
    const items = scaleItems(meal, plannedRaw, batch ? null : change);
    const moved = items.filter((i) => i.wasG !== null).map((i) => i.food);
    const open = slots.filter((x) => x.logKey === null && x.skipKey === null).length || 1;
    const eatenKcal = rows("meal_logs")
      .filter((l) => l.date === date)
      .reduce((sum, l) => sum + Number(l.kcal ?? 0), 0);
    return {
      mode: "today",
      date,
      meal,
      slot: own.slot,
      meta: leftover
        ? `${DAY_NAME[weekday(date)]} ${own.slot} · portion ${leftover.portion} of ${portions} from ${leftover.cookedOn}'s batch`
        : `${SLOT_LABEL[own.slot]} · ${own.time} · ${meal.kcal} cal · ${meal.protein} g protein`,
      state,
      eatenAt: own.loggedAt ? formatClock(localMinutes(new Date(own.loggedAt))) : null,
      logKey: own.logKey ?? own.skipKey,
      items,
      wasNote: change && moved.length ? wasReason(change, moved) : null,
      mainProtein: { food: main.food, name: foods.get(main.food)!.name },
      canCook: state === "open" && !batch,
      todayBatch,
      leftover,
      swaps: state === "open" ? swapOptions(rows, date, own.slot, meal, factor, (targets.kcal - eatenKcal) / open) : [],
      haveIt: null,
      restingUntil: null,
      photoKey: photoOf(meal.slug),
      steps: meal.steps,
    };
  }

  const meal = scaledMeal(raw, factor);
  const main = mainProtein(meal);
  const rest = rows("meal_state").find((r) => r.slug === raw.slug && typeof r.rested_until === "string" && (r.rested_until as string) >= date);
  const restingUntil = rest ? monthDay(rest.rested_until as string) : null;
  const fitsToday = raw.mode === "any" || dayMode(date) === "weekend";
  const open = slots.filter((x) => x.logKey === null && x.skipKey === null && slotPool(x.slot) === raw.pool);
  // The pool's slot that is still current (until the next slot begins, as Today's "next" row), else its first open one.
  const pick = open.find((x) => minutes < (slots[slots.indexOf(x) + 1]?.minutes ?? 27 * 60)) ?? open[0];
  return {
    mode: "browse",
    date,
    meal,
    slot: null,
    meta: `${POOL_LABEL[raw.pool]} · ${meal.kcal} cal · ${meal.protein} g protein`,
    state: "open",
    eatenAt: null,
    logKey: null,
    items: scaleItems(meal, raw, change),
    wasNote: null,
    mainProtein: { food: main.food, name: foods.get(main.food)!.name },
    canCook: false,
    todayBatch: null,
    leftover: null,
    swaps: [],
    haveIt:
      pick && fitsToday && !restingUntil
        ? { slot: pick.slot, label: pick.slot === "dinner" ? "Have it for dinner tonight" : `Have it for ${pick.slot} today`, then: `Replaces ${pick.meal.name.toLowerCase()}, just today.` }
        : null,
    restingUntil,
    photoKey: photoOf(raw.slug),
    steps: meal.steps,
  };
}

/** What goes on the scale for `portions` portions. A leftover day weighs the batch's cooked protein instead. */
export function scaleRows(m: MealModel, portions: number): ScaleRow[] {
  return m.items.map((i) => {
    if (m.leftover && i.food === m.mainProtein.food) {
      const share = m.leftover.portions === 3 ? "a third" : "half";
      return { food: i.food, name: `${i.name}, from the batch`, sub: `Cooked, ${share} of ${m.leftover.cookedWeightG} g`, grams: m.leftover.portionG, was: null, highlight: true };
    }
    const grams = scaleGrams(i.grams, portions);
    const wasG = i.wasG === null ? null : scaleGrams(i.wasG, portions);
    const each = i.eachG && i.eachLabel ? Math.round(grams / i.eachG) : null;
    const parts = [
      i.state,
      portions > 1 ? `${i.grams} g a portion` : null,
      i.note,
      each ? `about ${each} ${i.eachLabel}${each === 1 ? "" : "s"}` : null,
      m.mode === "browse" && wasG !== null ? `was ${wasG}` : null,
    ].filter((x): x is string => Boolean(x));
    return {
      food: i.food,
      name: i.name,
      sub: parts.length ? capital(parts.join(", ")) : null,
      grams,
      was: m.mode === "today" && wasG !== null ? `Was ${wasG}.` : null,
      highlight: false,
    };
  });
}

/** The meta line while cooking for more than today: "Lunch for Wed, Thu, Fri · 605 cal each". */
export function batchMeta(m: MealModel, portions: number): string {
  const days = Array.from({ length: portions }, (_, i) => DOW[weekday(addDays(m.date, i))]);
  return `${SLOT_LABEL[m.slot!]} for ${days.join(", ")} · ${m.meal.kcal} cal each`;
}
```

- [ ] **Step 4: Run it.** Same command as Step 2. Expected: PASS. If the swap test finds a different best fit, print `m.swaps.slice(0, 3)`: the expected order comes from 2,300 / 5 = 460 cal per open slot. Check that the test's targets row reached `buildMeal`. Don't change the expected meals.

- [ ] **Step 5: Commit.**

```bash
git add app/meal/model.ts tests/unit/meal/model.test.ts
git commit -m "The meal model: today's slot, browse mode, batches, leftovers and swaps"
```

---

### Task 6: The close-out reminder

**Files:**
- Modify: `app/domain/reminders.ts`, `app/server/reminders.server.ts`
- Test: `tests/unit/domain/reminders.test.ts`, `tests/workers/reminders.test.ts`

- [ ] **Step 1: Write the failing tests.**

1. In `tests/unit/domain/reminders.test.ts`, change the import to `import { DEFAULT_REMINDERS, dueReminders, reminderBody, type ReminderFacts } from '~/domain/reminders';`. Add two fields to `facts`, after `checkInDone: false,`:

```ts
  unmarkedSlots: 5,
  loggedMeal: false,
```

   and add inside the `describe`:

```ts
  it('asks to close out at 9:15pm while a meal is unmarked on a day with something logged', () => {
    const evening = 21 * 60 + 15;
    expect(dueReminders(evening, { ...facts, loggedMeal: true, unmarkedSlots: 2 }, settings, [])).toContain('close-out');
    expect(dueReminders(evening, { ...facts, loggedMeal: false, unmarkedSlots: 5 }, settings, [])).not.toContain('close-out');
    expect(dueReminders(evening, { ...facts, loggedMeal: true, unmarkedSlots: 0 }, settings, [])).not.toContain('close-out');
    expect(reminderBody('close-out', { ...facts, unmarkedSlots: 2 })).toBe("2 meals aren't marked. One tap closes out today.");
    expect(reminderBody('close-out', { ...facts, unmarkedSlots: 1 })).toBe("1 meal isn't marked. One tap closes out today.");
  });
```

2. In `tests/workers/reminders.test.ts`, add `import { meals } from "~/content";` and `import { logPlannedMeal } from "~/server/meals.server";`, and add inside the `describe`:

```ts
  it("asks to close out at 9:15pm, opening the sheet, while meals are unmarked", async () => {
    await logPlannedMeal(db(), "2026-10-20", "lunch", meals.get("chicken-and-rice-bowl")!, new Date());
    const c = collector();
    await runReminders(db(), chicago("2026-10-20", "21:15"), c.send);
    expect(c.sent).toEqual([{ title: "Close out today", body: "4 meals aren't marked. One tap closes out today.", url: "/?closeout=today", tag: "close-out" }]);
  });

  it("doesn't ask to close out a day with nothing logged", async () => {
    const c = collector();
    await runReminders(db(), chicago("2026-10-22", "21:15"), c.send);
    expect(c.sent).toEqual([]);
  });
```

- [ ] **Step 2: Run them to make sure they fail.**

```bash
npx vitest run --project unit tests/unit/domain/reminders.test.ts
npx vitest run --project workers tests/workers/reminders.test.ts
```

Expected: the unit file FAILS on `reminderBody` not being a function, and the new workers test FAILS with nothing sent.

- [ ] **Step 3: Add the reminder.** In `app/domain/reminders.ts` (this file uses single quotes):

1. In `ReminderKind`, add `| 'close-out'` before `| 'check-in';`.
2. Add to `ReminderFacts`, after `checkInDone: boolean;`:

```ts
  /** Today's planned slots not yet eaten or skipped. */
  unmarkedSlots: number;
  /** Anything at all was logged today, planned or not. */
  loggedMeal: boolean;
```

3. In `ReminderDef`, change `body: string;` to `body: string | ((f: ReminderFacts) => string);`.
4. In `DEFAULT_REMINDERS`, add after the `kitchen-closed` entry:

```ts
  {
    kind: 'close-out',
    time: '21:15',
    days: EVERY_DAY,
    when: (f) => f.loggedMeal && f.unmarkedSlots > 0,
    title: 'Close out today',
    body: (f) => `${f.unmarkedSlots} ${f.unmarkedSlots === 1 ? "meal isn't" : "meals aren't"} marked. One tap closes out today.`,
  },
```

5. In `REMINDER_LABEL`, add `'close-out': 'Close out',` after `'kitchen-closed': 'Kitchen closes',`.
6. Add after `reminderDef`:

```ts
export function reminderBody(kind: ReminderKind, facts: ReminderFacts): string {
  const { body } = reminderDef(kind);
  return typeof body === 'string' ? body : body(facts);
}
```

- [ ] **Step 4: Send it from the server.** In `app/server/reminders.server.ts`:

1. Change the reminders import to `import { dueReminders, reminderBody, reminderDef, type ReminderFacts, type ReminderKind } from "~/domain/reminders";` and the types import to `import { SLOTS, type Slot } from "~/domain/types";`.
2. Add `"close-out": "/?closeout=today",` to `URLS`, after `"kitchen-closed": "/",`.
3. Replace the `let due = dueReminders(...)` statement with:

```ts
  // A slot is marked once it is eaten or skipped. Off-plan rows have no slot.
  const marked = new Set(logs.filter((l) => l.category === "planned" || l.category === "skipped").map((l) => l.slot));
  const facts: ReminderFacts = {
    weekday: wd,
    trainingDay: isTrainingDay(plan, date, moves),
    weighedIn: weighIn !== null,
    loggedSlots: logs.filter((l) => l.slot).map((l) => l.slot as Slot),
    sessionStarted: sessions.some((s) => s.startedAt !== null),
    loggedSetToday: setDates.has(date),
    steps,
    stepGoal: targets.stepGoal,
    checkInDone: checkedIn,
    unmarkedSlots: SLOTS.filter((s) => !marked.has(s)).length,
    loggedMeal: logs.length > 0,
  };
  let due = dueReminders(localMinutes(now), facts, settings, sentRows.map((r) => r.kind as ReminderKind));
```

4. In the send loop, change `body: def.body,` to `body: reminderBody(kind, facts),`.

   The holiday filter below stays as it is, so a holiday gets no close-out push (question 3).

- [ ] **Step 5: Run them.** Same commands as Step 2, plus the settings model test, which lists every reminder:

```bash
npx vitest run --project unit tests/unit/domain/reminders.test.ts tests/unit/settings/model.test.ts
npx vitest run --project workers tests/workers/reminders.test.ts tests/workers/scheduled.test.ts
```

Expected: PASS. Settings now lists "Close out · Every day · 9:15pm" with no code change, and `setReminder` accepts the new kind, because both read `DEFAULT_REMINDERS`.

- [ ] **Step 6: Commit.**

```bash
git add app/domain/reminders.ts app/server/reminders.server.ts tests/unit/domain/reminders.test.ts tests/workers/reminders.test.ts
git commit -m "The 9:15pm close-out reminder opens Today's close-out sheet"
```

---

### Task 7: Two kit pieces

**Files:**
- Modify: `app/components/Sheet.tsx`
- Create: `app/ui/JoinedChoice.tsx`

- [ ] **Step 1: Let a sheet say Cancel, or nothing.** Replace `app/components/Sheet.tsx` with:

```tsx
import { useEffect, type ReactNode } from "react";
import { btn } from "~/ui/button";

/**
 * A bottom sheet. Done is the v1 glass button the older sheets keep. The swap sheet's mock has a quiet Cancel, and the
 * close-out sheet closes with its own "Not now".
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  dismiss = "done",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  dismiss?: "done" | "cancel" | "none";
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center min-[900px]:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-ink/50 active:opacity-100" />
      <div className="sheet-panel relative max-h-[85dvh] w-full max-w-[520px] overflow-y-auto rounded-t-[6px] p-5 pb-[max(20px,env(safe-area-inset-bottom))] min-[900px]:rounded-[6px]">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-[28px] uppercase">{title}</h2>
          {dismiss === "done" && (
            <button type="button" onClick={onClose} className="glass h-11 rounded-full px-[18px] text-[15px] font-semibold">
              Done
            </button>
          )}
          {dismiss === "cancel" && (
            <button type="button" onClick={onClose} className={btn.quiet}>
              Cancel
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: The joined choice.** Create `app/ui/JoinedChoice.tsx`:

```tsx
export interface JoinedOption<T> {
  value: T;
  label: string;
}

/** The meal mocks' choice: one 1.5 px ink outline split into parts, the picked part filled ink ("Cooking for", "Just today / Always"). */
export function JoinedChoice<T extends string | number>({
  label,
  choices,
  value,
  onPick,
  height = "h-12",
}: {
  label: string;
  choices: JoinedOption<T>[];
  value: T;
  onPick: (value: T) => void;
  height?: string;
}) {
  return (
    <div role="group" aria-label={label} className="grid overflow-hidden rounded-[6px] border-[1.5px] border-ink" style={{ gridTemplateColumns: `repeat(${choices.length}, minmax(0, 1fr))` }}>
      {choices.map((c, i) => {
        const on = c.value === value;
        return (
          <button
            key={String(c.value)}
            type="button"
            aria-pressed={on}
            onClick={() => onPick(c.value)}
            className={`${height} font-num text-[16px] font-bold ${i > 0 ? "border-l-[1.5px] border-ink" : ""} ${on ? "bg-ink text-paper" : "text-ink"}`}
          >
            {c.label}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: Typecheck.** `npm run typecheck`. Expected: no errors. Every existing `<Sheet>` keeps its Done.

- [ ] **Step 4: Commit.**

```bash
git add app/components/Sheet.tsx app/ui/JoinedChoice.tsx
git commit -m "Sheets can close with Cancel or their own button; the joined choice"
```

---

### Task 8: Today: skipped rows, the close-out sheet, and usual orders

**Files:**
- Create: `app/today/CloseOutSheet.tsx`, `app/today/OffPlanSheet.tsx`
- Modify: `app/routes/today.tsx`

- [ ] **Step 1: The close-out sheet.** Create `app/today/CloseOutSheet.tsx`:

```tsx
import { useState } from "react";
import { Sheet } from "~/components/Sheet";
import { Icon } from "~/components/ui";
import type { Slot } from "~/domain/types";
import { useMutate } from "~/sync/react";
import { btn } from "~/ui/button";
import { closeOutLabel, type CloseOutModel, type CloseOutRow } from "./closeout";

/** Every unmarked meal starts checked, so the usual night is one tap. Un-check the ones you skipped (option 1C). */
export function CloseOutSheet({ day, onClose }: { day: CloseOutModel; onClose: () => void }) {
  const mutate = useMutate();
  const [skipped, setSkipped] = useState<Set<Slot>>(() => new Set());
  const toggle = (slot: Slot) =>
    setSkipped((prev) => {
      const next = new Set(prev);
      if (!next.delete(slot)) next.add(slot);
      return next;
    });
  const entry = (r: CloseOutRow) => ({ clientId: crypto.randomUUID(), slot: r.slot, mealSlug: r.mealSlug });
  function save() {
    // closeOutDay leaves any slot already marked, on this phone or another, as it is.
    void mutate("closeOutDay", { date: day.date, eaten: day.rows.filter((r) => !skipped.has(r.slot)).map(entry), skipped: day.rows.filter((r) => skipped.has(r.slot)).map(entry) });
    onClose();
  }
  return (
    <Sheet open onClose={onClose} title={day.title} dismiss="none">
      <div className="flex flex-col gap-3.5">
        <p className="text-[16px] leading-[1.4] text-ink-2">Tap any you skipped.</p>
        <ul className="flex flex-col">
          {day.rows.map((r) => {
            const ate = !skipped.has(r.slot);
            return (
              <li key={r.slot} className="flex min-h-[60px] items-center gap-3 border-t border-rule last:border-b">
                <span className="flex flex-1 flex-col">
                  <span className={`text-[16px] ${ate ? "" : "text-muted"}`}>{r.name}</span>
                  <span className="text-[14px] tabular-nums text-muted">{ate ? r.sub : "Skipped"}</span>
                </span>
                <button
                  type="button"
                  aria-pressed={ate}
                  aria-label={`${r.name} eaten`}
                  onClick={() => toggle(r.slot)}
                  className={`flex size-11 flex-none items-center justify-center rounded-full ${ate ? "bg-ink text-paper" : "border-[1.5px] border-border"}`}
                >
                  {ate && <Icon name="check" size={18} strokeWidth={3} />}
                </button>
              </li>
            );
          })}
        </ul>
        <button type="button" onClick={save} className={`${btn.primary} h-14`}>
          {closeOutLabel(day.rows.length - skipped.size, skipped.size)}
        </button>
        <div className="flex justify-center">
          <button type="button" onClick={onClose} className={btn.quiet}>
            Not now
          </button>
        </div>
      </div>
    </Sheet>
  );
}
```

- [ ] **Step 2: The off-plan sheet with usual orders.** Create `app/today/OffPlanSheet.tsx` (question 1's band 3, option A):

```tsx
import { useRef, useState } from "react";
import { Sheet } from "~/components/Sheet";
import { Toggle } from "~/components/Toggle";
import { useMutate } from "~/sync/react";
import { btn } from "~/ui/button";
import { USUALS_SHOWN, type UsualModel } from "./usuals";

const FIELD = "h-12 rounded-[6px] border-[1.5px] border-border bg-field px-3 text-[17px] font-normal text-ink";
const LABEL = "flex flex-col gap-1 text-[13px] font-semibold text-ink-3";
const LONG_PRESS_MS = 500;

/** "Ate something else": usual orders first, one tap each, then the form for something new (option 3A). */
export function OffPlanSheet({ date, usuals, onClose }: { date: string; usuals: UsualModel[]; onClose: () => void }) {
  const mutate = useMutate();
  const [all, setAll] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [relaxed, setRelaxed] = useState(false);
  const [saveUsual, setSaveUsual] = useState(false);
  const timer = useRef<number | null>(null);
  // The press that turned Log into Remove must not also tap Remove when the finger lifts.
  const longPressed = useRef(false);
  const shown = all ? usuals : usuals.slice(0, USUALS_SHOWN);

  const release = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };
  // A long press on a usual swaps its Log for Remove, inside the sheet. No browser dialog.
  const press = (key: string) => () => {
    release();
    longPressed.current = false;
    timer.current = window.setTimeout(() => {
      longPressed.current = true;
      setRemoving(key);
    }, LONG_PRESS_MS);
  };
  const tap = (run: () => void) => () => {
    if (longPressed.current) {
      longPressed.current = false;
      return;
    }
    run();
  };

  return (
    <Sheet open onClose={onClose} title="Ate something else">
      <div className="flex flex-col gap-4">
        {usuals.length > 0 && (
          <div className="flex flex-col">
            <ul className="flex flex-col">
              {shown.map((u) => (
                <li
                  key={u.key}
                  onPointerDown={press(u.key)}
                  onPointerUp={release}
                  onPointerLeave={release}
                  onPointerCancel={release}
                  onContextMenu={(e) => e.preventDefault()}
                  className="flex min-h-[60px] select-none items-center gap-3 border-t border-rule [-webkit-touch-callout:none] last:border-b"
                >
                  <span className="flex flex-1 flex-col">
                    <span className="text-[16px]">{u.name}</span>
                    <span className="text-[14px] tabular-nums text-muted">{u.sub}</span>
                  </span>
                  {removing === u.key ? (
                    <button
                      type="button"
                      onClick={tap(() => {
                        void mutate("removeUsual", { key: u.key });
                        setRemoving(null);
                      })}
                      className={`${btn.outline} h-11 px-3.5 text-[16px]`}
                    >
                      Remove
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={tap(() => {
                        void mutate("logUsual", { clientId: crypto.randomUUID(), usual: u.key, date });
                        onClose();
                      })}
                      className={`${btn.outline} h-11 px-3.5 text-[16px]`}
                    >
                      Log
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {!all && usuals.length > USUALS_SHOWN && (
              <button type="button" onClick={() => setAll(true)} className={btn.quiet}>
                All {usuals.length} usuals
              </button>
            )}
          </div>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const name = String(f.get("name") ?? "").trim();
            const kcal = Number(f.get("kcal"));
            if (!name || !Number.isFinite(kcal)) return;
            void mutate("logOffPlan", {
              clientId: crypto.randomUUID(),
              date,
              name,
              category: String(f.get("category")),
              kcal: Math.round(kcal),
              proteinG: Math.round(Number(f.get("protein") || 0)),
              relaxed,
              usualId: saveUsual ? crypto.randomUUID() : undefined,
            });
            onClose();
          }}
          className="flex flex-col gap-3"
        >
          <label className={LABEL}>
            Something new
            <input name="name" required maxLength={80} placeholder="What was it" className={FIELD} />
          </label>
          <label className={LABEL}>
            Category
            <select name="category" defaultValue="meal" className={FIELD}>
              <option value="meal">Meal</option>
              <option value="snack">Snack</option>
              <option value="dessert">Dessert</option>
              <option value="drink">Drink</option>
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className={LABEL}>
              Calories
              <input name="kcal" inputMode="numeric" required className={`tabular ${FIELD}`} />
            </label>
            <label className={LABEL}>
              Protein (g)
              <input name="protein" inputMode="numeric" defaultValue="0" className={`tabular ${FIELD}`} />
            </label>
          </div>
          <div className="flex min-h-11 items-center justify-between gap-3 text-[16px]">
            <span>Relaxed meal (weekend restaurant)</span>
            <Toggle on={relaxed} label="Relaxed meal" onChange={setRelaxed} />
          </div>
          <div className="flex min-h-11 items-center justify-between gap-3 text-[16px]">
            <span>Save as a usual</span>
            <Toggle on={saveUsual} label="Save as a usual" onChange={setSaveUsual} />
          </div>
          <button type="submit" className={`${btn.primary} mt-1 h-14`}>
            Log it
          </button>
        </form>
      </div>
    </Sheet>
  );
}
```

- [ ] **Step 3: Wire Today.** In `app/routes/today.tsx`:

1. Imports:
    - Change the React import to `import { useEffect, useMemo, useRef, useState } from "react";`.
    - Change the react-router import to `import { Link, useNavigate, useRouteLoaderData, useSearchParams } from "react-router";`.
    - Delete `import { Sheet } from "~/components/Sheet";`.
    - Add:

```tsx
import type { CloseOutModel } from "~/today/closeout";
import { CloseOutSheet } from "~/today/CloseOutSheet";
import { OffPlanSheet } from "~/today/OffPlanSheet";
```

2. Delete the old `PRESETS`, `FIELD` and `OffPlanSheet` at the bottom of the file.

3. Add above `TodayWithPlan`:

```tsx
const ASKED_KEY = "rocky-closeout-asked";
let askedInMemory: string | null = null;

/** True the first time Today opens on `date` on this phone, so yesterday's sheet asks once a day and no more. */
function firstOpenOn(date: string): boolean {
  let asked = askedInMemory;
  try {
    asked = localStorage.getItem(ASKED_KEY) ?? asked;
    localStorage.setItem(ASKED_KEY, date);
  } catch {
    // Private mode can refuse storage. This page's memory still stops a second ask.
  }
  askedInMemory = date;
  return asked !== date;
}
```

4. Replace `TodayWithPlan` with:

```tsx
function TodayWithPlan({ m }: { m: PlanToday }) {
  const [offPlanOpen, setOffPlanOpen] = useState(false);
  const [closing, setClosing] = useState<CloseOutModel | null>(null);
  const [params, setParams] = useSearchParams();
  // Checks that were already there when the screen opened do not animate. Nothing moves on load.
  const eatenAtOpen = useRef<Set<string> | null>(null);
  eatenAtOpen.current ??= new Set(m.slots.filter((s) => s.logKey).map((s) => s.slot));

  // Once, as the screen opens: the 9:15pm push asks about today, and a day's first open about a half-answered yesterday.
  useEffect(() => {
    if (params.get("closeout") === "today") {
      setParams(
        (p) => {
          p.delete("closeout");
          return p;
        },
        { replace: true },
      );
      setClosing(m.closeOut.today);
    } else if (m.closeOut.yesterday && firstOpenOn(m.date)) {
      setClosing(m.closeOut.yesterday);
    }
  }, []);

  return (
    <Page>
      <Header m={m} />
      {!m.weighIn && <WeighInRow date={m.date} />}
      <div className="flex flex-col gap-2">
        <NextUpPoster m={m} />
        {m.canChange && (
          <Link to="/workout" className={btn.quiet}>
            Change today's workout
          </Link>
        )}
        {m.optional && (
          <Link to={`/workout?template=${m.optional.templateId}`} className={btn.quiet}>
            Optional: {m.optional.name}, 30 min
          </Link>
        )}
      </div>

      <RockyCard label={m.voice === "plain" ? COACH_NAME : `${COACH_NAME}, in your corner`}>{m.message}</RockyCard>

      <Fuel m={m} eatenAtOpen={eatenAtOpen.current} onAteElse={() => setOffPlanOpen(true)} onCloseOut={() => setClosing(m.closeOut.today)} />

      <section aria-labelledby="week" className="flex flex-col gap-3">
        <SectionHead id="week" note={`${m.countedSoFar} of ${m.daysSoFar} so far`}>
          This week
        </SectionHead>
        <WeekStrip days={m.week} />
        <p className="text-[16px] leading-[1.45] text-ink-2">
          {m.countedLine}
          {m.trendLine && ` ${m.trendLine}`}
        </p>
      </section>

      {offPlanOpen && <OffPlanSheet date={m.date} usuals={m.usuals} onClose={() => setOffPlanOpen(false)} />}
      {closing && <CloseOutSheet key={closing.date} day={closing} onClose={() => setClosing(null)} />}
    </Page>
  );
}
```

5. In `Fuel`:
    - Change its signature to `function Fuel({ m, eatenAtOpen, onAteElse, onCloseOut }: { m: PlanToday; eatenAtOpen: Set<string>; onAteElse: () => void; onCloseOut: () => void }) {`.
    - In `segments`, change `...m.slots.map((s) => ({` to `...m.slots.filter((s) => !s.skipKey).map((s) => ({`. A skipped meal adds no protein, so it gets no segment.
    - Directly after the closing `</ul>`, before the "+ Ate something else" button, add:

```tsx
      {m.closeOut.link && (
        <button type="button" onClick={onCloseOut} className={btn.quiet}>
          Close out today
        </button>
      )}
```

6. In `MealRow`, add this branch after the `if (s.logKey) { ... }` block:

```tsx
  if (s.skipKey) {
    return (
      <li className="flex min-h-12 items-center gap-3 border-t border-rule">
        <span className="tabular w-11 font-num text-[15px] font-semibold text-muted">{s.time}</span>
        <Link to={recipe} className="flex-1 text-[16px] text-muted">
          {s.meal.name}
        </Link>
        <button type="button" aria-label={`Mark ${s.meal.name} not skipped`} onClick={() => void mutate("unlogMeal", { key: s.skipKey })} className="flex h-11 items-center text-[14px] font-semibold text-ink-3">
          Skipped
        </button>
      </li>
    );
  }
```

- [ ] **Step 4: Typecheck, and run Today's tests.**

```bash
npm run typecheck
npx vitest run --project unit tests/unit/today/model.test.ts tests/unit/today/closeout.test.ts
```

Expected: no type errors, and PASS.

- [ ] **Step 5: Commit.**

```bash
git add app/today/CloseOutSheet.tsx app/today/OffPlanSheet.tsx app/routes/today.tsx
git commit -m "Today: skipped rows, the close-out sheet, usual orders first in Ate something else"
```

---

### Task 9: The Meal screen

**Files:**
- Create: `app/meal/MealScreen.tsx`, `app/meal/MealSwapSheet.tsx`, `app/meal/BatchCard.tsx`, `app/meal/PhotoBox.tsx`

- [ ] **Step 1: The photo.** Create `app/meal/PhotoBox.tsx` (question 1's band 2, option A):

```tsx
import { useEffect } from "react";
import { useFetcher } from "react-router";
import { Icon } from "~/components/ui";
import { useSyncClient, useSyncStatus } from "~/sync/react";

async function shrink(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), "image/jpeg", 0.85));
  return new File([blob], "photo.jpg", { type: "image/jpeg" });
}

/** The meal's photo, or a place to add one. The photo goes to R2, so this is the meal screen's one server request. */
export function PhotoBox({ slug, photoKey, alt }: { slug: string; photoKey: string | null; alt: string }) {
  const fetcher = useFetcher<{ ok?: true; error?: string }>();
  const client = useSyncClient();
  const offline = useSyncStatus()?.online === false;
  const busy = fetcher.state !== "idle";
  // The new photo_key comes down with the next pull, like any other change.
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok) void client?.sync();
  }, [fetcher.state, fetcher.data, client]);

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const body = new FormData();
    body.set("intent", "photo");
    body.set("photo", await shrink(file));
    fetcher.submit(body, { method: "post", action: `/meal/${slug}`, encType: "multipart/form-data" });
  }
  const input = <input type="file" accept="image/*" capture="environment" disabled={offline || busy} onChange={onChange} className="sr-only" />;
  const label = offline ? "Photos need a signal" : busy ? "Uploading..." : null;

  return (
    <div className="flex flex-col gap-1.5">
      {photoKey ? (
        <div className="relative h-[170px] overflow-hidden rounded-[6px] bg-well">
          <img src={`/media/${photoKey}`} alt={alt} className="size-full object-cover" />
          <label aria-label={label ?? "Change photo"} className={`absolute bottom-2.5 right-2.5 flex size-11 items-center justify-center rounded-[6px] bg-paper text-ink ${offline ? "opacity-60" : "cursor-pointer"}`}>
            <Icon name="camera" size={20} strokeWidth={1.8} />
            {input}
          </label>
        </div>
      ) : (
        <div className="flex h-[170px] flex-col items-center justify-center gap-2 rounded-[6px] bg-well">
          <span className="text-ink-3">
            <Icon name="camera" size={28} strokeWidth={1.8} />
          </span>
          <label className={`flex h-11 items-center rounded-[6px] border-[1.5px] border-ink-3 px-3.5 text-[15px] font-semibold ${offline ? "opacity-60" : "cursor-pointer"}`}>
            {label ?? "Add a photo"}
            {input}
          </label>
        </div>
      )}
      {photoKey && label && <p className="text-[14px] text-ink-3">{label}</p>}
      {fetcher.data?.error && <p className="text-[14px] text-ink-2">{fetcher.data.error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: The batch card.** Create `app/meal/BatchCard.tsx`:

```tsx
import { useState } from "react";
import { COACH_NAME } from "~/brand";
import { useMutate } from "~/sync/react";
import type { MealModel } from "./model";

const andList = (names: string[]) => (names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : (names[0] ?? ""));

/** "After cooking": weigh the whole batch's protein once, and the next days show their portion (mock MealBatch). */
export function BatchCard({ m, portions }: { m: MealModel; portions: number }) {
  const mutate = useMutate();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const protein = m.mainProtein.name.toLowerCase();
  return (
    <section aria-labelledby="after" className="flex flex-col gap-3 rounded-[6px] border-2 border-ink bg-raised p-4">
      <h2 id="after" className="font-display text-[26px] uppercase">
        After cooking
      </h2>
      {m.todayBatch ? (
        <>
          <div className="flex items-baseline justify-between border-t border-rule pt-2.5">
            <span className="text-[16px]">Each portion</span>
            <span className="tabular font-num text-[26px] font-bold">{m.todayBatch.portionG} g cooked</span>
          </div>
          {m.todayBatch.laterDays.length > 0 && (
            <p className="text-[15px] leading-[1.4] text-ink-3">
              {andList(m.todayBatch.laterDays)} {m.slot} will say: put {m.todayBatch.portionG} g of cooked {protein} on the scale.
            </p>
          )}
        </>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const cooked = Math.round(Number(value));
            if (!Number.isFinite(cooked) || cooked < 1 || cooked > 10_000) return setError("Enter the cooked weight in grams.");
            setError(null);
            void mutate("startBatch", { clientId: crypto.randomUUID(), date: m.date, slot: m.slot, mealSlug: m.meal.slug, portions, cookedWeightG: cooked });
          }}
          className="flex flex-col gap-3"
        >
          <label htmlFor="cooked" className="text-[16px] leading-[1.4]">
            Weigh all the cooked {protein}. {COACH_NAME} splits it into {portions} portions.
          </label>
          <div className="flex items-center gap-2.5">
            <div className="flex h-14 flex-1 items-center gap-1.5 rounded-[6px] border-[1.5px] border-ink bg-field px-3.5 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-red">
              <input id="cooked" value={value} onChange={(e) => setValue(e.target.value)} inputMode="numeric" placeholder="0" className="tabular w-full min-w-0 bg-transparent font-num text-[30px] font-bold outline-none" />
              <span className="font-num text-[18px] font-bold text-ink-3">g cooked</span>
            </div>
            <button type="submit" className="h-14 rounded-[6px] bg-ink px-[18px] font-num text-[17px] font-bold text-paper">
              Save
            </button>
          </div>
          {error && <p className="text-[14px] text-ink-2">{error}</p>}
        </form>
      )}
    </section>
  );
}
```

- [ ] **Step 3: The swap sheet.** Create `app/meal/MealSwapSheet.tsx`:

```tsx
import { useState } from "react";
import { Sheet } from "~/components/Sheet";
import { Icon } from "~/components/ui";
import { useMutate } from "~/sync/react";
import { JoinedChoice } from "~/ui/JoinedChoice";
import type { MealModel } from "./model";

/** Swap today's slot for another meal that fits it, best fit first (mock MealSwap). */
export function MealSwapSheet({ m, onClose, onSwapped }: { m: MealModel; onClose: () => void; onSwapped: (slug: string) => void }) {
  const mutate = useMutate();
  const [how, setHow] = useState<"today" | "always">("today");
  async function pick(slug: string) {
    const ok = await mutate("swapMeal", { date: m.date, slot: m.slot, mealSlug: slug, always: how === "always" });
    onClose();
    if (ok) onSwapped(slug);
  }
  return (
    <Sheet open onClose={onClose} title={`Swap ${m.slot}`} dismiss="cancel">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <JoinedChoice
            label="How long"
            choices={[
              { value: "today", label: "Just today" },
              { value: "always", label: "Always" },
            ]}
            value={how}
            onPick={setHow}
            height="h-[46px]"
          />
          <p className="text-[14px] text-ink-3">Only today changes. Always rests the {m.meal.name.toLowerCase()} for 4 weeks.</p>
        </div>
        <p className="text-[15px] text-ink-3">Best fit for what's left today first.</p>
        <ul className="flex flex-col">
          {m.swaps.map((o) => (
            <li key={o.slug} className={o.best ? "border-t-2 border-ink" : "border-t border-rule last:border-b"}>
              <button type="button" onClick={() => void pick(o.slug)} className="flex min-h-16 w-full items-center gap-3 text-left">
                <span className="flex flex-1 flex-col gap-0.5">
                  <span className={`text-[17px] ${o.best ? "font-bold" : "font-semibold"}`}>{o.name}</span>
                  <span className="text-[14px] tabular-nums text-ink-3">
                    {o.kcal} cal · {o.protein} g
                    {o.best && (
                      <>
                        {" · "}
                        <strong className="font-bold text-ink">best fit</strong>
                      </>
                    )}
                    {o.lowProtein && " · lower protein, add a shake"}
                  </span>
                </span>
                <Icon name="chevron" size={16} strokeWidth={2.4} />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </Sheet>
  );
}
```

- [ ] **Step 4: The screen.** Create `app/meal/MealScreen.tsx` (question 1's bands 1 and 4, option A):

```tsx
import { useState } from "react";
import { useNavigate } from "react-router";
import { Icon } from "~/components/ui";
import { useMutate } from "~/sync/react";
import { btn } from "~/ui/button";
import { Dock, GymFrame, HeaderIcon } from "~/ui/GymFrame";
import { JoinedChoice } from "~/ui/JoinedChoice";
import { SectionHead } from "~/ui/SectionHead";
import { BatchCard } from "./BatchCard";
import { MealSwapSheet } from "./MealSwapSheet";
import { batchMeta, scaleRows, type MealModel } from "./model";
import { PhotoBox } from "./PhotoBox";

const PORTIONS = [
  { value: 1, label: "Just today" },
  { value: 2, label: "2 days" },
  { value: 3, label: "3 days" },
];

/** Today's slot (mocks MealOne, MealBatch, MealLeftover, MealSwap) or browse mode (option 2A). */
export function MealScreen({ m, fromLibrary }: { m: MealModel; fromLibrary: boolean }) {
  const navigate = useNavigate();
  const mutate = useMutate();
  const [portions, setPortions] = useState(1);
  const [swapping, setSwapping] = useState(false);
  const shown = m.todayBatch?.portions ?? (m.canCook ? portions : 1);
  const rows = scaleRows(m, shown);
  const firstWas = rows.findIndex((r) => r.was !== null);
  const back = fromLibrary ? "/library" : "/";
  // The screen follows the slot to its new meal, and Back still goes where it came from.
  const openSlot = (slug: string, slot: string) => navigate(`/meal/${slug}?slot=${slot}${fromLibrary ? "&from=library" : ""}`, { replace: true });

  async function haveIt() {
    if (!m.haveIt) return;
    if (await mutate("swapMeal", { date: m.date, slot: m.haveIt.slot, mealSlug: m.meal.slug, always: false })) openSlot(m.meal.slug, m.haveIt.slot);
  }

  const header = (
    <>
      <HeaderIcon to={back} label={fromLibrary ? "Back to Library" : "Back to Today"} icon="back" />
      {m.mode === "today" && m.state === "open" && (
        <button type="button" onClick={() => setSwapping(true)} className="flex h-11 items-center gap-1.5 rounded-[6px] border-[1.5px] border-border px-3.5 font-num text-[16px] font-bold">
          <Icon name="swap" size={16} />
          Swap
        </button>
      )}
    </>
  );

  return (
    <GymFrame header={header} dock={<MealDock m={m} portions={shown} onHaveIt={() => void haveIt()} />} gap="gap-5">
      <PhotoBox slug={m.meal.slug} photoKey={m.photoKey} alt={m.meal.name} />

      <section className="flex flex-col gap-2">
        <h1 className="font-display text-[54px] uppercase leading-[0.95] [overflow-wrap:anywhere]">{m.meal.name}.</h1>
        <p className="font-num text-[18px] font-semibold text-ink-3">{shown > 1 ? batchMeta(m, shown) : m.meta}</p>
        {m.restingUntil && <p className="text-[16px] text-ink-2">Resting to {m.restingUntil}</p>}
      </section>

      {m.canCook && <JoinedChoice label="Cooking for" choices={PORTIONS} value={portions} onPick={setPortions} />}

      <section aria-labelledby="scale" className="flex flex-col">
        <SectionHead id="scale">{shown > 1 ? `On the scale, all ${shown}` : "On the scale"}</SectionHead>
        <ul className="mt-1.5 flex flex-col">
          {rows.map((r, i) => (
            <li key={r.food} className={`flex flex-col justify-center gap-1 border-b border-rule ${r.highlight ? "-mx-3 min-h-[72px] bg-raised px-3" : r.was ? "min-h-[84px]" : "min-h-[62px]"}`}>
              <div className="flex items-center gap-3">
                <span className="flex flex-1 flex-col">
                  <span className={r.highlight ? "text-[18px] font-bold" : "text-[17px] font-semibold"}>{r.name}</span>
                  {r.sub && <span className={`text-[14px] ${r.highlight ? "text-ink-3" : "text-muted"}`}>{r.sub}</span>}
                </span>
                <span className={`tabular font-num font-bold ${r.highlight ? "text-[40px]" : "text-[34px]"}`}>
                  {r.grams.toLocaleString()}
                  <span className={r.highlight ? "text-[20px]" : "text-[18px]"}> g</span>
                </span>
              </div>
              {r.was && <span className="text-[14px] text-ink-2">{i === firstWas && m.wasNote ? `${r.was} ${m.wasNote}` : r.was}</span>}
            </li>
          ))}
        </ul>
      </section>

      {m.leftover && <p className="text-[17px] leading-[1.45]">{m.leftover.closing}</p>}
      {(m.todayBatch || (m.canCook && portions > 1)) && <BatchCard m={m} portions={shown} />}

      {!m.leftover && (
        <section aria-labelledby="steps" className="flex flex-col gap-3">
          <SectionHead id="steps">Steps</SectionHead>
          <ol className="flex flex-col gap-3 text-[17px] leading-[1.4]">
            {m.steps.map((s, i) => (
              <li key={i} className="flex gap-3">
                <span className="w-[22px] flex-none font-num font-bold text-muted">{i + 1}</span>
                <span>{s}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {swapping && <MealSwapSheet m={m} onClose={() => setSwapping(false)} onSwapped={(slug) => openSlot(slug, m.slot!)} />}
    </GymFrame>
  );
}

function MealDock({ m, portions, onHaveIt }: { m: MealModel; portions: number; onHaveIt: () => void }) {
  const mutate = useMutate();
  if (m.mode === "browse") {
    if (!m.haveIt) return null;
    return (
      <Dock>
        <p className="text-center text-[15px] text-ink-3">{m.haveIt.then}</p>
        <button type="button" onClick={onHaveIt} className={`${btn.outline} h-14 text-[17px] uppercase tracking-[0.02em]`}>
          {m.haveIt.label}
        </button>
      </Dock>
    );
  }
  if (m.state !== "open") {
    return (
      <Dock>
        <div className="flex min-h-14 items-center justify-between gap-3">
          <span className="font-num text-[19px] font-bold">{m.state === "eaten" ? `Eaten at ${m.eatenAt}` : "Skipped"}</span>
          <button type="button" onClick={() => void mutate("unlogMeal", { key: m.logKey })} className={btn.quiet}>
            Undo
          </button>
        </div>
      </Dock>
    );
  }
  const args = { date: m.date, slot: m.slot, mealSlug: m.meal.slug };
  const label = m.leftover ? `Ate it · ${m.meal.kcal} cal · ${m.meal.protein} g` : portions > 1 ? "Ate today's portion" : "Ate it";
  return (
    <Dock>
      <button type="button" onClick={() => void mutate("logMeal", { clientId: crypto.randomUUID(), ...args })} className={`${btn.gym} h-[60px] w-full`}>
        {label}
      </button>
      <div className="flex justify-center">
        <button type="button" onClick={() => void mutate("skipMeal", { clientId: crypto.randomUUID(), ...args })} className={btn.quiet}>
          Skipped it
        </button>
      </div>
    </Dock>
  );
}
```

- [ ] **Step 5: Typecheck.** `npm run typecheck`. Expected: no errors. Nothing routes to the screen until Task 10.

- [ ] **Step 6: Commit.**

```bash
git add app/meal/MealScreen.tsx app/meal/MealSwapSheet.tsx app/meal/BatchCard.tsx app/meal/PhotoBox.tsx
git commit -m "The meal screen: the scale, Cooking for, batch, leftover, swap and browse docks"
```

---

### Task 10: The route, and the v1 meal screen goes

**Files:**
- Modify: `app/routes/meal.tsx` (full rewrite), `app/components/PendingSync.tsx`, `app/server/meals.server.ts`, `app/server/meal-plan.server.ts`, `tests/workers/meals.test.ts`, `tests/workers/meal-plan.test.ts`
- Delete: `app/lib/offline-queue.ts`
- Rewrite: `tests/workers/meal-route.test.ts`

- [ ] **Step 1: Write the route test first.** Replace `tests/workers/meal-route.test.ts` with:

```ts
import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { mealState } from "~/db/schema";
import { action } from "~/routes/meal";
import { db, post, routeArgs } from "./helpers";

// Every other meal tap is a named change on the phone now. Only the photo goes to the server, because it is stored in R2.
describe("meal route", () => {
  it("saves a photo for the meal", async () => {
    const photo = new File([new Uint8Array([9, 9])], "photo.jpg", { type: "image/jpeg" });
    expect(await action(routeArgs(post("http://localhost/meal/steak-and-eggs", { intent: "photo", photo }), { slug: "steak-and-eggs" }))).toEqual({ ok: true });
    const row = await db().select().from(mealState).where(eq(mealState.slug, "steak-and-eggs")).get();
    expect(await env.MEDIA.get(row!.photoKey!)).not.toBeNull();
  });

  it("no longer takes the v1 meal actions", async () => {
    const res = await action(routeArgs(post("http://localhost/meal/steak-and-eggs", { intent: "ate", slot: "breakfast" }), { slug: "steak-and-eggs" }));
    expect(res).toEqual({ error: "Choose a photo." });
  });

  it("says when the file isn't an image", async () => {
    const txt = new File(["hi"], "a.txt", { type: "text/plain" });
    expect(await action(routeArgs(post("http://localhost/meal/steak-and-eggs", { intent: "photo", photo: txt }), { slug: "steak-and-eggs" }))).toEqual({ error: "Upload an image" });
  });

  it("404s an unknown meal", async () => {
    const res = await action(routeArgs(post("http://localhost/meal/nope", { intent: "photo" }), { slug: "nope" })).catch((e: Response) => e);
    expect((res as Response).status).toBe(404);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails.**

```bash
npx vitest run --project workers tests/workers/meal-route.test.ts
```

Expected: "no longer takes the v1 meal actions" FAILS, because v1's action logs the meal and redirects. The others may pass against v1's photo intent.

- [ ] **Step 3: Rewrite `app/routes/meal.tsx`:**

```tsx
import { useMemo } from "react";
import { Link, useSearchParams } from "react-router";
import { pageTitle } from "~/brand";
import type { Route } from "./+types/meal";
import { meals } from "~/content";
import { useNow } from "~/lib/use-now";
import { MealScreen } from "~/meal/MealScreen";
import { buildMeal } from "~/meal/model";
import { userDb } from "~/server/current-user.server";
import { saveMealPhoto } from "~/server/photos.server";
import { useStoreVersion, useSyncClient, useSyncStatus } from "~/sync/react";
import { btn } from "~/ui/button";
import { Poster } from "~/ui/Poster";

export const handle = { hideTabBar: true };

export function meta({ params }: Route.MetaArgs) {
  return [{ title: pageTitle(meals.get(params.slug)?.name ?? "Meal") }];
}

/** The photo is the one thing that still goes to the server: it is stored in R2. Every other tap is a named change. */
export async function action({ request, params }: Route.ActionArgs) {
  if (!meals.has(params.slug)) throw new Response("Not found", { status: 404 });
  const form = await request.formData();
  const photo = form.get("photo");
  if (form.get("intent") !== "photo" || !(photo instanceof File)) return { error: "Choose a photo." };
  try {
    await saveMealPhoto(userDb(), params.slug, photo);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "That photo didn't save." };
  }
  return { ok: true as const };
}

/** No loader: the screen reads the phone's copy, so it opens with no signal, like Today. */
export default function Meal({ params }: Route.ComponentProps) {
  const client = useSyncClient();
  const ready = useSyncStatus()?.ready ?? false;
  const version = useStoreVersion();
  const [search] = useSearchParams();
  const minute = Math.floor(useNow(30_000).getTime() / 60_000);
  const slot = search.get("slot");
  const model = useMemo(
    () => (client && ready ? buildMeal((t) => client.store.rows(t), new Date(minute * 60_000), { slug: params.slug, slot }) : null),
    [client, ready, version, minute, params.slug, slot],
  );
  const fromLibrary = search.get("from") === "library";
  // The server and the first paint have no store yet. It loads from the phone in a few milliseconds.
  if (!client || !ready) return <main aria-busy="true" className="min-h-dvh" />;
  if (!model) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-[560px] flex-col justify-center gap-6 px-5">
        <Poster lines={["Not in", "the library."]} meta="That meal may have been renamed or removed." />
        <Link to={fromLibrary ? "/library" : "/"} className={`${btn.outline} h-14 text-[17px]`}>
          {fromLibrary ? "Back to Library" : "Back to Today"}
        </Link>
      </main>
    );
  }
  return <MealScreen m={model} fromLibrary={fromLibrary} />;
}
```

- [ ] **Step 4: The pending notice reads only the sync status.** Replace `app/components/PendingSync.tsx` with:

```tsx
import { useSyncStatus } from "~/sync/react";

/** Offline, says how many changes are waiting for a signal. Every change goes through the sync client now. */
export function PendingSync() {
  const sync = useSyncStatus();
  const waiting = sync && !sync.online ? sync.waiting : 0;
  if (waiting === 0) return null;
  return (
    <div role="status" className="glass fixed left-1/2 top-[max(12px,env(safe-area-inset-top))] z-40 -translate-x-1/2 rounded-full px-4 py-2 text-[14px] font-semibold">
      Saving {waiting} change{waiting === 1 ? "" : "s"}... (offline)
    </div>
  );
}
```

   Then delete the queue:

```bash
git rm app/lib/offline-queue.ts
```

- [ ] **Step 5: Remove the v1 helpers only the old route used.**
1. In `app/server/meals.server.ts`, delete `mainProtein` (it lives in `app/meal/model.ts` now). Change the content import to `import { meals, type MealWithMacros } from "~/content";` if `foods` is no longer used there. Add this line above `logPlannedMeal`:

```ts
// No app caller since N2: worker tests seed history with logPlannedMeal and createBatch. Project 4 removes them.
```

2. In `app/server/meal-plan.server.ts`, delete `swapPlanned`.
3. In `tests/workers/meal-plan.test.ts`, change the import to `import { ensureWeekPlan, plannedForDate, restMeal } from "~/server/meal-plan.server";` and delete the tests "swaps one slot for today only" and "rests the original for 4 weeks on an always swap". `tests/unit/sync/meal-mutators.test.ts` covers both rules through `swapMeal`. If `mealState` is now unused in that file, drop it from the schema import.
4. In `tests/workers/meals.test.ts`, remove `mainProtein` from the `~/server/meals.server` import and delete the test "picks the ingredient carrying the most protein as the main protein". Task 5's model test covers it.

   Then check nothing still reaches the removed code:

```bash
rg -n "offline-queue|swapPlanned|rocky-queue|from \"~/server/meals.server\".*mainProtein" app tests
```

   Expected: no output.

- [ ] **Step 6: Run the changed worker files.**

```bash
npx vitest run --project workers tests/workers/meal-route.test.ts tests/workers/meals.test.ts tests/workers/meal-plan.test.ts tests/workers/media.test.ts
```

Expected: PASS.

- [ ] **Step 7: Typecheck.** `npm run typecheck`. Expected: no errors.

- [ ] **Step 8: Commit.**

```bash
git add -A app/routes/meal.tsx app/components/PendingSync.tsx app/lib app/server/meals.server.ts app/server/meal-plan.server.ts tests/workers
git commit -m "The meal route reads the phone's copy; the v1 meal actions and the offline queue go"
```

---

### Task 11: Look at each screen against its mock

- [ ] **Step 1: Sign in locally** with a temporary password, as F4a's Task 11 did. Save the hash, swap it, and put it back in Step 8:

```bash
npx wrangler d1 execute rocky-core --local --command "select password_hash from users where name_key = 'kameron'"
npx tsx -e 'import("./app/server/password.ts").then(async (m) => console.log(await m.hashPassword("local-look-check")))'
npx wrangler d1 execute rocky-core --local --command "update users set password_hash = '<hash printed above>' where name_key = 'kameron'"
```

- [ ] **Step 2: Give the local data a trimmed target,** so the grams and the "Was" line match the mocks. `<monday>` is this week's Monday, `YYYY-MM-DD`:

```bash
npx wrangler d1 execute rocky-db --local --command "insert into targets (effective_from, kcal, protein_g, step_goal) values ('<monday>', 2300, 180, 7000)"
```

   Step 8 deletes it again.

- [ ] **Step 3: Compare at 390 x 844** (the same-origin iframe trick from F3), side by side with each artboard, with `npm run dev` running:
1. **`MealOne`:** open today's lunch from Today.
    - Back and Swap in the header, the 170 px photo box with "Add a photo", the 54 px name, the meta, the joined Cooking for, ON THE SCALE with 34 px grams, rice's "Was 200." with the reason, the numbered steps, and the 60 px red ATE IT with the quiet "Skipped it" under it.
2. **`MealBatch`:** pick 3 days.
    - "ON THE SCALE, ALL 3", the "a portion" sublines, the meta "Lunch for …", and the After cooking card.
    - Enter 495 and Save. Cooking for goes, "Each portion 165 g cooked" shows with the later-days line, and the dock reads ATE TODAY'S PORTION.
3. **`MealLeftover`:** a leftover day needs a batch cooked yesterday. Insert one for tonight's dinner, so it doesn't meet the lunch batch from item 2:

```bash
npx wrangler d1 execute rocky-db --local --command "insert into batches (client_id, meal_slug, portions, cooked_weight_g, portion_g, created_on, portions_left, factor) values ('look-batch', '<tonight''s dinner slug>', 3, 495, 165, '<yesterday>', 2, 1)"
```

    - Open tonight's dinner from Today. The meta reads "<Weekday> dinner · portion 2 of 3 from <Weekday>'s batch", the raised protein row reads "…, from the batch" at 40 px, "One portion left for <Weekday>." shows, there are no Steps, and the dock reads "ATE IT · <kcal> CAL · <protein> G".
4. **`MealSwap`:** tap Swap. "SWAP LUNCH" with a quiet Cancel, the joined Just today / Always, the two notes, "best fit" in bold ink on the first row under a 2 px rule, and "lower protein, add a shake" where it applies. Pick one: the screen shows the new meal and the URL follows.
5. **Option 2A:** from the Library, open a meal not on today's plan. No Swap, no Cooking for. The subline folds the Was line in ("Raw, was 300"). The outline "Have it for dinner tonight" with its then-line, after 3:30pm. Tap it: the screen becomes tonight's dinner, and Back returns to the Library.
6. **Option 1C:** on Today after 8:00pm with a meal unmarked, tap "Close out today". The title is "CLOSE OUT <WEEKDAY>", every row is checked, and un-checking one turns its subline to "Skipped" and the button to "SAVE: 1 EATEN, 1 SKIPPED". Open `/?closeout=today`: the sheet opens and the URL drops the parameter.
7. **Option 3A:** "+ Ate something else" lists Restaurant meal and Ranch Water with outline Log buttons and "100 cal · drink". A long press on one shows Remove, and lifting the finger doesn't remove it. Log a new entry with "Save as a usual" on, then open the sheet again: it is first.
8. **The four states board:** Ate it, then Undo; Skipped it, then Undo; the skipped row on Today; a photo uploaded and shown; a resting meal from the Library.
9. Red appears only on ATE IT, the close-out Save, Log it and the focus ring.
10. Run F3's contrast snippet on each screen. Expected: `all text passes`.

- [ ] **Step 4: Offline.** In DevTools, go offline and reload the meal screen. It opens from the phone's copy, "Add a photo" reads "Photos need a signal", and Ate it still lands, with "Saving 1 change... (offline)" at the top. Go back online.

- [ ] **Step 5: The morning sheet.** Mark one meal yesterday (insert a `meal_logs` row for yesterday with `category = 'planned'`), clear `rocky-closeout-asked` in DevTools Application > Local Storage, and reload Today. "CLOSE OUT YESTERDAY" opens. Close it and reload: it doesn't open again.

- [ ] **Step 6: Screenshots for the PR**, saved to the session scratchpad: MealOne with the Was line, MealBatch after Save, MealLeftover, MealSwap, browse mode with the dock, the close-out sheet, and the off-plan sheet with usuals.

- [ ] **Step 7: Commit any fixes** from this task, with a message naming what was fixed.

- [ ] **Step 8: Put the local data back.**

```bash
npx wrangler d1 execute rocky-db --local --command "delete from targets where effective_from = '<monday>' and kcal = 2300; delete from batches where client_id = 'look-batch'"
npx wrangler d1 execute rocky-core --local --command "update users set password_hash = '<saved hash>' where name_key = 'kameron'"
```

---

### Task 12: Full suite, PR, and the iPhone

- [ ] **Step 1: Run the whole suite once.**

```bash
npm run typecheck && npm test
```

Expected: all green. Fix only the failing files, then re-run those files only.

- [ ] **Step 2: Push and open the PR. Do not merge.**

```bash
git push -u origin v2/n2-meal-screens
gh pr create --base main --title "Rocky v2 N2: the meal screens and the close-out" --body-file - <<'MD'
Project 3, rollout step N2 (`docs/superpowers/specs/2026-10-27-nutrition-design.md`). Plan: `docs/superpowers/plans/2026-10-28-n2-meal-screens.md`.

- The Meal screen, rebuilt on the phone's copy: today's slot (Ate it, Skipped it, Swap, Cooking for, batch, leftover) and browse mode with "Have it for dinner tonight". The "Was" line after a target change.
- The close-out sheet (option 1C): from the 9:15pm push, once on a day's first open for a half-answered yesterday, and from "Close out today" after 8pm.
- Skipped meals on Today. Usual orders first in "Ate something else" (option 3A).
- The 9:15pm "Close out today" reminder, in Settings with the others.
- The v1 meal route's actions and the offline queue are gone. Only the photo upload still posts.
- Server fix from the N1 review: `processPush` generates the week before `swapMeal` or `startBatch`, so an offline Monday swap no longer leaves the rest of the week on default meals.

No migrations.

Answers to the four questions, the calls and the mock divergences: see the top of the plan.

Screenshots: <attach Task 11's>

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01W7nF4TYfnvvM41Zpfqn8BC
MD
```

Cloudflare does not build branches, so the PR has no build check.

- [ ] **Step 3: Report back and wait.** Kameron reviews and merges. After the merge, confirm the Workers Builds check on the merge commit is green:

```bash
gh api repos/kameronpduhon/rocky-the-coach/commits/$(git rev-parse origin/main)/check-runs --jq '.check_runs[] | "\(.name) \(.status) \(.conclusion)"'
```

- [ ] **Step 4: Verify on the wire (Kameron's iPhone, installed app).** Kameron does these and reports:
1. **The close-out push.** Leave dinner and dessert unmarked. At 9:15pm "Close out today" arrives with "2 meals aren't marked. One tap closes out today." Tap it: Today opens on the close-out sheet. Un-check dessert and tap "Save: 1 eaten, 1 skipped". In D1, dinner is planned and dessert is skipped:

    ```bash
    npx wrangler d1 execute rocky-db --remote --command "select date, slot, category, kcal from meal_logs where date = '<that day>' order by slot"
    ```

2. **The morning sheet.** Leave one day half answered and don't open the app after 9:15pm. The next morning's first open shows "Close out yesterday". Close it with "Not now", leave the app and come back: it doesn't open again that day.
3. **An offline batch.** In airplane mode, open today's lunch, pick 3 days, enter the cooked weight and Save, then tap "Ate today's portion". Reconnect. The batch and the next two lunches reach D1:

    ```bash
    npx wrangler d1 execute rocky-db --remote --command "select client_id, meal_slug, portions, portion_g, portions_left, factor, created_on from batches order by rowid desc limit 1"
    npx wrangler d1 execute rocky-db --remote --command "select date, slot, meal_slug, swapped from planned_meals where slot = 'lunch' and date >= '<today>' order by date limit 3"
    ```

    Expected: `portions_left` is 2, and tomorrow's lunch is the batch's meal with `swapped` 1. Tomorrow, the lunch screen shows "portion 2 of 3 from <Weekday>'s batch" and the cooked portion.
4. **Skip and undo.** On a meal screen, tap "Skipped it": the dock reads "Skipped", and Today shows the one muted line. Tap Undo: it is unmarked again.
5. **From the Library.** Open a dinner that isn't planned tonight. Tap "Have it for dinner tonight": the screen becomes tonight's dinner, and Today shows it.
6. **A usual order.** Log "Chipotle bowl, double chicken", 1,050 cal, 75 g, relaxed, with "Save as a usual" on. Open the sheet again: it is first. Tap Log on it. In D1, `uses` is 2:

    ```bash
    npx wrangler d1 execute rocky-db --remote --command "select name, uses, last_used_at from usual_orders order by uses desc"
    ```

7. **A photo.** Add one on a meal with signal. Turn on airplane mode: the button reads "Photos need a signal".
