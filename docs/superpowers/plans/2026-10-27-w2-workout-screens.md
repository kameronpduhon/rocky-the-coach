# W2: The Four Workout Screens Implementation Plan

> **For agentic workers:** implement this plan task-by-task with the `executing-plans` skill. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Plan, Set, Rest and Done replace the v1 workout screen, on the phone's copy of the data:
- **Plan ahead.** Today's workout can be picked, swapped, trimmed or added to in the morning without starting it.
- **Gym mode.** Set and Rest log every set on the phone, offline, with a rest countdown and a ping that reaches a locked phone.
- **Done.** What moved up, every lift's sets, and the optional "How did it feel?" tap, which now shapes next time's weights on Today and in the gym.
- **Today's links move** to the new screens, and the v1 route's server actions and offline queue use go away.

**Architecture:**
- **Pure reading rules in `app/workout/`.**
    - `sessions.ts` reads workouts by their sync key, applies the next-day finished rule, and finds an exercise's last sets with that workout's feel.
    - `lifts.ts` resolves a day's lift list and makes the plan screen's edits (swap, undo, skip, add).
    - `model.ts` builds everything the four screens show. Today uses the first two, so both screens read workouts the same way.
- **Writes are W1's named changes.** `actions.ts` turns each tap into mutators, planning the workout first when the tap is the day's first change. Nothing posts to the server except the fire-and-forget rest ping (`ping.ts`).
- **One route, four screens.** `/workout` has no loader or action. It reads the store through hooks, as Today does, and the workout's state picks the screen, so a change (Start, the last set, Finish) moves the screen on by itself.
- **The kit grows by five pieces** in `app/ui/`: `GymFrame`, `Stepper`, `SegmentRow`, `RestPanel`, `ChoiceRow`.

**Tech Stack:** React Router 8.4 (framework mode, SSR on), the F2 sync layer and W1 mutators, Tailwind 4 with the F3 tokens, Vitest 4 (unit project for pure modules, workers project for D1).

**Spec:** `docs/superpowers/specs/2026-10-27-workouts-design.md` (section 2 Screens, section 3 "Who calls it" and "Without notifications or signal", section 4, rollout step 2, Testing). **Branch:** `v2/w2-workout-screens` (created from `main` after W1 merged; this plan is committed there). **Mocks:** artboards `WorkoutPlan`, `WorkoutSet`, `WorkoutRest`, `WorkoutDone` on https://claude.ai/artifact/65WeReuGH5ZageJng9K6nq. **Design system:** `docs/design/system.md`.

**There are no migrations in W2.** Every table and column it uses landed in W1.

## Questions for Kameron (the plan follows each recommendation)

1. **Logging a past day.** Plan's "Log workout" and Progress's "Tap to fix" open an earlier day, so a forgotten workout can be logged or a wrong set fixed. The spec only says a past day opens on Done.
    - **Recommendation:** a past day with a workout opens Done, where tapping a lift fixes its sets or adds one. A past day with nothing logged opens Plan with a red "Log it", which saves the workout as done and goes to Done to add the sets. No clock, rest or ping on a past day.
    - **If you'd rather drop late logging until project 4:** Task 11's "Log it" and the "+ Add set" button in Task 10's `SetsSheet` go away, and a past day with nothing logged shows Done's empty list.
2. **After the very last set.** The spec says what comes up after each set, not after the last one of the workout.
    - **Recommendation:** no rest and no ping after the last set. Set shows "Every lift. Done." with a red "Finish workout". Finishing early stays in the lift list (tap the clock).
    - **The other way:** finish automatically after the last set. One tap fewer, but adding an extra lift at the end gets awkward.
3. **The exercise picker and move sheet looks.** The spec says the picker is "restyled", but neither it nor the move sheet has a mock, and your rule is a rendered mock before any look change. Both already draw in Corner colours, because the v1 colour names point at the Corner palette.
    - **Recommendation:** keep their layout in W2, and restyle them with the Library tab in project 4. W2 changes only what they do (the move sheet writes `moveWorkout`; the picker labels lifts already in the list).
    - **The other way:** a two-option mock first, which blocks the build session until you pick.

## Calls made in this plan (flag them in the PR)

- **No loader for `/workout`.** It reads the store with hooks, the same as Today, so it works with no signal and repaints on every change. The server renders an empty `aria-busy` page.
- **The workout's day follows Today's day** (`mealDate`, which runs until 3 am), so Today and the workout screens never disagree about which day it is.
- **Which screen shows:**
    - Today's open workout shows Plan before Start and Set after.
    - With none open, the newest finished workout shows Done.
    - Asking for a different workout after finishing (`?template=`, from Plan's "Log a different workout") opens Plan for a second workout.
    - `?plan=b` (the Plan B reminder) opens Plan with the home workout picked.
- **The red action on Plan changes at 11:30.** Before, it is "Done, see you at noon" with an outline "Start now". From 11:30, "Start now" is red and "Done" is the outline.
- **A picked workout is saved by "Done".** Opening Plan with a workout preselected (the rest-day link) writes nothing until a change, Start, or "Done".
- **Swap and skip stop once a lift has sets or a check.** The sheet explains why, because logged sets belong to that lift. "+ Add a lift" still works.
- **A skipped lift does not come back** except through "+ Add a lift", where it takes a 100+ position. Its history follows the exercise, so its weights are unaffected.
- **Moving a day drops a workout planned there but not started**, on either day of the move. The day then follows its new workout. This is a change to W1's `moveWorkout`.
- **Rating a workout that finished by the next-day rule** first writes its finish at its last set's time, because `rateWorkout` needs `ended_at`.
- **Rest adjustments are not saved.** After a reopen, the time left comes from the last set's `logged_at` plus the rest length (spec section 3), so a +15 s is lost.
- **With notifications off on this phone, no ping is scheduled.** The panel says so. A failed schedule call shows the no-signal line until the next one succeeds.
- **Ping text:** title "Rest's up", body "Set 2 of Leg press." (the spec's "Rest's up. Set <n> of <lift>.", split into title and body).
- **The brass callout on Set appears only when the weight goes up.** A hold reads as a plain ink-2 line ("Last Wednesday: 270 × 11, 12. Beat it today." or, after a Hard rating, "It felt hard, so 270 again today.").
- **Rocky's line on Done** is "<Count> lifts moved up." (or "Same weights next week. Beat the reps."), then the next planned meal: "<Meal> within the hour." when its slot starts within 60 minutes, else "<Meal> at 2:00pm.".
- **"About n min"** is 5 minutes plus 3.5 a set, to the nearest 5. Today's poster uses the same function (12 sets is still "about 45 min").
- **"Moved up" uses next week's deload.** A lift that hit the top this week holds if next week is the deload.
- **A planned workout is not a started one** for the "Lift at noon" reminder and Today's morning message. Both used to treat any workout row as started.
- **v1 code that stays, with no app caller after W2:**
    - `logSet` and `endSession` in `workouts.server.ts`, because three worker test files seed history with them.
    - The read side of `workouts.server.ts`, because the v1 meal screen's go-up line uses `goUps`.
    - Plan's `move` action, because `tests/workers/schedule.test.ts` covers it.
    - Project 4's Plan rebuild removes all three.
- **Mock divergences, by the system's rules:**
    - "Rocky:" on Done is bold ink, not red (spec).
    - The rest bar is `red`, not the mock's #E5533F. The panel's secondary text is `on-ink-2`, not #C9C0B0.
    - The moved-up dividers are `brass-border`, not #E3D3AE.
    - The picker buttons are 44 px tall, not 40, and Done's lift rows 44 px, not 32 (tap targets).
    - Done's headline is the split plus "Done." ("LEGS. SHOULDERS. DONE."), per the spec, not "LEG DAY.".
    - Lift names are shown in full ("Dumbbell Romanian deadlift", not "Dumbbell RDL").

---

## Ground rules

- Everything from the earlier plans applies:
    - No em dashes in code, copy, commits or docs.
    - No `Co-Authored-By` lines.
    - Look with `npm run dev`.
    - One full `npm run typecheck && npm test` at the end. During tasks, run only the file named in the step.
    - Token colours only. Red only for the primary action and live state, brass only for progression.
    - Kameron reviews and merges. The build session does not merge.
- `app/workout/*`, `app/today/model.ts`, `app/domain/*` and `app/ui/*` must not import `cloudflare:workers` or any `*.server.ts`. They run in the browser.
- Store rows are raw D1 rows: snake_case, booleans `0`/`1`, JSON columns as strings.
- Unit test dates use Chicago daylight time (`-05:00`), so they stay before November 1, 2026.

## Files

| File | Responsibility |
|---|---|
| `app/workout/sessions.ts` (new) | Workout keys, the next-day finished rule, logged days, an exercise's last sets and feel |
| `app/workout/lifts.ts` (new) | A day's lift list, its edits, swap options, titles, the minutes estimate, the picker catalog |
| `app/workout/model.ts` (new) | `buildWorkout`: store rows to everything the four screens show, plus set, rest and copy helpers |
| `app/workout/ping.ts` (new) | The `/api/rest` calls and the notifications check |
| `app/workout/actions.ts` (new) | Taps to named changes, planning the workout on its first change |
| `app/workout/use-actions.ts` (new) | The React hook over `actions.ts` |
| `app/workout/SwapSheet.tsx`, `LiftListSheet.tsx`, `SetsSheet.tsx`, `NoteSheet.tsx`, `AddLiftSheet.tsx` (new) | The sheets |
| `app/workout/PlanScreen.tsx`, `SetScreen.tsx`, `DoneScreen.tsx` (new) | The screens (Rest is Set's resting state) |
| `app/ui/GymFrame.tsx`, `Stepper.tsx`, `SegmentRow.tsx`, `RestPanel.tsx`, `ChoiceRow.tsx` (new) | The kit pieces |
| `app/ui/button.ts` | Adds the 21 px gym primary |
| `app/lib/use-now.ts` (new) | `useNow`, moved out of Today |
| `app/components/ui.tsx` | Adds the `close` and `pin` icons |
| `app/components/MoveSheet.tsx` | Writes `moveWorkout`; drops `children` |
| `app/components/ExercisePicker.tsx` | A `lockedLabel` prop |
| `app/sync/mutators.ts` | `moveWorkout` drops a planned, unstarted workout |
| `app/today/model.ts` | Reads workouts by key, planned vs started, the feel in the go-up note |
| `app/routes/today.tsx` | New links: Change opens Plan, Start and Short run the mutators |
| `app/routes/workout.tsx` | Full rewrite: no loader or action |
| `app/server/reminders.server.ts` | A planned workout is not a started one |
| `app/server/workouts.server.ts` | The v1 write helpers only the old route used are removed |
| `tests/workers/workout-route.test.ts`, `tests/workers/custom-workout.test.ts` | Deleted with the v1 route |
| `tests/workers/workout-readers.test.ts` (new) | v1 readers see workouts made by the new mutators |

---

### Task 1: Reading workouts by key

**Files:**
- Create: `app/workout/sessions.ts`
- Test: `tests/unit/workout/sessions.test.ts`

- [ ] **Step 1: Write the failing test.** Create `tests/unit/workout/sessions.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { Row } from "~/sync/tables";
import { doneDates, finishedAt, lastSession, loggedDates, sessionKey, setsBySession } from "~/workout/sessions";

const rowsOf = (t: Record<string, Row[]>) => (name: string) => t[name] ?? [];
const session = (o: Row): Row => ({ id: null, client_id: null, template_id: "wed-legs-shoulders", started_at: null, ended_at: null, planned_at: null, lifts: null, feel: null, exercises: null, ...o });
let n = 0;
const set = (o: Row): Row => ({ id: null, client_id: `s-${++n}`, session_id: null, exercise_id: "leg-press", position: 0, set_number: 1, weight_lb: 270, reps: 12, logged_at: "2026-10-21T17:10:00Z", ...o });

describe("workout sessions", () => {
  it("keys a phone-made workout by client id and a v1 one by id", () => {
    expect(sessionKey(session({ client_id: "w-1" }))).toBe("w-1");
    expect(sessionKey(session({ id: 9 }))).toBe("id:9");
  });

  it("links a set logged offline by its key, with no session_id yet", () => {
    expect(setsBySession(rowsOf({ set_logs: [set({ session_key: "w-1" })] })).get("w-1")).toHaveLength(1);
  });

  it("reads a workout started and never finished as finished from the next day, at its last set", () => {
    const w = session({ client_id: "w-1", date: "2026-10-21", started_at: "2026-10-21T17:00:00Z" });
    const sets = [set({ session_key: "w-1", logged_at: "2026-10-21T17:40:00Z" }), set({ session_key: "w-1", set_number: 2, logged_at: "2026-10-21T17:44:00Z" })];
    expect(finishedAt(w, sets, "2026-10-21")).toBeNull();
    expect(finishedAt(w, sets, "2026-10-22")).toBe("2026-10-21T17:44:00Z");
    expect(finishedAt(session({ date: "2026-10-21" }), [], "2026-10-22")).toBeNull();
    expect(finishedAt(session({ date: "2026-10-21", ended_at: "2026-10-21T18:00:00Z" }), [], "2026-10-21")).toBe("2026-10-21T18:00:00Z");
  });

  it("counts a day with sets or checks as logged, and a planned workout as nothing", () => {
    const rows = rowsOf({
      workout_sessions: [
        session({ client_id: "w-1", date: "2026-10-21" }),
        session({ client_id: "w-2", date: "2026-10-22" }),
        session({ client_id: "w-3", date: "2026-10-23", started_at: "2026-10-23T17:00:00Z" }),
        session({ client_id: "w-4", date: "2026-10-24" }),
      ],
      set_logs: [set({ session_key: "w-1" })],
      exercise_checks: [{ session_id: null, session_key: "w-2", exercise_id: "leg-press" }],
    });
    expect(loggedDates(rows)).toEqual(new Set(["2026-10-21", "2026-10-22"]));
    expect(doneDates(rows, "2026-10-25")).toEqual(new Set(["2026-10-21", "2026-10-22", "2026-10-23"]));
  });

  it("finds the last workout's sets for an exercise, with how it felt", () => {
    const rows = rowsOf({
      workout_sessions: [
        session({ id: 9, date: "2026-10-14", ended_at: "2026-10-14T18:00:00Z" }),
        session({ client_id: "w-1", date: "2026-10-21", feel: "hard" }),
        session({ client_id: "w-2", date: "2026-10-28" }),
      ],
      set_logs: [
        set({ session_key: "id:9", weight_lb: 260 }),
        set({ session_key: "w-1", set_number: 2, reps: 11 }),
        set({ session_key: "w-1", set_number: 1 }),
        set({ session_key: "w-2", weight_lb: 280 }),
      ],
    });
    expect(lastSession(rows, "leg-press", "2026-10-28")).toEqual({ date: "2026-10-21", feel: "hard", sets: [{ weight: 270, reps: 12 }, { weight: 270, reps: 11 }] });
    expect(lastSession(rows, "pec-deck", "2026-10-28")).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to make sure it fails.**

```bash
npx vitest run --project unit tests/unit/workout/sessions.test.ts
```

Expected: FAIL, `Failed to resolve import "~/workout/sessions"`.

- [ ] **Step 3: Write `app/workout/sessions.ts`:**

```ts
// How workouts read from the phone's copy: their keys, when one counts as finished, and an exercise's last sets.
// Pure, so Today, the workout screens and the unit tests all share one reading.
import type { Feel, LoggedSet } from "~/domain/progression";
import type { ISODate } from "~/domain/types";
import { keyOf, type Row } from "~/sync/tables";

export type Rows = (table: string) => Row[];

const s = (r: Row, c: string) => r[c] as string;
const n = (r: Row, c: string) => Number(r[c] ?? 0);

/** The key a workout's sets and checks point at: its client_id, or id:<id> for a v1 row. */
export const sessionKey = (session: Row): string => keyOf("workout_sessions", session);

/** Each workout's sets, by its key. A set logged offline has no session_id until the next pull, so the key is the link. */
export function setsBySession(rows: Rows): Map<string, Row[]> {
  const out = new Map<string, Row[]>();
  for (const r of rows("set_logs")) {
    const list = out.get(s(r, "session_key"));
    if (list) list.push(r);
    else out.set(s(r, "session_key"), [r]);
  }
  return out;
}

/**
 * When a workout finished. One started and never finished counts as finished from the next day, as of its last set
 * (or its start, with no sets). Nothing is written for this; every reader applies the rule.
 */
export function finishedAt(session: Row, sets: Row[], today: ISODate): string | null {
  if (session.ended_at) return s(session, "ended_at");
  if (!session.started_at || s(session, "date") >= today) return null;
  return sets.reduce((latest, r) => (s(r, "logged_at") > latest ? s(r, "logged_at") : latest), s(session, "started_at"));
}

/** Days with a set or a "done, no numbers" check. A planned or merely started workout doesn't count. */
export function loggedDates(rows: Rows): Set<ISODate> {
  const dateOf = new Map(rows("workout_sessions").map((r) => [sessionKey(r), s(r, "date")]));
  const out = new Set<ISODate>();
  for (const r of [...rows("set_logs"), ...rows("exercise_checks")]) {
    const d = dateOf.get(s(r, "session_key"));
    if (d) out.add(d);
  }
  return out;
}

/** Days with a workout done: logged, or finished by either rule. */
export function doneDates(rows: Rows, today: ISODate): Set<ISODate> {
  const sets = setsBySession(rows);
  const out = loggedDates(rows);
  for (const r of rows("workout_sessions")) if (finishedAt(r, sets.get(sessionKey(r)) ?? [], today)) out.add(s(r, "date"));
  return out;
}

export interface LastSession {
  date: ISODate;
  sets: LoggedSet[];
  /** How that workout felt, if it was rated. */
  feel: Feel | null;
}

/** The newest workout before `before` that logged this exercise: its sets in order, and how it felt. */
export function lastSession(rows: Rows, exerciseId: string, before: ISODate): LastSession | null {
  const sessions = new Map(rows("workout_sessions").map((r) => [sessionKey(r), r]));
  const dated = rows("set_logs")
    .filter((r) => r.exercise_id === exerciseId)
    .map((r) => ({ r, date: (sessions.get(s(r, "session_key"))?.date as ISODate | undefined) ?? null }))
    .filter((x): x is { r: Row; date: ISODate } => x.date !== null && x.date < before);
  if (dated.length === 0) return null;
  // Newest day first; two workouts on one day go by which logged later.
  const newest = dated.reduce((a, b) => (b.date > a.date || (b.date === a.date && s(b.r, "logged_at") > s(a.r, "logged_at")) ? b : a));
  const key = s(newest.r, "session_key");
  const feel = sessions.get(key)?.feel;
  return {
    date: newest.date,
    feel: feel === "easy" || feel === "right" || feel === "hard" ? feel : null,
    sets: dated
      .filter((x) => s(x.r, "session_key") === key)
      .sort((a, b) => n(a.r, "set_number") - n(b.r, "set_number"))
      .map((x) => ({ weight: n(x.r, "weight_lb"), reps: n(x.r, "reps") })),
  };
}
```

- [ ] **Step 4: Run the test again.** Same command. Expected: PASS, 5 tests.

- [ ] **Step 5: Commit.**

```bash
git add app/workout/sessions.ts tests/unit/workout/sessions.test.ts
git commit -m "Read workouts by their sync key, with the next-day finished rule"
```

---

### Task 2: Lift lists and their edits

**Files:**
- Create: `app/workout/lifts.ts`
- Test: `tests/unit/workout/lifts.test.ts`

- [ ] **Step 1: Write the failing test.** Create `tests/unit/workout/lifts.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { plan } from "~/content";
import { CUSTOM_WORKOUT } from "~/domain/types";
import type { Row } from "~/sync/tables";
import { addLifts, choiceLabel, dropLift, resolveLifts, swapForGood, swapOptions, swapToday, titleLines, undoSwap, workoutMinutes, workoutTitle } from "~/workout/lifts";

const rowsOf = (t: Record<string, Row[]>) => (name: string) => t[name] ?? [];
const LEGS = "wed-legs-shoulders";
const WED = "2026-10-28";
const base = resolveLifts(rowsOf({}), null, LEGS, WED);

describe("lift lists", () => {
  it("follows the template and its always-swaps until the day has its own list", () => {
    expect(base).toHaveLength(6);
    expect(base[5]).toEqual({ position: 5, exercise: "cable-lateral-raise", repMin: 10, repMax: 15, from: "plan" });
    const overridden = resolveLifts(rowsOf({ exercise_overrides: [{ template_id: LEGS, position: 3, exercise_id: "single-leg-extension" }] }), null, LEGS, WED);
    expect(overridden[3].exercise).toBe("single-leg-extension");
    const own = [{ position: 100, exercise: "hammer-curl", repMin: 8, repMax: 12, from: "added" }];
    expect(resolveLifts(rowsOf({}), { lifts: JSON.stringify(own) }, LEGS, WED)).toEqual(own);
    expect(resolveLifts(rowsOf({}), null, CUSTOM_WORKOUT, WED)).toEqual([]);
  });

  it("swaps for today, and undo or swapping back restores the plan lift", () => {
    const swapped = swapToday(base, 5, "dumbbell-lateral-raise");
    expect(swapped[5]).toEqual({ position: 5, exercise: "dumbbell-lateral-raise", repMin: 10, repMax: 15, from: "swap", replaces: "cable-lateral-raise" });
    expect(undoSwap(swapped, 5)[5]).toEqual(base[5]);
    expect(swapToday(swapped, 5, "cable-lateral-raise")[5]).toEqual(base[5]);
    expect(swapForGood(swapped, 5, "seated-lateral-raise")[5]).toEqual({ position: 5, exercise: "seated-lateral-raise", repMin: 10, repMax: 15, from: "plan" });
  });

  it("adds lifts from 100 up and skips without renumbering", () => {
    const added = addLifts(base, ["hammer-curl", "hammer-curl", "leg-press"]);
    expect(added.slice(6)).toEqual([{ position: 100, exercise: "hammer-curl", repMin: 8, repMax: 12, from: "added" }]);
    const twice = addLifts(added, ["dumbbell-curl"]);
    expect(twice.at(-1)!.position).toBe(101);
    expect(dropLift(twice, 1).map((l) => l.position)).toEqual([0, 2, 3, 4, 5, 100, 101]);
  });

  it("offers same-muscle swaps that aren't already in the list", () => {
    const ids = swapOptions(base, 5).map((e) => e.id);
    expect(ids).toContain("dumbbell-lateral-raise");
    expect(ids).not.toContain("cable-lateral-raise");
  });

  it("names workouts for posters and the picker, and estimates their length", () => {
    expect(titleLines(workoutTitle(LEGS))).toEqual(["Legs.", "Shoulders."]);
    expect(titleLines(workoutTitle(plan.planB))).toEqual(["Short.", "Home."]);
    expect([LEGS, "mon-chest-back-arms", plan.planB, CUSTOM_WORKOUT].map(choiceLabel)).toEqual(["Legs, shoulders", "Chest, back, arms", "Short, home", "Your own"]);
    expect(workoutMinutes(12)).toBe(45);
    expect(workoutMinutes(14)).toBe(55);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails.**

```bash
npx vitest run --project unit tests/unit/workout/lifts.test.ts
```

Expected: FAIL, `Failed to resolve import "~/workout/lifts"`.

- [ ] **Step 3: Write `app/workout/lifts.ts`:**

```ts
// A day's lift list (spec section 1, "Lift list"): reading it, and the edits the plan screen makes. Pure.
import { exerciseImage, exercises, plan } from "~/content";
import type { Exercise } from "~/content/schema";
import { CUSTOM_WORKOUT, type ISODate } from "~/domain/types";
import type { Row } from "~/sync/tables";
import type { Rows } from "./sessions";

export interface Lift {
  position: number;
  exercise: string;
  repMin: number;
  repMax: number;
  from: "plan" | "swap" | "added";
  replaces?: string;
}

/** Added lifts number from here, so they never take a template's place. */
export const ADDED_FROM = 100;
const ADDED_REPS = { repMin: 8, repMax: 12 };

const n = (r: Row, c: string) => Number(r[c] ?? 0);

export function workoutTitle(templateId: string): string {
  if (templateId === CUSTOM_WORKOUT) return "Your own";
  if (templateId === plan.planB) return "Short, Home";
  return plan.templates[templateId]?.name ?? "Workout";
}

/** "Legs, Shoulders" as poster lines: "Legs." and "Shoulders." */
export function titleLines(title: string): string[] {
  return title.split(/, | and /).map((part) => `${part}.`);
}

/** The picker's label, in sentence case: "Legs, shoulders". */
export function choiceLabel(templateId: string): string {
  const title = workoutTitle(templateId);
  return title.charAt(0) + title.slice(1).toLowerCase();
}

function parseLifts(raw: unknown): Lift[] {
  try {
    const list: unknown = JSON.parse(String(raw));
    // A lift whose exercise has left the library is dropped rather than breaking the screen.
    return Array.isArray(list) ? (list as Lift[]).filter((l) => exercises.has(l.exercise)) : [];
  } catch {
    return [];
  }
}

/** The day's own list when it has one, else the template with its always-swaps (and a v1 swap made that day). */
export function resolveLifts(rows: Rows, session: Row | null, templateId: string, date: ISODate): Lift[] {
  if (session?.lifts) return parseLifts(session.lifts);
  const template = plan.templates[templateId];
  if (!template) return [];
  const overrides = rows("exercise_overrides").filter((r) => r.template_id === templateId);
  const swaps = rows("exercise_swaps").filter((r) => r.template_id === templateId && r.date === date);
  return template.exercises.map((e, position): Lift => {
    const chosen = (swaps.find((r) => n(r, "position") === position) ?? overrides.find((r) => n(r, "position") === position))?.exercise_id as string | undefined;
    return { position, exercise: chosen && exercises.has(chosen) ? chosen : e.exercise, repMin: e.repMin, repMax: e.repMax, from: "plan" };
  });
}

/** Swap a lift for today only. Swapping back to the original is the same as Undo. */
export function swapToday(list: Lift[], position: number, exercise: string): Lift[] {
  return list.map((l) => {
    if (l.position !== position) return l;
    if (l.from === "added") return { ...l, exercise };
    const original = l.replaces ?? l.exercise;
    if (exercise === original) return { position, exercise, repMin: l.repMin, repMax: l.repMax, from: "plan" };
    return { position, exercise, repMin: l.repMin, repMax: l.repMax, from: "swap", replaces: original };
  });
}

export function undoSwap(list: Lift[], position: number): Lift[] {
  return list.map((l) => (l.position === position && l.from === "swap" && l.replaces ? { position, exercise: l.replaces, repMin: l.repMin, repMax: l.repMax, from: "plan" } : l));
}

/** The lift after a swap-always: the template's new pick, so a plan lift again. */
export function swapForGood(list: Lift[], position: number, exercise: string): Lift[] {
  return list.map((l) => (l.position === position ? { position, exercise, repMin: l.repMin, repMax: l.repMax, from: "plan" } : l));
}

/** Skip or remove a lift. Nothing is renumbered, so logged sets keep pointing at their lift. */
export function dropLift(list: Lift[], position: number): Lift[] {
  return list.filter((l) => l.position !== position);
}

export function addLifts(list: Lift[], ids: string[]): Lift[] {
  let next = Math.max(ADDED_FROM - 1, ...list.map((l) => l.position)) + 1;
  const have = new Set(list.map((l) => l.exercise));
  const added = [...new Set(ids)].filter((id) => exercises.has(id) && !have.has(id)).map((exercise): Lift => ({ position: next++, exercise, ...ADDED_REPS, from: "added" }));
  return [...list, ...added];
}

/** What a lift can be swapped for: the same muscle, and nothing already in today's list. */
export function swapOptions(list: Lift[], position: number): Exercise[] {
  const lift = list.find((l) => l.position === position);
  const group = lift ? exercises.get(lift.replaces ?? lift.exercise)?.group : undefined;
  const inUse = new Set(list.map((l) => l.exercise));
  return [...exercises.values()].filter((e) => e.group === group && !inUse.has(e.id)).sort((a, b) => a.name.localeCompare(b.name));
}

/** About how long a workout takes: 5 minutes to warm up, then 3.5 a set with its rest, to the nearest 5. */
export function workoutMinutes(sets: number): number {
  return Math.round((5 + sets * 3.5) / 5) * 5;
}

/** Every exercise for the add-a-lift picker, by name. */
export const CATALOG = [...exercises.values()]
  .map((e) => ({ id: e.id, name: e.name, group: e.group, equipment: e.equipment, image: exerciseImage(e, 0) }))
  .sort((a, b) => a.name.localeCompare(b.name));
```

- [ ] **Step 4: Run the test again.** Same command. Expected: PASS, 5 tests.

- [ ] **Step 5: Commit.**

```bash
git add app/workout/lifts.ts tests/unit/workout/lifts.test.ts
git commit -m "A day's lift list, with swaps, adds and skips that never renumber"
```

---

### Task 3: The workout model

**Files:**
- Create: `app/workout/model.ts`
- Test: `tests/unit/workout/model.test.ts`

- [ ] **Step 1: Write the failing test.** Create `tests/unit/workout/model.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { meals, plan } from "~/content";
import { parseTime } from "~/domain/dates";
import type { Row } from "~/sync/tables";
import { buildWorkout, lastLine, nextOpen, nextTarget, restLeft, setsText, standingLine } from "~/workout/model";

const WED = "2026-10-28";
const LAST_WED = "2026-10-21";
const LEGS = "wed-legs-shoulders";
const at = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00-05:00`);
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const rowsOf = (t: Record<string, Row[]>) => (name: string) => t[name] ?? [];
const merge = (...ts: Record<string, Row[]>[]) => {
  const out: Record<string, Row[]> = {};
  for (const t of ts) for (const [k, v] of Object.entries(t)) out[k] = [...(out[k] ?? []), ...v];
  return out;
};
const session = (o: Row): Row => ({ id: null, client_id: "w-1", date: WED, template_id: LEGS, started_at: null, ended_at: null, planned_at: `${WED}T14:00:00Z`, lifts: null, feel: null, exercises: null, ...o });
let n = 0;
const set = (o: Row): Row => ({ id: null, client_id: `s-${++n}`, session_id: null, session_key: "w-1", exercise_id: "leg-press", position: 0, set_number: 1, weight_lb: 280, reps: 11, logged_at: `${WED}T17:05:00Z`, ...o });

// Last Wednesday: leg press 270 x 12, 12, the top of its 8 to 12 range.
const history = (feel: string | null = null) => ({
  workout_sessions: [session({ id: 9, client_id: null, date: LAST_WED, started_at: `${LAST_WED}T17:00:00Z`, ended_at: `${LAST_WED}T18:00:00Z`, feel })],
  set_logs: [
    set({ session_key: "id:9", weight_lb: 270, reps: 12, logged_at: `${LAST_WED}T17:05:00Z` }),
    set({ session_key: "id:9", set_number: 2, weight_lb: 270, reps: 12, logged_at: `${LAST_WED}T17:09:00Z` }),
  ],
});

describe("buildWorkout", () => {
  it("opens Plan on today's scheduled workout before anything is saved", () => {
    const m = buildWorkout(rowsOf(history()), at(WED, "08:00"));
    expect(m).toMatchObject({ screen: "plan", key: null, templateId: LEGS, live: true, headline: ["Legs.", "Shoulders."], totals: { lifts: 6, sets: 12, minutes: 45 } });
    expect(m.choices.map((c) => c.label)).toEqual(["Legs, shoulders", "Chest, back, arms", "Chest, shoulders, arms", "Short, home", "Your own"]);
    expect(m.lifts[0]).toMatchObject({ name: "Leg press", rest: 150, suggestion: { weight: 280, goUp: true } });
    expect(lastLine(m.lifts[0], m.date)).toEqual({ goUp: true, text: "Last Wednesday: 270 × 12, 12. Both sets hit the top, so 280 today." });
    expect(m.canMove).toBe(true);
  });

  it("holds last week's weight after a hard workout", () => {
    const m = buildWorkout(rowsOf(history("hard")), at(WED, "08:00"));
    expect(m.lifts[0].suggestion).toEqual({ weight: 270, goUp: false });
    expect(lastLine(m.lifts[0], m.date)).toEqual({ goUp: false, text: "Last Wednesday: 270 × 12, 12. It felt hard, so 270 again today." });
  });

  it("keeps logged sets with their lift after swaps, adds and skips", () => {
    const lifts = [
      { position: 0, exercise: "leg-press", repMin: 8, repMax: 12, from: "plan" },
      { position: 2, exercise: "lying-leg-curl", repMin: 10, repMax: 12, from: "plan" },
      { position: 5, exercise: "dumbbell-lateral-raise", repMin: 10, repMax: 15, from: "swap", replaces: "cable-lateral-raise" },
      { position: 100, exercise: "hammer-curl", repMin: 8, repMax: 12, from: "added" },
    ];
    const rows = rowsOf({
      workout_sessions: [session({ started_at: `${WED}T17:00:00Z`, lifts: JSON.stringify(lifts) })],
      set_logs: [set({ exercise_id: "hammer-curl", position: 100, weight_lb: 35, reps: 10 })],
    });
    const m = buildWorkout(rows, at(WED, "12:30"));
    expect(m.screen).toBe("set");
    expect(m.lifts.map((l) => l.position)).toEqual([0, 2, 5, 100]);
    expect(m.lifts[2]).toMatchObject({ name: "Dumbbell lateral raise", from: "swap" });
    expect(m.lifts[3].sets).toMatchObject([{ setNumber: 1, weight: 35, reps: 10 }]);
    expect(m.current?.position).toBe(0);
  });

  it("picks the current lift and the next set's target", () => {
    const started = merge(history(), { workout_sessions: [session({ started_at: `${WED}T17:00:00Z` })] });
    const one = buildWorkout(rowsOf(merge(started, { set_logs: [set({})] })), at(WED, "12:10"));
    expect(one.current?.name).toBe("Leg press");
    expect(nextTarget(one.current!, one.setsPerLift)).toEqual({ setNumber: 2, weight: 280, reps: 12 });
    expect(standingLine(one.current!, one.setsPerLift)).toBe("11 on set 1, so 280 holds next week. Match or beat it here.");

    const both = buildWorkout(rowsOf(merge(started, { set_logs: [set({}), set({ set_number: 2, reps: 12, logged_at: `${WED}T17:09:00Z` })] })), at(WED, "12:10"));
    expect(both.current?.name).toBe("Dumbbell Romanian deadlift");
    expect(nextTarget(both.current!, both.setsPerLift)).toEqual({ setNumber: 1, weight: null, reps: 8 });
    expect(nextOpen(both.lifts, 0)?.position).toBe(1);
  });

  it("counts the rest down from the last set after a reopen", () => {
    const rows = rowsOf({ workout_sessions: [session({ started_at: `${WED}T17:00:00Z` })], set_logs: [set({})] });
    const m = buildWorkout(rows, at(WED, "12:06"));
    expect(restLeft(m, Date.parse(`${WED}T17:06:00Z`))).toEqual({ endsAt: Date.parse(`${WED}T17:07:30Z`), total: 150, position: 0, next: { position: 0, setNumber: 2, name: "Leg press" } });
    expect(restLeft(m, Date.parse(`${WED}T17:08:00Z`))).toBeNull();
  });

  it("lists what moved up on Done, and the feel changes it", () => {
    const done = (feel: string | null) =>
      rowsOf({
        workout_sessions: [session({ started_at: `${WED}T17:00:00Z`, ended_at: `${WED}T18:00:00Z`, feel })],
        set_logs: [
          set({ reps: 12 }),
          set({ set_number: 2, reps: 12 }),
          set({ exercise_id: "lying-leg-curl", position: 2, weight_lb: 110, reps: 12 }),
          set({ exercise_id: "lying-leg-curl", position: 2, set_number: 2, weight_lb: 110, reps: 12 }),
        ],
      });
    const m = buildWorkout(done(null), at(WED, "13:10"));
    expect(m.screen).toBe("done");
    expect(m.movedUp).toEqual([{ name: "Leg press", from: 280, to: 290 }, { name: "Lying leg curl", from: 110, to: 120 }]);
    expect(m.totals).toEqual({ lifts: 2, sets: 4, minutes: 60 });
    expect(m.rockyLine).toBe("Two lifts moved up.");
    expect(setsText(m.lifts[0].sets)).toBe("280 × 12, 12");
    expect(buildWorkout(done("hard"), at(WED, "13:10")).movedUp).toEqual([]);
    expect(buildWorkout(done("easy"), at(WED, "13:10")).movedUp[0]).toEqual({ name: "Leg press", from: 280, to: 300 });
  });

  it("names the next meal in Rocky's line when it is close", () => {
    const lunch = [...meals.values()].find((x) => x.pool === "main" && x.mode === "any")!;
    const rows = rowsOf({
      workout_sessions: [session({ started_at: `${WED}T17:00:00Z`, ended_at: `${WED}T18:00:00Z` })],
      set_logs: [set({})],
      planned_meals: [{ date: WED, slot: "lunch", meal_slug: lunch.slug, swapped: 0 }],
    });
    const m = buildWorkout(rows, at(WED, hhmm(parseTime(plan.slotTimes.lunch) - 30)));
    expect(m.rockyLine).toBe(`Same weights next week. Beat the reps. ${lunch.name} within the hour.`);
  });

  it("reads yesterday's unfinished workout as finished, and today starts fresh", () => {
    const TUE = "2026-10-27";
    const rows = rowsOf({
      workout_sessions: [session({ client_id: "w-0", date: TUE, started_at: `${TUE}T17:00:00Z` })],
      set_logs: [set({ session_key: "w-0", logged_at: `${TUE}T17:20:00Z` })],
    });
    expect(buildWorkout(rows, at(WED, "09:00"), { date: TUE })).toMatchObject({ screen: "done", live: false, endedAt: null, finishedAt: `${TUE}T17:20:00Z` });
    expect(buildWorkout(rows, at(WED, "09:00"))).toMatchObject({ screen: "plan", key: null });
  });

  it("shows a planned workout on Plan, and starts a second workout when another is asked for after a finish", () => {
    expect(buildWorkout(rowsOf({ workout_sessions: [session({})] }), at(WED, "09:00"))).toMatchObject({ screen: "plan", key: "w-1" });
    const finished = rowsOf({ workout_sessions: [session({ started_at: `${WED}T17:00:00Z`, ended_at: `${WED}T18:00:00Z` })] });
    expect(buildWorkout(finished, at(WED, "15:00"), { template: "custom" })).toMatchObject({ screen: "plan", key: null, templateId: "custom", lifts: [] });
    expect(buildWorkout(finished, at(WED, "15:00"), { template: LEGS })).toMatchObject({ screen: "done", key: "w-1" });
  });

  it("writes weights that changed set to set in full", () => {
    expect(setsText([{ weight: 270, reps: 12 }, { weight: 260, reps: 10 }])).toBe("270 × 12, 260 × 10");
  });
});
```

- [ ] **Step 2: Run it to make sure it fails.**

```bash
npx vitest run --project unit tests/unit/workout/model.test.ts
```

Expected: FAIL, `Failed to resolve import "~/workout/model"`.

- [ ] **Step 3: Write `app/workout/model.ts`:**

```ts
// Everything the four workout screens show, worked out from the phone's copy. Pure: the browser and the unit tests run it.
import { exercises, meals, plan } from "~/content";
import { weekSchedule, type ScheduleDay } from "~/content/schedule";
import { optionalTemplateFor, setsFor, templateFor, weekType, type Moves } from "~/domain/calendar";
import { addDays, daysBetween, formatClock, isISODate, localMinutes, mealDate, parseTime, weekStart, weekday } from "~/domain/dates";
import { nextSuggestion, restSeconds, type Feel, type LoggedSet, type Suggestion } from "~/domain/progression";
import { CUSTOM_WORKOUT, SLOTS, type ISODate } from "~/domain/types";
import { keyOf, type Row } from "~/sync/tables";
import { choiceLabel, resolveLifts, titleLines, workoutMinutes, workoutTitle, type Lift } from "./lifts";
import { doneDates, finishedAt, lastSession, sessionKey, setsBySession, type LastSession, type Rows } from "./sessions";

const s = (r: Row, c: string) => r[c] as string;
const n = (r: Row, c: string) => Number(r[c] ?? 0);
const asFeel = (v: unknown): Feel | null => (v === "easy" || v === "right" || v === "hard" ? v : null);
const known = (id: string | null | undefined): id is string => !!id && (id === CUSTOM_WORKOUT || id in plan.templates);

const DAY_NAME = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const COUNT = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"];

export interface SetView {
  key: string;
  setNumber: number;
  weight: number;
  reps: number;
  loggedAt: string;
}

export interface LiftView extends Lift {
  name: string;
  bodyWeight: boolean;
  increment: number;
  /** Seconds of rest after each set. */
  rest: number;
  sets: SetView[];
  /** "Done, no numbers". */
  checked: boolean;
  done: boolean;
  last: LastSession | null;
  suggestion: Suggestion;
  note: string | null;
}

export type WorkoutScreen = "plan" | "set" | "done";

export interface WorkoutModel {
  date: ISODate;
  /** Today, so the clock, rest and ping run. A past day is logged after the fact. */
  live: boolean;
  screen: WorkoutScreen;
  /** The workout's key, or null before its first change creates it. */
  key: string | null;
  templateId: string | null;
  headline: string[];
  startedAt: string | null;
  endedAt: string | null;
  /** The end, or for a workout never finished, its last set from the next day on. */
  finishedAt: string | null;
  feel: Feel | null;
  setsPerLift: number;
  lifts: LiftView[];
  /** The first unfinished lift in list order, or null when every lift is done. */
  current: LiftView | null;
  choices: { templateId: string; label: string }[];
  /** Plan: what the list holds. Done: lifts with sets or a check, and the minutes it took. */
  totals: { lifts: number; sets: number; minutes: number };
  movedUp: { name: string; from: number; to: number }[];
  rockyLine: string;
  canMove: boolean;
  schedule: ScheduleDay[];
}

export interface WorkoutAsk {
  date?: string | null;
  template?: string | null;
}

/** Today's scheduled workout first, then the other gym workouts, then Short, home, then Your own. */
function choices(scheduled: string | null, picked: string | null): WorkoutModel["choices"] {
  const gym = Object.entries(plan.templates).filter(([, t]) => t.kind === "gym").map(([id]) => id);
  const ids = [...new Set([scheduled, picked, ...gym, plan.planB, CUSTOM_WORKOUT].filter((id): id is string => id !== null))];
  return ids.map((templateId) => ({ templateId, label: choiceLabel(templateId) }));
}

function rockyLine(movedUp: number, rows: Rows, date: ISODate, now: Date, live: boolean): string {
  const lead = movedUp === 0 ? "Same weights next week. Beat the reps." : `${COUNT[movedUp] ?? movedUp} lift${movedUp === 1 ? "" : "s"} moved up.`;
  if (!live) return lead;
  const eaten = new Set(rows("meal_logs").filter((r) => r.date === date && r.category === "planned").map((r) => s(r, "slot")));
  const planned = new Map(rows("planned_meals").filter((r) => r.date === date).map((r) => [s(r, "slot"), s(r, "meal_slug")]));
  const minutes = localMinutes(now);
  const next = SLOTS.map((slot) => ({ slot, at: parseTime(plan.slotTimes[slot]), meal: meals.get(planned.get(slot) ?? "") })).find(
    (x) => x.meal && !eaten.has(x.slot) && x.at >= minutes - 30,
  );
  if (!next?.meal) return lead;
  return `${lead} ${next.meal.name} ${next.at - minutes <= 60 ? "within the hour" : `at ${formatClock(next.at)}`}.`;
}

export function buildWorkout(rows: Rows, now: Date, ask: WorkoutAsk = {}): WorkoutModel {
  const today = mealDate(now);
  const date = isISODate(ask.date) && ask.date < today ? ask.date : today;
  const live = date === today;
  const asked = known(ask.template) ? ask.template : null;
  const bySession = setsBySession(rows);
  const setsOf = (r: Row) => bySession.get(sessionKey(r)) ?? [];
  const sessions = rows("workout_sessions").filter((r) => r.date === date);
  // At most one open workout a day (spec section 1). A past day's unfinished one reads as finished instead.
  const open = live ? sessions.find((r) => !r.ended_at) : undefined;
  const finished = sessions
    .map((r) => ({ r, at: finishedAt(r, setsOf(r), today) }))
    .filter((x): x is { r: Row; at: string } => x.at !== null)
    .sort((a, b) => b.at.localeCompare(a.at))[0]?.r;
  const moves: Moves = Object.fromEntries(rows("schedule_moves").map((r) => [s(r, "date"), (r.template_id as string | null) ?? null]));
  const scheduled = templateFor(plan, date, moves);

  let row: Row | null = null;
  let screen: WorkoutScreen = "plan";
  if (open) {
    row = open;
    screen = open.started_at ? "set" : "plan";
  } else if (finished && (!asked || asked === finished.template_id)) {
    // Asking for another workout once one is finished starts a second one.
    row = finished;
    screen = "done";
  }
  const templateId = row ? s(row, "template_id") : (asked ?? scheduled ?? (live ? optionalTemplateFor(plan, date) : null));

  const setsPerLift = setsFor(plan, date);
  const deload = weekType(plan, date) === "deload";
  const key = row ? sessionKey(row) : null;
  const todaysSets = row ? setsOf(row) : [];
  const checks = new Set(key ? rows("exercise_checks").filter((r) => r.session_key === key).map((r) => s(r, "exercise_id")) : []);
  const notes = new Map(rows("exercise_notes").map((r) => [s(r, "exercise_id"), s(r, "note")]));

  const lifts: LiftView[] = (templateId ? resolveLifts(rows, row, templateId, date) : []).map((l) => {
    const ex = exercises.get(l.exercise)!;
    const sets = todaysSets
      .filter((r) => n(r, "position") === l.position)
      .sort((a, b) => n(a, "set_number") - n(b, "set_number"))
      .map((r) => ({ key: keyOf("set_logs", r), setNumber: n(r, "set_number"), weight: n(r, "weight_lb"), reps: n(r, "reps"), loggedAt: s(r, "logged_at") }));
    const checked = checks.has(l.exercise);
    const last = lastSession(rows, l.exercise, date);
    return {
      ...l,
      name: ex.name,
      bodyWeight: ex.equipment === "body-weight",
      increment: ex.increment,
      rest: restSeconds(ex.compound),
      sets,
      checked,
      done: checked || sets.length >= setsPerLift,
      last,
      suggestion: nextSuggestion(last?.sets ?? null, { repMax: l.repMax, increment: ex.increment, deload }, last?.feel ?? null),
      note: notes.get(l.exercise) ?? null,
    };
  });

  const startedAt = (row?.started_at as string | null | undefined) ?? null;
  const endedAt = (row?.ended_at as string | null | undefined) ?? null;
  const end = row ? finishedAt(row, todaysSets, today) : null;
  const feel = asFeel(row?.feel);
  // "Moves up next week" holds if next week is the deload.
  const nextDeload = weekType(plan, addDays(date, 7)) === "deload";
  const movedUp = lifts.flatMap((l) => {
    if (l.sets.length === 0) return [];
    const next = nextSuggestion(l.sets, { repMax: l.repMax, increment: l.increment, deload: nextDeload }, feel);
    return next.goUp && next.weight !== null ? [{ name: l.name, from: Math.max(...l.sets.map((x) => x.weight)), to: next.weight }] : [];
  });
  // A workout logged on a later day has no real length, so its minutes are 0 and Done leaves them out.
  const sameDay = startedAt !== null && mealDate(new Date(startedAt)) === date;
  const tookMinutes = sameDay && end ? Math.max(0, Math.round((Date.parse(end) - Date.parse(startedAt)) / 60_000)) : 0;
  const totals =
    screen === "done"
      ? { lifts: lifts.filter((l) => l.sets.length > 0 || l.checked).length, sets: lifts.reduce((a, l) => a + l.sets.length, 0), minutes: tookMinutes }
      : { lifts: lifts.length, sets: lifts.length * setsPerLift, minutes: workoutMinutes(lifts.length * setsPerLift) };
  const done = doneDates(rows, today);

  return {
    date,
    live,
    screen,
    key,
    templateId,
    headline: titleLines(templateId ? workoutTitle(templateId) : "Pick a workout"),
    startedAt,
    endedAt,
    finishedAt: end,
    feel,
    setsPerLift,
    lifts,
    current: lifts.find((l) => !l.done) ?? null,
    choices: choices(scheduled, templateId),
    totals,
    movedUp,
    rockyLine: rockyLine(movedUp.length, rows, date, now, live),
    canMove: live && screen === "plan" && !done.has(date),
    schedule: weekSchedule(weekStart(date), moves, done),
  };
}

/** The next unfinished lift after this one in list order, wrapping round, or null when nothing else is left. */
export function nextOpen(lifts: LiftView[], position: number): LiftView | null {
  const i = lifts.findIndex((l) => l.position === position);
  return [...lifts.slice(i + 1), ...lifts.slice(0, Math.max(0, i))].find((l) => !l.done) ?? null;
}

export interface SetTarget {
  setNumber: number;
  weight: number | null;
  reps: number;
}

/** The next set on a lift: today's weight so far, else the suggestion; last time's reps for that set, else the bottom of the range. */
export function nextTarget(lift: LiftView, setsPerLift: number): SetTarget | null {
  if (lift.done) return null;
  const setNumber = Array.from({ length: setsPerLift }, (_, i) => i + 1).find((k) => !lift.sets.some((x) => x.setNumber === k)) ?? setsPerLift;
  return {
    setNumber,
    weight: lift.sets.at(-1)?.weight ?? lift.suggestion.weight ?? (lift.bodyWeight ? 0 : null),
    reps: lift.last?.sets[setNumber - 1]?.reps ?? lift.repMin,
  };
}

export interface RestState {
  endsAt: number;
  total: number;
  /** The lift whose set was just logged. Rest shows its rows. */
  position: number;
  /** The set the rest leads to. */
  next: { position: number; setNumber: number; name: string };
}

/** The rest after a set: it leads to this lift's next set, else the next unfinished lift. Null after the workout's last set. */
export function restAfter(lifts: LiftView[], setsPerLift: number, position: number, setNumber: number, loggedAt: number): RestState | null {
  const lift = lifts.find((l) => l.position === position);
  if (!lift) return null;
  const same = setNumber < setsPerLift;
  const nextLift = same ? lift : nextOpen(lifts, position);
  if (!nextLift) return null;
  const nextSet = same ? setNumber + 1 : (nextTarget(nextLift, setsPerLift)?.setNumber ?? 1);
  return { endsAt: loggedAt + lift.rest * 1000, total: lift.rest, position, next: { position: nextLift.position, setNumber: nextSet, name: nextLift.name } };
}

/** After a reopen: the rest still running from the newest set, if any (spec section 3, "After a reopen"). */
export function restLeft(m: WorkoutModel, nowMs: number): RestState | null {
  if (!m.live || m.screen !== "set") return null;
  const latest = m.lifts.flatMap((l) => l.sets.map((x) => ({ l, x }))).sort((a, b) => b.x.loggedAt.localeCompare(a.x.loggedAt))[0];
  if (!latest) return null;
  const rest = restAfter(m.lifts, m.setsPerLift, latest.l.position, latest.x.setNumber, Date.parse(latest.x.loggedAt));
  return rest && rest.endsAt > nowMs ? rest : null;
}

/** "270 × 12, 12", or "270 × 12, 260 × 10" when the weight changed. */
export function setsText(sets: LoggedSet[]): string {
  return sets.map((x, i) => (i > 0 && sets[i - 1].weight === x.weight ? `${x.reps}` : `${x.weight} × ${x.reps}`)).join(", ");
}

function whenLast(date: ISODate, today: ISODate): string {
  if (daysBetween(date, today) <= 7) return `Last ${DAY_NAME[weekday(date)]}`;
  const [, m, d] = date.split("-").map(Number);
  return `On ${MONTH_SHORT[m - 1]} ${d}`;
}

/** Set's line on last time. It is the brass callout only when the weight goes up. */
export function lastLine(lift: LiftView, today: ISODate): { goUp: boolean; text: string } {
  const last = lift.last;
  if (!last) {
    return {
      goUp: false,
      text: lift.bodyWeight ? "First time on this one. Body weight counts as 0 lb; add any weight you hold or wear." : "First time on this one. Pick a weight you can do for the bottom of the range.",
    };
  }
  const head = `${whenLast(last.date, today)}: ${setsText(last.sets)}.`;
  const all = last.sets.length === 1 ? "Your set" : last.sets.length === 2 ? "Both sets" : "Every set";
  const weight = lift.suggestion.weight;
  if (lift.suggestion.goUp) return { goUp: true, text: `${head} ${all} hit the top${last.feel === "easy" ? " and it felt easy" : ""}, so ${weight} today.` };
  if (last.feel === "hard" && last.sets.every((x) => x.reps >= lift.repMax)) return { goUp: false, text: `${head} It felt hard, so ${weight} again today.` };
  return { goUp: false, text: `${head} Beat it today.` };
}

/** Rest's line on where the lift stands, for example "11 on set 1, so 280 holds next week. Match or beat it here." */
export function standingLine(lift: LiftView, setsPerLift: number): string {
  const short = lift.sets.find((x) => x.reps < lift.repMax);
  const top = Math.max(...lift.sets.map((x) => x.weight));
  const more = lift.sets.length < setsPerLift;
  if (short) return `${short.reps} on set ${short.setNumber}, so ${top} holds next week.${more ? " Match or beat it here." : ""}`;
  if (more) return `Set ${lift.sets.length} hit ${lift.repMax}. Hit it again and ${top + lift.increment} is next week's weight.`;
  return `Every set hit ${lift.repMax}, so ${top + lift.increment} is next week's weight.`;
}
```

- [ ] **Step 4: Run the test again.** Same command. Expected: PASS, 10 tests.

- [ ] **Step 5: Commit.**

```bash
git add app/workout/model.ts tests/unit/workout/model.test.ts
git commit -m "The workout model: which screen, the lifts, targets, rest and what moved up"
```

---

### Task 4: Today reads workouts the new way

Today still maps sets to workouts by `session_id` (null on the phone for a set logged offline), treats any workout without `ended_at` as started, and ignores the feel. This task moves it onto `sessions.ts` and `lifts.ts`.

**Files:**
- Modify: `app/today/model.ts`
- Test: `tests/unit/today/model.test.ts`

- [ ] **Step 1: Fix the existing fixture and write the failing tests.** In `tests/unit/today/model.test.ts`:

1. In the test "says what goes up when every set hit the top last time", the sets now carry their workout's key. Change the `sets` line to:

```ts
    const sets: Row[] = [1, 2].map((n) => ({ id: n, session_id: 9, session_key: "id:9", exercise_id: firstLift.id, position: 0, set_number: n, weight_lb: 270, reps: legs.exercises[0].repMax, logged_at: `${lastWed}T17:00:00Z`, client_id: null }));
```

2. Add these tests at the end of the `describe("buildToday", ...)` block:

```ts
  const lastWedSession = (feel: string | null) => ({
    workout_sessions: [{ id: 9, client_id: null, date: "2026-10-21", template_id: "wed-legs-shoulders", started_at: "2026-10-21T17:00:00Z", ended_at: "2026-10-21T18:00:00Z", exercises: null, feel }],
    set_logs: [1, 2].map((n) => ({ id: n, client_id: null, session_id: 9, session_key: "id:9", exercise_id: firstLift.id, position: 0, set_number: n, weight_lb: 270, reps: 12, logged_at: "2026-10-21T17:05:00Z" })),
  });
  const breakfastEaten = { planned_meals: planned(WED), meal_logs: [ate(WED, "breakfast", 1, `${WED}T12:40:00Z`)] };

  it("lets an easy last session put two steps on the go-up note, and a hard one hold", () => {
    const easy = asPlan(buildToday(rowsOf({ ...breakfastEaten, ...lastWedSession("easy") }), at(WED, "09:00"), true));
    expect(easy.training?.goUp).toBe(`${firstLift.name}: both sets hit 12 last time and it felt easy. Add 20 lb today.`);
    const hard = asPlan(buildToday(rowsOf({ ...breakfastEaten, ...lastWedSession("hard") }), at(WED, "09:00"), true));
    expect(hard.training?.goUp).toBeNull();
  });

  it("shows a workout planned but not started, with Start and the change link", () => {
    const planB = plan.templates[plan.planB]!;
    const workout_sessions = [{ id: null, client_id: "w-1", date: WED, template_id: plan.planB, started_at: null, ended_at: null, planned_at: `${WED}T13:00:00Z`, lifts: null, feel: null, exercises: null }];
    const m = asPlan(buildToday(rowsOf({ ...breakfastEaten, workout_sessions }), at(WED, "09:00"), true));
    expect(m.next).toEqual({ kind: "workout", templateId: plan.planB, started: false });
    expect(m.training).toMatchObject({ templateId: plan.planB, headline: ["Short.", "Home.", "6 lifts."], started: false, workoutKey: "w-1", buttonLabel: `Start: ${exercises.get(planB.exercises[0].exercise)!.name}` });
    expect(m.canChange).toBe(true);
  });

  it("counts a set logged offline, before its workout has a server id", () => {
    // No meal eaten, so only the set can make the day count.
    const rows = rowsOf({
      planned_meals: planned(WED),
      workout_sessions: [{ id: null, client_id: "w-1", date: WED, template_id: "wed-legs-shoulders", started_at: `${WED}T17:00:00Z`, ended_at: null, planned_at: null, lifts: null, feel: null, exercises: null }],
      set_logs: [{ id: null, client_id: "s-1", session_id: null, session_key: "w-1", exercise_id: firstLift.id, position: 0, set_number: 1, weight_lb: 280, reps: 11, logged_at: `${WED}T17:05:00Z` }],
    });
    const m = asPlan(buildToday(rows, at(WED, "12:10"), true));
    expect(m.training).toMatchObject({ started: true, buttonLabel: `Resume: ${firstLift.name}` });
    expect(m.canChange).toBe(false);
    expect(m.week.find((d) => d.today)?.counted).toBe(true);
  });
```

- [ ] **Step 2: Run it to make sure it fails.**

```bash
npx vitest run --project unit tests/unit/today/model.test.ts
```

Expected: the three new tests fail (`canChange` and `workoutKey` are undefined, the planned workout reads as started, the offline set doesn't count, the go-up note ignores the feel). The fixture change keeps the old go-up test passing.

- [ ] **Step 3: Change `app/today/model.ts`.**

1. Replace the import block's content, workout and sync lines so the top reads:

```ts
// Everything Today shows, worked out from the phone's copy of the data. Pure: the browser and the unit tests both run it.
import { exercises, foods, meals, messages, plan, type MealWithMacros } from "~/content";
import { resolveTargets, type Targets } from "~/content/targets";
import { dayMode, isRelaxedDay, isTrainingDay, optionalTemplateFor, setsFor, templateFor, weekNumber, weekType, type Moves } from "~/domain/calendar";
import { checkInWindow } from "~/domain/checkin";
import { addDays, formatClock, localDate, localMinutes, mealDate, parseTime, weekStart, weekday } from "~/domain/dates";
import { countedDay, dessertAllowance, fullDay, habitStreak, overAllowanceDates, type DayActivity } from "~/domain/habits";
import { pickSituation, renderMessage } from "~/domain/messages";
import { nextUp, type NextUp } from "~/domain/next-up";
import { nextSuggestion } from "~/domain/progression";
import { SLOTS, slotPool, type ISODate, type Slot } from "~/domain/types";
import { sevenDayAverage } from "~/domain/weight";
import { keyOf, type Row } from "~/sync/tables";
import { resolveLifts, titleLines, workoutMinutes, workoutTitle } from "~/workout/lifts";
import { doneDates, lastSession, loggedDates, sessionKey, type Rows } from "~/workout/sessions";

export type { Rows };
```

   and delete the old `export type Rows = (table: string) => Row[];` line.

2. Replace the `TrainingModel` interface with:

```ts
export interface TrainingModel {
  templateId: string;
  headline: string[];
  meta: string;
  goUp: string | null;
  started: boolean;
  /** The open workout's key, or null when Start has to plan it first. */
  workoutKey: string | null;
  buttonLabel: string;
}
```

3. In `PlanToday`, replace `canMove: boolean;` with:

```ts
  /** "Change today's workout" shows: nothing started, finished or logged yet. */
  canChange: boolean;
```

   and delete the `schedule: ScheduleDay[];` line (only the removed move sheet read it).

4. Make `dateLabel` exported (the workout route shows the same label on a past day):

```ts
export function dateLabel(d: ISODate): string {
```

5. Delete `workoutHeadline`, `resolveExercises` and `lastSets`, and replace `trainingModel` with:

```ts
function trainingModel(rows: Rows, date: ISODate, templateId: string, open: Row | undefined): TrainingModel {
  const list = resolveLifts(rows, open ?? null, templateId, date);
  const deload = weekType(plan, date) === "deload";
  const sets = setsFor(plan, date);
  let goUp: string | null = null;
  for (const l of list) {
    const ex = exercises.get(l.exercise)!;
    const last = lastSession(rows, l.exercise, date);
    const next = nextSuggestion(last?.sets ?? null, { repMax: l.repMax, increment: ex.increment, deload }, last?.feel ?? null);
    if (last && next.goUp && next.weight !== null) {
      const top = Math.max(...last.sets.map((x) => x.weight));
      goUp = `${ex.name}: ${setsWord(last.sets.length)} hit ${l.repMax} last time${last.feel === "easy" ? " and it felt easy" : ""}. Add ${next.weight - top} lb today.`;
      break;
    }
  }
  const started = Boolean(open?.started_at);
  const key = open ? sessionKey(open) : null;
  const logged = key ? rows("set_logs").filter((r) => r.session_key === key) : [];
  const checked = new Set(key ? rows("exercise_checks").filter((r) => r.session_key === key).map((r) => s(r, "exercise_id")) : []);
  const current = list.find((l) => !checked.has(l.exercise) && logged.filter((r) => n(r, "position") === l.position).length < sets) ?? list.at(-1);
  const name = current ? exercises.get(current.exercise)!.name : null;
  const verb = started ? "Resume" : "Start";
  return {
    templateId,
    headline: [...titleLines(workoutTitle(templateId)), `${list.length} lifts.`],
    meta: `Noon · ${list.length * sets} sets · about ${workoutMinutes(list.length * sets)} min · week ${weekNumber(plan, date)} of ${WEEKS}${deload ? " · deload" : ""}`,
    goUp,
    started,
    workoutKey: key,
    buttonLabel: name ? `${verb}: ${name}` : verb,
  };
}
```

6. In `buildToday`, replace the four lines that build `sessionDate` and `workoutDates`:

```ts
  const sessions = rows("workout_sessions");
  const sessionDate = new Map(sessions.map((r) => [n(r, "id"), s(r, "date")]));
  const workoutDates = new Set<ISODate>();
  for (const r of [...rows("set_logs"), ...rows("exercise_checks")]) {
    const d = sessionDate.get(n(r, "session_id"));
    if (d) workoutDates.add(d);
  }
```

   with:

```ts
  const sessions = rows("workout_sessions");
  const workoutDates = loggedDates(rows);
```

7. Replace the block from `const templateId = templateFor(plan, date, moves);` through `const optionalId = optionalTemplateFor(plan, date);` with:

```ts
  const todaySessions = sessions.filter((r) => r.date === date);
  // At most one open workout a day: planned or started, and not finished.
  const open = todaySessions.find((r) => !r.ended_at);
  const finished = todaySessions.some((r) => r.ended_at);
  // A workout picked on Plan replaces the day's scheduled one, for today only.
  const templateId = (open?.template_id as string | undefined) ?? templateFor(plan, date, moves);
  const setDates = doneDates(rows, date);
  const training = templateId ? trainingModel(rows, date, templateId, open) : null;
  const optionalId = optionalTemplateFor(plan, date);
```

8. In the `nextUp({...})` call, change the workout line to:

```ts
    workout: templateId ? { templateId, started: Boolean(open?.started_at), finished } : null,
```

9. In the `pickSituation({...})` call, change `sessionStarted` to:

```ts
    sessionStarted: todaySessions.some((r) => r.started_at),
```

10. In the `renderMessage(...)` call, change the `workout` value to:

```ts
    workout: templateId ? workoutTitle(templateId) : "",
```

11. In the returned object, replace `canMove: !open && !finished && !workoutDates.has(date),` and `schedule: weekSchedule(monday, moves, setDates),` with:

```ts
    canChange: !open?.started_at && !finished && !workoutDates.has(date),
```

`missedTwoInARow(date, setDates, moves)` stays as it is; `setDates` now also holds a workout finished by the next-day rule.

- [ ] **Step 4: Run the test again.** Same command. Expected: PASS, the old tests included. Then check nothing else imported the removed names:

```bash
rg -n "workoutHeadline|weekSchedule|ScheduleDay" app/today/model.ts
```

Expected: no output.

- [ ] **Step 5: Commit.** (Today's screen is updated in Task 15; until then `npm run typecheck` reports `today.tsx`'s use of `canMove`, `schedule` and `link`, which is expected.)

```bash
git add app/today/model.ts tests/unit/today/model.test.ts
git commit -m "Today reads workouts by key: planned isn't started, offline sets count, the feel shapes go-up"
```

---

### Task 5: A move drops a workout planned but not started

**Files:**
- Modify: `app/sync/mutators.ts` (`moveWorkout`)
- Test: `tests/unit/sync/workout-mutators.test.ts`

- [ ] **Step 1: Write the failing test.** Add to the `describe("workout mutators", ...)` block:

```ts
  it("drops a workout planned but not started when its day moves, and keeps a started one", async () => {
    const tx = await planned();
    await run(tx, "moveWorkout", { a: "2026-10-28", b: "2026-10-29" });
    expect(await tx.get("workout_sessions", W)).toBeNull();

    const started = await planned();
    await run(started, "startWorkout", { workout: W, at: ctx.now });
    await run(started, "moveWorkout", { a: "2026-10-28", b: "2026-10-29" });
    expect(await started.get("workout_sessions", W)).toMatchObject({ started_at: ctx.now });
  });
```

- [ ] **Step 2: Run it to make sure it fails.**

```bash
npx vitest run --project unit tests/unit/sync/workout-mutators.test.ts
```

Expected: FAIL, the planned workout is still there.

- [ ] **Step 3: Change `moveWorkout`'s `run`** in `app/sync/mutators.ts`. After the `for (const d of swapWorkouts(...))` loop, add:

```ts
      // A workout planned but not started follows the schedule, so it goes and the day replans from its new workout.
      for (const r of await tx.scan("workout_sessions")) {
        if ((r.date === a.a || r.date === a.b) && !r.started_at && !r.ended_at) tx.delete("workout_sessions", keyOf("workout_sessions", r));
      }
```

- [ ] **Step 4: Run the test again.** Same command. Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add app/sync/mutators.ts tests/unit/sync/workout-mutators.test.ts
git commit -m "Moving a day drops a workout planned there but not started"
```

---

### Task 6: A planned workout doesn't silence "Lift at noon"

**Files:**
- Modify: `app/server/reminders.server.ts`
- Test: `tests/workers/reminders.test.ts`

- [ ] **Step 1: Write the failing test.** In `tests/workers/reminders.test.ts`, add `import { workoutSessions } from "~/db/schema";` and this test inside `describe("runReminders", ...)`:

```ts
  it("still sends the lift reminder when the workout was only planned", async () => {
    await db().insert(workoutSessions).values({ date: "2026-11-04", templateId: "wed-legs-shoulders", clientId: "planned-only", plannedAt: "2026-11-04T13:00:00Z" });
    const c = collector();
    await runReminders(db(), chicago("2026-11-04", "11:30"), c.send);
    expect(c.sent.map((m) => m.title)).toContain("Lift at noon");
  });
```

- [ ] **Step 2: Run it to make sure it fails.**

```bash
npx vitest run --project workers tests/workers/reminders.test.ts
```

Expected: FAIL, the planned row counts as a started session, so no "Lift at noon".

- [ ] **Step 3: Fix the fact.** In `app/server/reminders.server.ts`, change the `sessionStarted` line to:

```ts
      sessionStarted: sessions.some((s) => s.startedAt !== null),
```

- [ ] **Step 4: Run the test again.** Same command. Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add app/server/reminders.server.ts tests/workers/reminders.test.ts
git commit -m "A workout planned in the morning still gets the lift reminder"
```

---

### Task 7: The rest ping calls

**Files:**
- Create: `app/workout/ping.ts`
- Test: `tests/unit/workout/ping.test.ts`

- [ ] **Step 1: Write the failing test.** Create `tests/unit/workout/ping.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { cancelPing, pingBody, schedulePing } from "~/workout/ping";

function fake(reply: () => Promise<Response>) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const send = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return reply();
  }) as unknown as typeof fetch;
  return { calls, send };
}

describe("rest ping calls", () => {
  it("posts the rest length and the message, clamped to what the server takes", async () => {
    const f = fake(async () => new Response(null, { status: 204 }));
    expect(await schedulePing(150.4, pingBody("Leg press", 2), f.send)).toBe(true);
    expect(f.calls[0]).toMatchObject({ url: "/api/rest", init: { method: "POST" } });
    expect(JSON.parse(String(f.calls[0].init!.body))).toEqual({ seconds: 150, title: "Rest's up", body: "Set 2 of Leg press." });
    await schedulePing(0.2, "x", f.send);
    expect(JSON.parse(String(f.calls[1].init!.body)).seconds).toBe(1);
  });

  it("cancels with DELETE", async () => {
    const f = fake(async () => new Response(null, { status: 204 }));
    expect(await cancelPing(f.send)).toBe(true);
    expect(f.calls[0]).toMatchObject({ url: "/api/rest", init: { method: "DELETE" } });
  });

  it("says false with no signal or a refused call, and never throws", async () => {
    expect(await schedulePing(90, "x", fake(async () => Promise.reject(new TypeError("Failed to fetch"))).send)).toBe(false);
    expect(await cancelPing(fake(async () => new Response(null, { status: 401 })).send)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails.**

```bash
npx vitest run --project unit tests/unit/workout/ping.test.ts
```

Expected: FAIL, `Failed to resolve import "~/workout/ping"`.

- [ ] **Step 3: Write `app/workout/ping.ts`:**

```ts
// The locked-phone rest ping (spec section 3). Fire-and-forget: the countdown on screen never waits on these calls.

export const PING_TITLE = "Rest's up";

export const pingBody = (lift: string, setNumber: number) => `Set ${setNumber} of ${lift}.`;

/** Schedules the ping, replacing any earlier one. Resolves false when the call didn't get through. */
export async function schedulePing(seconds: number, body: string, send: typeof fetch = fetch): Promise<boolean> {
  try {
    const res = await send("/api/rest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seconds: Math.min(600, Math.max(1, Math.round(seconds))), title: PING_TITLE, body }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function cancelPing(send: typeof fetch = fetch): Promise<boolean> {
  try {
    return (await send("/api/rest", { method: "DELETE" })).ok;
  } catch {
    return false;
  }
}

/** This phone can get the ping: notifications allowed and a push subscription saved (Settings makes both). */
export async function notificationsOn(): Promise<boolean> {
  if (typeof Notification === "undefined" || Notification.permission !== "granted" || !("serviceWorker" in navigator)) return false;
  const reg = await navigator.serviceWorker.getRegistration().catch(() => undefined);
  return Boolean(await reg?.pushManager.getSubscription().catch(() => null));
}
```

- [ ] **Step 4: Run the test again.** Same command. Expected: PASS, 3 tests.

- [ ] **Step 5: Commit.**

```bash
git add app/workout/ping.ts tests/unit/workout/ping.test.ts
git commit -m "Client calls for the rest ping, fire-and-forget"
```

---

### Task 8: The gym kit

No unit tests (the repo tests pure modules only); these are checked by typecheck here and by eye in Task 16.

**Files:**
- Create: `app/ui/GymFrame.tsx`, `app/ui/Stepper.tsx`, `app/ui/SegmentRow.tsx`, `app/ui/RestPanel.tsx`, `app/ui/ChoiceRow.tsx`, `app/lib/use-now.ts`
- Modify: `app/ui/button.ts`, `app/components/ui.tsx`, `app/routes/today.tsx` (only the `useNow` move)

- [ ] **Step 1: The gym primary.** In `app/ui/button.ts`, add to `btn` after `primary`:

```ts
  // The gym's 64 px primary, at 21 px (system.md, "Primary button").
  gym: `${base} bg-red text-on-red text-[21px] uppercase tracking-[0.04em]`,
```

- [ ] **Step 2: Two icons.** In `app/components/ui.tsx`, add to `PATHS` after `plus`:

```tsx
  close: <path d="M6 6l12 12M18 6L6 18" />,
  pin: <path d="M12 17v5M8 3h8l-1 7 3 3H6l3-3z" />,
```

- [ ] **Step 3: Move `useNow`.** Create `app/lib/use-now.ts`:

```ts
import { useEffect, useState } from "react";

/** Re-reads the clock on an interval, so a screen moves on with the time. */
export function useNow(everyMs: number): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), everyMs);
    return () => window.clearInterval(t);
  }, [everyMs]);
  return now;
}
```

   In `app/routes/today.tsx`, delete the local `useNow` function and its comment, add `import { useNow } from "~/lib/use-now";`, and change the call to `useNow(30_000)`.

- [ ] **Step 4: Create `app/ui/GymFrame.tsx`:**

```tsx
import type { ReactNode } from "react";
import { Link } from "react-router";
import { Icon } from "~/components/ui";

/**
 * A gym screen: full height, no tab bar, and the action docked at the bottom. The dock is sticky, not fixed, so the
 * page needs no spacer and the last row always scrolls clear of it.
 */
export function GymFrame({ header, children, dock, gap = "gap-[18px]" }: { header?: ReactNode; children: ReactNode; dock: ReactNode; gap?: string }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[560px] flex-col">
      <main className={`flex flex-1 flex-col px-5 pb-6 pt-[max(20px,env(safe-area-inset-top))] ${gap}`}>
        {header && <header className="flex items-center justify-between gap-2.5">{header}</header>}
        {children}
      </main>
      <div className="sticky bottom-0 z-20">{dock}</div>
    </div>
  );
}

/** The paper bar under a gym screen: a 2 px ink rule, then a note and the one red action. */
export function Dock({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-2.5 border-t-2 border-ink bg-paper px-5 pb-[max(16px,env(safe-area-inset-bottom))] pt-3">{children}</div>;
}

/** The 44 px outlined square in a gym header: back, or the X that leaves a running workout. */
export function HeaderIcon({ to, label, icon }: { to: string; label: string; icon: "back" | "close" }) {
  return (
    <Link to={to} aria-label={label} className="flex size-11 flex-none items-center justify-center rounded-[6px] border-[1.5px] border-border">
      <Icon name={icon} size={18} strokeWidth={2.4} />
    </Link>
  );
}
```

- [ ] **Step 5: Create `app/ui/Stepper.tsx`:**

```tsx
import { useEffect, useId, useState } from "react";
import { btn } from "./button";

/** A set card: the label, a big number you can type into, and a pair of 48 px outline buttons that step it. */
export function Stepper({
  label,
  value,
  step,
  less,
  more,
  decimal = false,
  onChange,
}: {
  label: string;
  value: number | null;
  step: number;
  less: string;
  more: string;
  decimal?: boolean;
  onChange: (value: number | null) => void;
}) {
  const id = useId();
  const [text, setText] = useState(value === null ? "" : String(value));
  // Follows the steppers without fighting the keyboard: "28." stays "28." while it still means 28.
  useEffect(() => {
    setText((t) => (t.trim() !== "" && Number(t) === value ? t : value === null ? "" : String(value)));
  }, [value]);
  const bump = (d: number) => onChange(Math.max(0, (value ?? 0) + d));
  return (
    <div className="flex flex-col gap-2 rounded-[6px] border-2 border-ink bg-raised px-3 py-3.5">
      <label htmlFor={id} className="font-num text-[14px] font-bold uppercase tracking-[0.04em] text-ink-3">
        {label}
      </label>
      <input
        id={id}
        value={text}
        inputMode={decimal ? "decimal" : "numeric"}
        onChange={(e) => {
          setText(e.target.value);
          const v = Number(e.target.value);
          onChange(e.target.value.trim() === "" || !Number.isFinite(v) || v < 0 ? null : v);
        }}
        className="tabular w-full min-w-0 bg-transparent text-center font-num text-[56px] font-bold leading-none outline-none"
      />
      <div className="grid grid-cols-2 gap-2">
        <button type="button" aria-label={less} onClick={() => bump(-step)} className={`${btn.outline} h-12 text-[18px]`}>
          −{step}
        </button>
        <button type="button" aria-label={more} onClick={() => bump(step)} className={`${btn.outline} h-12 text-[18px]`}>
          +{step}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Create `app/ui/SegmentRow.tsx`:**

```tsx
export type Segment = "current" | "done" | "todo";

/** One segment per lift: red is the current lift (live state), ink is done, an outline is still to do. */
export function SegmentRow({ segments }: { segments: Segment[] }) {
  const done = segments.filter((x) => x === "done").length;
  return (
    <div role="img" aria-label={`${done} of ${segments.length} lifts done`} className="grid gap-1" style={{ gridTemplateColumns: `repeat(${segments.length}, minmax(0, 1fr))` }}>
      {segments.map((x, i) => (
        <span key={i} className={`h-1.5 rounded-[2px] ${x === "current" ? "bg-red" : x === "done" ? "bg-ink" : "border-[1.5px] border-border"}`} />
      ))}
    </div>
  );
}
```

- [ ] **Step 7: Create `app/ui/RestPanel.tsx`:**

```tsx
import { useEffect, useRef, useState } from "react";

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/**
 * The dark rest panel. It ticks itself, so the 250 ms tick redraws the panel and not the screen, and calls onDone
 * once at 0:00.
 */
export function RestPanel({
  endsAt,
  total,
  line,
  onAdjust,
  onSkip,
  onDone,
}: {
  endsAt: number;
  total: number;
  line: string;
  onAdjust: (seconds: number) => void;
  onSkip: () => void;
  onDone: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(t);
  }, []);
  const left = Math.max(0, Math.ceil((endsAt - now) / 1000));
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    if (left === 0) done.current();
  }, [left]);
  const pct = total > 0 ? Math.min(100, (left / total) * 100) : 0;
  const quiet = "h-14 rounded-[6px] border-[1.5px] border-muted font-num text-[19px] font-bold text-paper";
  return (
    <section role="timer" aria-label={`Rest, ${Math.floor(left / 60)} minutes ${left % 60} seconds left`} className="flex flex-col gap-3.5 rounded-t-[14px] bg-ink px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-5 text-paper">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-num text-[16px] font-bold tracking-[0.04em] text-coral">REST</span>
        <span className="text-right text-[14px] text-on-ink-2">{line}</span>
      </div>
      <div aria-hidden="true" className="tabular text-center font-display text-[104px] leading-[0.9]">
        {clock(left)}
      </div>
      <div aria-hidden="true" className="h-2 rounded-[4px] bg-ink-2">
        <div className="h-2 rounded-[4px] bg-red" style={{ width: `${pct}%` }} />
      </div>
      <div className="grid grid-cols-3 gap-2.5">
        <button type="button" onClick={() => onAdjust(-15)} className={quiet}>
          −15 s
        </button>
        <button type="button" onClick={() => onAdjust(15)} className={quiet}>
          +15 s
        </button>
        <button type="button" onClick={onSkip} className="h-14 rounded-[6px] bg-paper font-num text-[19px] font-bold text-ink">
          Skip
        </button>
      </div>
    </section>
  );
}
```

- [ ] **Step 8: Create `app/ui/ChoiceRow.tsx`:**

```tsx
export interface Choice<T extends string> {
  value: T;
  label: string;
}

/** One pick from a few: the workout picker (a scrolling row) and the feel buttons (a grid). Selected is ink. */
export function ChoiceRow<T extends string>({
  label,
  choices,
  value,
  onPick,
  layout = "row",
}: {
  label: string;
  choices: Choice<T>[];
  value: T | null;
  onPick: (value: T) => void;
  layout?: "row" | "grid";
}) {
  const grid = layout === "grid";
  return (
    <div
      role="group"
      aria-label={label}
      className={grid ? "grid gap-2" : "-mx-5 flex gap-1.5 overflow-x-auto px-5 [scrollbar-width:none]"}
      style={grid ? { gridTemplateColumns: `repeat(${choices.length}, minmax(0, 1fr))` } : undefined}
    >
      {choices.map((c) => {
        const on = c.value === value;
        const size = grid ? "h-12 text-[17px]" : "h-11 flex-none whitespace-nowrap px-3 text-[15px]";
        // The feel buttons keep the mock's ink outline; the picker's unselected ones are the quieter control border.
        const look = on ? "border-2 border-ink bg-ink text-paper" : grid ? "border-[1.5px] border-ink text-ink" : "border-[1.5px] border-border text-ink";
        return (
          <button key={c.value} type="button" aria-pressed={on} onClick={() => onPick(c.value)} className={`rounded-[6px] font-num font-bold ${size} ${look}`}>
            {c.label}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 9: Typecheck.**

```bash
npm run typecheck
```

Expected: the only errors are in `app/routes/today.tsx` (`canMove`, `schedule`, `link`, from Task 4). Task 15 clears them.

- [ ] **Step 10: Commit.**

```bash
git add app/ui app/lib/use-now.ts app/components/ui.tsx app/routes/today.tsx
git commit -m "Gym kit: GymFrame, Stepper, SegmentRow, RestPanel, ChoiceRow"
```

---

### Task 9: Taps to named changes

**Files:**
- Create: `app/workout/actions.ts`, `app/workout/use-actions.ts`
- Test: `tests/unit/workout/actions.test.ts`

- [ ] **Step 1: Write the failing test.** Create `tests/unit/workout/actions.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { runMutation } from "~/sync/mutators";
import { MemoryTx } from "~/sync/tx";
import { workoutActions } from "~/workout/actions";
import { dropLift } from "~/workout/lifts";
import { buildWorkout } from "~/workout/model";

// Wednesday at noon in Chicago.
const ctx = { now: "2026-10-28T17:00:00.000Z", today: "2026-10-28" };

function harness() {
  const tx = new MemoryTx(new Map());
  let ids = 0;
  const mutate = async (name: string, args: unknown) => {
    try {
      await runMutation(tx, name, args, ctx);
      return true;
    } catch {
      return false;
    }
  };
  const rows = (name: string) => [...(tx.tables.get(name)?.values() ?? [])];
  const model = (date?: string) => buildWorkout(rows, new Date(ctx.now), { date });
  const act = (date?: string) => workoutActions(model(date), mutate, () => new Date(ctx.now), () => `id-${++ids}`);
  return { tx, rows, model, act, mutate };
}

describe("workout actions", () => {
  it("plans the workout on its first edit, then changes its list", async () => {
    const h = harness();
    expect(await h.act().editLifts((list) => dropLift(list, 1))).toBe(true);
    expect(h.model()).toMatchObject({ screen: "plan", key: "id-1" });
    expect(h.model().lifts.map((l) => l.position)).toEqual([0, 2, 3, 4, 5]);
  });

  it("starts a workout that was never saved", async () => {
    const h = harness();
    await h.act().start();
    expect(h.model()).toMatchObject({ screen: "set", startedAt: ctx.now });
  });

  it("logs a set, and then refuses to skip that lift", async () => {
    const h = harness();
    await h.act().start();
    const m = h.model();
    await h.act().logSet(m.lifts[0], 1, 280, 11);
    expect(h.model().lifts[0].sets).toMatchObject([{ setNumber: 1, weight: 280, reps: 11 }]);
    expect(await h.act().editLifts((list) => dropLift(list, 0))).toBe(false);
  });

  it("swaps for good: the override for later weeks and today's list", async () => {
    const h = harness();
    await h.act().swapAlways(h.model().lifts[5], "dumbbell-lateral-raise");
    expect(h.rows("exercise_overrides")).toEqual([{ template_id: "wed-legs-shoulders", position: 5, exercise_id: "dumbbell-lateral-raise" }]);
    expect(h.model().lifts[5]).toMatchObject({ exercise: "dumbbell-lateral-raise", from: "plan" });
  });

  it("finishes a workout that finished by the next-day rule before rating it", async () => {
    const h = harness();
    const TUE = "2026-10-27";
    await h.mutate("planWorkout", { clientId: "w-0", date: TUE, templateId: "wed-legs-shoulders", at: `${TUE}T17:00:00.000Z` });
    await h.mutate("startWorkout", { workout: "w-0", at: `${TUE}T17:00:00.000Z` });
    await h.mutate("logSet", { clientId: "s-0", workout: "w-0", position: 0, exercise: "leg-press", setNumber: 1, weightLb: 280, reps: 12, at: `${TUE}T17:20:00.000Z` });
    expect(h.model(TUE)).toMatchObject({ screen: "done", endedAt: null });
    expect(await h.act(TUE).rate("hard")).toBe(true);
    expect(h.model(TUE)).toMatchObject({ endedAt: `${TUE}T17:20:00.000Z`, feel: "hard" });
  });

  it("logs a past day after the fact as finished", async () => {
    const h = harness();
    await h.act("2026-10-26").logLate();
    expect(h.model("2026-10-26")).toMatchObject({ screen: "done", templateId: "mon-chest-back-arms" });
  });
});
```

- [ ] **Step 2: Run it to make sure it fails.**

```bash
npx vitest run --project unit tests/unit/workout/actions.test.ts
```

Expected: FAIL, `Failed to resolve import "~/workout/actions"`.

- [ ] **Step 3: Write `app/workout/actions.ts`:**

```ts
// The workout screens' writes, as named changes. A workout not saved yet is planned by its first change, so every
// tap works on the phone with no signal. Pure apart from the mutate it is handed, so the unit tests run it.
import type { Feel } from "~/domain/progression";
import type { MutationName } from "~/sync/mutators";
import { swapForGood, type Lift } from "./lifts";
import type { LiftView, WorkoutModel } from "./model";

export type Mutate = (name: MutationName, args: unknown) => Promise<boolean>;

const toLift = ({ position, exercise, repMin, repMax, from, replaces }: Lift): Lift =>
  replaces ? { position, exercise, repMin, repMax, from, replaces } : { position, exercise, repMin, repMax, from };

export function workoutActions(m: WorkoutModel, mutate: Mutate, now: () => Date = () => new Date(), newId: () => string = () => crypto.randomUUID()) {
  const at = () => now().toISOString();

  async function ensure(templateId = m.templateId): Promise<string | null> {
    if (m.key) return m.key;
    if (!templateId) return null;
    const clientId = newId();
    return (await mutate("planWorkout", { clientId, date: m.date, templateId, at: at() })) ? clientId : null;
  }

  async function editLifts(change: (list: Lift[]) => Lift[]): Promise<boolean> {
    const key = await ensure();
    return key !== null && mutate("setLifts", { workout: key, lifts: change(m.lifts.map(toLift)) });
  }

  const withKey = (run: (key: string) => Promise<boolean>) => (m.key ? run(m.key) : Promise.resolve(false));

  return {
    /** Picking another workout before Start. The open workout is retargeted; with none, one is planned. */
    pick: async (templateId: string) => (m.key ? mutate("planWorkout", { clientId: newId(), date: m.date, templateId, at: at() }) : (await ensure(templateId)) !== null),
    editLifts,
    /** "Done, see you at noon": a workout picked but not written yet is saved. */
    save: async () => (await ensure()) !== null,
    start: async () => {
      const key = await ensure();
      return key !== null && mutate("startWorkout", { workout: key, at: at() });
    },
    /** A past day logged after the fact: saved as finished, then its sets go in from Done. */
    logLate: async () => {
      const key = await ensure();
      return key !== null && mutate("finishWorkout", { workout: key, at: at() });
    },
    logSet: (lift: LiftView, setNumber: number, weightLb: number, reps: number) =>
      withKey((workout) => mutate("logSet", { clientId: newId(), workout, position: lift.position, exercise: lift.exercise, setNumber, weightLb, reps, at: at() })),
    editSet: (key: string, weightLb: number, reps: number) => mutate("editSet", { key, weightLb, reps }),
    deleteSet: (key: string) => mutate("deleteSet", { key }),
    check: (lift: LiftView, done: boolean) => withKey((workout) => mutate("checkLift", { workout, exercise: lift.exercise, done })),
    finish: () => withKey((workout) => mutate("finishWorkout", { workout, at: at() })),
    /** A workout finished by the next-day rule has no end written, so it gets its last set's time first. */
    rate: (feel: Feel | null) =>
      withKey(async (workout) => {
        if (!m.endedAt && !(await mutate("finishWorkout", { workout, at: m.finishedAt ?? at() }))) return false;
        return mutate("rateWorkout", { workout, feel });
      }),
    note: (exercise: string, note: string) => mutate("setNote", { exercise, note }),
    swapAlways: async (lift: LiftView, exercise: string) => {
      if (!m.templateId || !(await mutate("swapAlways", { templateId: m.templateId, position: lift.position, exercise }))) return false;
      return editLifts((list) => swapForGood(list, lift.position, exercise));
    },
  };
}

export type WorkoutActions = ReturnType<typeof workoutActions>;
```

- [ ] **Step 4: Write `app/workout/use-actions.ts`:**

```ts
import { useMemo } from "react";
import { useMutate } from "~/sync/react";
import { workoutActions } from "./actions";
import type { WorkoutModel } from "./model";

export function useWorkoutActions(m: WorkoutModel) {
  const mutate = useMutate();
  return useMemo(() => workoutActions(m, mutate), [m, mutate]);
}
```

- [ ] **Step 5: Run the test again.** Same command. Expected: PASS, 6 tests.

- [ ] **Step 6: Commit.**

```bash
git add app/workout/actions.ts app/workout/use-actions.ts tests/unit/workout/actions.test.ts
git commit -m "Workout taps as named changes, planning the workout on its first change"
```

---

### Task 10: The sheets, and the move sheet on the phone's copy

**Files:**
- Create: `app/workout/SwapSheet.tsx`, `app/workout/LiftListSheet.tsx`, `app/workout/SetsSheet.tsx`, `app/workout/NoteSheet.tsx`, `app/workout/AddLiftSheet.tsx`
- Modify: `app/components/MoveSheet.tsx`, `app/components/ExercisePicker.tsx`

- [ ] **Step 1: The picker's locked label.** In `app/components/ExercisePicker.tsx`, add a prop `lockedLabel = "Logged"` (type `lockedLabel?: string`) after `locked`, and change the row's subline to:

```tsx
                    <div className="mt-px text-[14px] text-label-2">{locked.has(e.id) ? lockedLabel : (EQUIPMENT[e.equipment] ?? e.equipment)}</div>
```

   Nothing else in the picker changes (question 3).

- [ ] **Step 2: The move sheet writes `moveWorkout`.** Replace `app/components/MoveSheet.tsx` with:

```tsx
import { useState } from "react";
import { useRevalidator } from "react-router";
import type { ScheduleDay } from "~/content/schedule";
import { useMutate, useSyncClient } from "~/sync/react";
import { Sheet } from "./Sheet";
import { Icon } from "./ui";

const DAY_FMT = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });
const dayLabel = (date: string) => DAY_FMT.format(new Date(`${date}T12:00:00Z`));

/**
 * Moves a workout between two days of the week. From a workout day it lists every other day to move it to; from a
 * rest day it lists the workouts to bring there. Either way the two days trade, so the day left behind rests. The
 * move is a named change on the phone, so it works offline; a refusal shows in the sync notice.
 */
export function MoveSheet({ open, onClose, anchor, week, today }: { open: boolean; onClose: () => void; anchor: ScheduleDay; week: ScheduleDay[]; today?: string }) {
  const mutate = useMutate();
  const client = useSyncClient();
  const revalidator = useRevalidator();
  const [busy, setBusy] = useState(false);
  const pushing = anchor.templateId !== null;
  const options = week.filter((d) => d.date !== anchor.date && (pushing || d.templateId !== null));
  const title = pushing ? `Move ${anchor.name}` : anchor.date === today ? "Train today" : `Train on ${dayLabel(anchor.date).split(",")[0]}`;

  async function move(to: string) {
    setBusy(true);
    const ok = await mutate("moveWorkout", { a: anchor.date, b: to });
    setBusy(false);
    if (!ok) return;
    onClose();
    // The v1 Plan screen reads the server, so it reloads once the move has been sent.
    await client?.sync();
    revalidator.revalidate();
  }

  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <p className="mb-3 px-1 text-[14px] leading-snug text-label-2">
        {pushing ? "Pick the day you'll train instead. That day's plan comes here." : "Pick a workout to do this day. Its old day turns into a rest day."}
      </p>
      {options.length === 0 ? (
        <p className="px-1 text-[15px] text-label-2">No workouts left to move this week.</p>
      ) : (
        <div className="overflow-hidden rounded-[6px] bg-card">
          {options.map((d) => (
            <button
              key={d.date}
              type="button"
              disabled={d.logged || busy}
              onClick={() => void move(d.date)}
              className="flex min-h-[60px] w-full items-center gap-3 border-b-[0.5px] border-separator px-4 py-3 text-left last:border-b-0 disabled:opacity-50"
            >
              <div className="min-w-0 flex-1">
                <div className="text-[16px] font-semibold">
                  {dayLabel(d.date)}
                  {d.date === today && <span className="text-label-2"> · today</span>}
                </div>
                <div className="mt-px text-[14px] text-label-2">
                  {d.logged ? `${d.name ?? "Workout"} · already logged` : pushing ? (d.name ? `${d.name} · trades places` : "Rest day") : d.name}
                </div>
              </div>
              <span className="flex-none text-label-4">
                <Icon name="chevron" size={18} strokeWidth={2.4} />
              </span>
            </button>
          ))}
        </div>
      )}
    </Sheet>
  );
}
```

- [ ] **Step 3: Create `app/workout/SwapSheet.tsx`:**

```tsx
import { useState } from "react";
import { Sheet } from "~/components/Sheet";
import { Icon } from "~/components/ui";
import { exerciseImage } from "~/content";
import { btn } from "~/ui/button";
import { ChoiceRow } from "~/ui/ChoiceRow";
import { swapOptions, type Lift } from "./lifts";
import type { LiftView } from "./model";

type Mode = "today" | "always" | "skip";

/** Swap a lift for today, swap it for good, or skip it today (spec section 2, Plan). */
export function SwapSheet({
  lift,
  list,
  canAlways,
  onToday,
  onAlways,
  onSkip,
  onClose,
}: {
  lift: LiftView | null;
  list: Lift[];
  canAlways: boolean;
  onToday: (exercise: string) => void;
  onAlways: (exercise: string) => void;
  onSkip: () => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<Mode>("today");
  if (!lift) return null;
  const name = lift.name.toLowerCase();
  const modes: { value: Mode; label: string }[] = [{ value: "today", label: "Today" }, ...(canAlways ? [{ value: "always" as const, label: "Always" }] : []), { value: "skip", label: "Skip today" }];
  return (
    <Sheet open onClose={onClose} title={`Swap ${lift.name}`}>
      {lift.sets.length > 0 || lift.checked ? (
        <p className="text-[16px] leading-[1.45] text-ink-2">Sets are logged on {name}, so it stays. Add a lift from the list instead.</p>
      ) : (
        <div className="flex flex-col gap-4">
          <ChoiceRow label="Swap for" layout="grid" choices={modes} value={mode} onPick={setMode} />
          {mode === "skip" ? (
            <button type="button" onClick={onSkip} className={`${btn.outline} h-14 text-[17px]`}>
              Skip {name} today
            </button>
          ) : (
            <>
              <p className="text-[15px] leading-[1.4] text-ink-3">{mode === "always" ? `Replaces ${name} in this workout from now on.` : `Only today changes. ${lift.name} comes back next time.`}</p>
              <ul className="flex flex-col">
                {swapOptions(list, lift.position).map((e) => (
                  <li key={e.id} className="border-t border-rule">
                    <button type="button" onClick={() => (mode === "always" ? onAlways(e.id) : onToday(e.id))} className="flex min-h-[60px] w-full items-center gap-3 py-2 text-left">
                      <img src={exerciseImage(e, 0)} alt="" className="size-12 flex-none rounded-[6px] bg-well object-cover" />
                      <span className="flex-1 text-[17px] font-bold">{e.name}</span>
                      <Icon name="chevron" size={18} />
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </Sheet>
  );
}
```

- [ ] **Step 4: Create `app/workout/AddLiftSheet.tsx`:**

```tsx
import { ExercisePicker } from "~/components/ExercisePicker";
import { Sheet } from "~/components/Sheet";
import { CATALOG, type Lift } from "./lifts";

export function AddLiftSheet({ open, lifts, onAdd, onClose }: { open: boolean; lifts: Lift[]; onAdd: (ids: string[]) => void; onClose: () => void }) {
  const inList = new Set(lifts.map((l) => l.exercise));
  return (
    <Sheet open={open} onClose={onClose} title="Add a lift">
      <ExercisePicker
        catalog={CATALOG}
        initial={[]}
        locked={inList}
        lockedLabel="In today's list"
        saveLabel={(count) => {
          const picked = count - inList.size;
          return picked <= 0 ? "Pick a lift" : `Add ${picked} lift${picked === 1 ? "" : "s"}`;
        }}
        onSave={(ids) => {
          onClose();
          onAdd(ids);
        }}
      />
    </Sheet>
  );
}
```

- [ ] **Step 5: Create `app/workout/LiftListSheet.tsx`:**

```tsx
import { Sheet } from "~/components/Sheet";
import { Icon } from "~/components/ui";
import { btn } from "~/ui/button";
import { setsText, type LiftView, type WorkoutModel } from "./model";

/** The lift list behind the header clock: jump to any lift, add one, undo a no-numbers check, or finish. */
export function LiftListSheet({
  m,
  open,
  onJump,
  onUncheck,
  onAdd,
  onFinish,
  onClose,
}: {
  m: WorkoutModel;
  open: boolean;
  onJump: (position: number) => void;
  onUncheck: (lift: LiftView) => void;
  onAdd: () => void;
  onFinish: () => void;
  onClose: () => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title="Lifts">
      <ol className="flex flex-col">
        {m.lifts.map((l, i) => (
          <li key={l.position} className="flex items-center gap-2 border-t border-rule">
            <button type="button" onClick={() => onJump(l.position)} className="flex min-h-[60px] flex-1 items-center gap-3 text-left">
              <span className="tabular w-6 font-num text-[15px] font-bold text-ink-3">{i + 1}</span>
              <span className="flex flex-1 flex-col">
                <span className="text-[17px] font-bold">{l.name}</span>
                <span className="tabular text-[14px] text-ink-3">{l.checked ? "Done, no numbers" : l.sets.length ? setsText(l.sets) : `${m.setsPerLift} × ${l.repMin} to ${l.repMax}`}</span>
              </span>
              {l.done && <Icon name="check" size={18} strokeWidth={2.8} />}
            </button>
            {l.checked && (
              <button type="button" onClick={() => onUncheck(l)} className="h-11 px-2 font-num text-[15px] font-bold underline underline-offset-[3px]">
                Undo
              </button>
            )}
          </li>
        ))}
      </ol>
      <div className="mt-4 flex flex-col gap-3">
        <button type="button" onClick={onAdd} className={`${btn.outlinePlain} h-11 self-start px-4`}>
          + Add a lift
        </button>
        <button type="button" onClick={onFinish} className={`${btn.primary} h-14`}>
          Finish workout
        </button>
      </div>
    </Sheet>
  );
}
```

- [ ] **Step 6: Create `app/workout/SetsSheet.tsx`:**

```tsx
import { useState } from "react";
import { Sheet } from "~/components/Sheet";
import { btn } from "~/ui/button";
import { Stepper } from "~/ui/Stepper";
import { nextTarget, type LiftView } from "./model";

interface Editing {
  /** The set's store key, or null for a new set. */
  key: string | null;
  setNumber: number;
  weight: number | null;
  reps: number | null;
}

/** A lift's logged sets: tap one to fix or delete it. With canAdd it also adds the next set, for a day logged after the fact. */
export function SetsSheet({
  lift,
  setsPerLift,
  canAdd,
  onEdit,
  onDelete,
  onAdd,
  onClose,
}: {
  lift: LiftView | null;
  setsPerLift: number;
  canAdd: boolean;
  onEdit: (key: string, weight: number, reps: number) => void;
  onDelete: (key: string) => void;
  onAdd: (setNumber: number, weight: number, reps: number) => void;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState<Editing | null>(null);
  if (!lift) return null;
  const target = nextTarget(lift, setsPerLift);

  function save(e: Editing) {
    if (e.weight === null || e.reps === null) return;
    if (e.key) onEdit(e.key, e.weight, e.reps);
    else onAdd(e.setNumber, e.weight, e.reps);
    setEditing(null);
  }

  return (
    <Sheet open onClose={onClose} title={lift.name}>
      {editing ? (
        <div className="flex flex-col gap-3">
          <p className="font-num text-[16px] font-bold">SET {editing.setNumber}</p>
          <div className="grid grid-cols-2 gap-3">
            <Stepper label="Weight, lb" value={editing.weight} step={lift.increment} decimal less={`${lift.increment} pounds less`} more={`${lift.increment} pounds more`} onChange={(weight) => setEditing({ ...editing, weight })} />
            <Stepper label="Reps" value={editing.reps} step={1} less="One rep fewer" more="One rep more" onChange={(reps) => setEditing({ ...editing, reps })} />
          </div>
          <button type="button" disabled={editing.weight === null || editing.reps === null} onClick={() => save(editing)} className={`${btn.primary} h-14 disabled:opacity-60`}>
            Save set {editing.setNumber}
          </button>
          <div className="flex gap-5">
            {editing.key && (
              <button
                type="button"
                onClick={() => {
                  onDelete(editing.key!);
                  setEditing(null);
                }}
                className={btn.quiet}
              >
                Delete set {editing.setNumber}
              </button>
            )}
            <button type="button" onClick={() => setEditing(null)} className={btn.quiet}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col">
          {lift.sets.length === 0 && <p className="text-[16px] text-ink-3">No sets logged.</p>}
          <ol className="flex flex-col">
            {lift.sets.map((x) => (
              <li key={x.key} className="border-t border-rule">
                <button
                  type="button"
                  aria-label={`Set ${x.setNumber}, ${x.weight} pounds, ${x.reps} reps. Fix it`}
                  onClick={() => setEditing({ key: x.key, setNumber: x.setNumber, weight: x.weight, reps: x.reps })}
                  className="flex min-h-14 w-full items-center gap-3 text-left"
                >
                  <span className="w-14 font-num text-[15px] font-bold text-ink-3">SET {x.setNumber}</span>
                  <span className="tabular flex-1 font-num text-[26px] font-bold">
                    {x.weight} × {x.reps}
                  </span>
                  <span className="text-[14px] font-semibold text-ink-3">Fix</span>
                </button>
              </li>
            ))}
          </ol>
          {canAdd && target && (
            <button type="button" onClick={() => setEditing({ key: null, setNumber: target.setNumber, weight: target.weight, reps: target.reps })} className={`${btn.outlinePlain} mt-4 h-11 self-start px-4`}>
              + Add set {target.setNumber}
            </button>
          )}
        </div>
      )}
    </Sheet>
  );
}
```

- [ ] **Step 7: Create `app/workout/NoteSheet.tsx`:**

```tsx
import { useState } from "react";
import { Sheet } from "~/components/Sheet";
import { btn } from "~/ui/button";
import type { LiftView } from "./model";

/** A note on an exercise. It belongs to the exercise, so it shows every week. */
export function NoteSheet({ lift, onSave, onClose }: { lift: LiftView | null; onSave: (note: string) => void; onClose: () => void }) {
  const [text, setText] = useState(lift?.note ?? "");
  if (!lift) return null;
  return (
    <Sheet open onClose={onClose} title="Note">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave(text);
        }}
        className="flex flex-col gap-3"
      >
        <label htmlFor="note" className="text-[15px] text-ink-3">
          For {lift.name.toLowerCase()}, every week.
        </label>
        <textarea id="note" value={text} maxLength={200} rows={3} onChange={(e) => setText(e.target.value)} className="rounded-[6px] border-[1.5px] border-border bg-field p-3 text-[17px] text-ink" />
        <button type="submit" className={`${btn.primary} h-14`}>
          Save note
        </button>
        {lift.note && (
          <button type="button" onClick={() => onSave("")} className={btn.quiet}>
            Clear note
          </button>
        )}
      </form>
    </Sheet>
  );
}
```

- [ ] **Step 8: Typecheck.** `npm run typecheck`. Expected: only Task 4's `today.tsx` errors.

- [ ] **Step 9: Commit.**

```bash
git add app/workout/*Sheet.tsx app/components/MoveSheet.tsx app/components/ExercisePicker.tsx
git commit -m "Workout sheets, and the move sheet writes moveWorkout on the phone"
```

---

### Task 11: Plan

**Files:**
- Create: `app/workout/PlanScreen.tsx`

- [ ] **Step 1: Write `app/workout/PlanScreen.tsx`:**

```tsx
import { useState } from "react";
import { useNavigate } from "react-router";
import { MoveSheet } from "~/components/MoveSheet";
import { Icon } from "~/components/ui";
import { exercises, plan } from "~/content";
import { localMinutes } from "~/domain/dates";
import { WORKOUT_START } from "~/domain/next-up";
import { btn } from "~/ui/button";
import { ChoiceRow } from "~/ui/ChoiceRow";
import { Dock, GymFrame, HeaderIcon } from "~/ui/GymFrame";
import { AddLiftSheet } from "./AddLiftSheet";
import { addLifts, dropLift, swapToday, undoSwap } from "./lifts";
import type { LiftView, WorkoutModel } from "./model";
import { SwapSheet } from "./SwapSheet";
import { useWorkoutActions } from "./use-actions";

/** Plan (mock WorkoutPlan): pick and shape the day's workout before the clock starts. */
export function PlanScreen({ m, back, dateLabel }: { m: WorkoutModel; back: string; dateLabel: string }) {
  const act = useWorkoutActions(m);
  const navigate = useNavigate();
  const [swapping, setSwapping] = useState<LiftView | null>(null);
  const [adding, setAdding] = useState(false);
  const [moving, setMoving] = useState(false);
  // From half an hour before noon, Start is the one red action.
  const gymTime = localMinutes(new Date()) >= WORKOUT_START - 30;
  const anchor = m.schedule.find((d) => d.date === m.date);
  const picked = m.templateId !== null;
  const leave = async () => {
    await act.save();
    navigate(back);
  };
  // The screen follows the store: a started workout shows Set, a past day logged late shows Done.
  const begin = () => void (m.live ? act.start() : act.logLate());
  const status = m.live ? (m.key ? "Saved · not started" : "Not started") : dateLabel;
  const meta = `${m.live ? "Noon · " : ""}${m.totals.lifts} lifts · ${m.totals.sets} sets · about ${m.totals.minutes} min`;

  return (
    <GymFrame
      gap="gap-3.5"
      header={
        <>
          <HeaderIcon to={back} label={back === "/" ? "Back to Today" : "Back"} icon="back" />
          <span className="whitespace-nowrap font-num text-[16px] font-bold text-ink-3">{status}</span>
        </>
      }
      dock={
        <Dock>
          <p className="text-[15px] leading-[1.35] text-ink-3">
            {m.live ? "Changes save as you go. The clock starts when you tap Start at the gym." : "Changes save as you go. Log it, then add each lift's sets."}
          </p>
          <div className="flex gap-2.5">
            {!m.live ? (
              <button type="button" disabled={!picked} onClick={begin} className={`${btn.primary} h-[58px] flex-1 disabled:opacity-60`}>
                Log it
              </button>
            ) : gymTime ? (
              <>
                <button type="button" disabled={!picked} onClick={begin} className={`${btn.primary} h-[58px] flex-1 disabled:opacity-60`}>
                  Start now
                </button>
                <button type="button" onClick={() => void leave()} className={`${btn.outline} h-[58px] px-4 text-[17px]`}>
                  Done
                </button>
              </>
            ) : (
              <>
                <button type="button" onClick={() => void leave()} className={`${btn.primary} h-[58px] flex-1`}>
                  Done, see you at noon
                </button>
                <button type="button" disabled={!picked} onClick={begin} className={`${btn.outline} h-[58px] px-4 text-[17px] disabled:opacity-60`}>
                  Start now
                </button>
              </>
            )}
          </div>
        </Dock>
      }
    >
      <section className="flex flex-col gap-2">
        <h1 className="font-display text-[48px] uppercase leading-[0.95]">
          {m.headline.map((l, i) => (
            <span key={i} className="block">
              {l}
            </span>
          ))}
        </h1>
        {picked && <p className="font-num text-[18px] font-semibold text-ink-3">{meta}</p>}
      </section>

      <ChoiceRow label="Workout for today" choices={m.choices.map((c) => ({ value: c.templateId, label: c.label }))} value={m.templateId} onPick={(id) => void act.pick(id)} />

      {m.lifts.length > 0 && (
        <ol aria-label="Lifts" className="flex flex-col">
          {m.lifts.map((l, i) => (
            <LiftRow
              key={l.position}
              l={l}
              first={i === 0}
              setsPerLift={m.setsPerLift}
              onSwap={() => setSwapping(l)}
              onUndo={() => void act.editLifts((list) => undoSwap(list, l.position))}
              onRemove={() => void act.editLifts((list) => dropLift(list, l.position))}
            />
          ))}
        </ol>
      )}

      <div className="flex items-center justify-between gap-3">
        <button type="button" disabled={!picked} onClick={() => setAdding(true)} className={`${btn.outlinePlain} h-11 px-3.5 disabled:opacity-60`}>
          + Add a lift
        </button>
        {m.canMove && anchor && (
          <button type="button" onClick={() => setMoving(true)} className={btn.quiet}>
            Move to another day
          </button>
        )}
      </div>

      <SwapSheet
        key={swapping?.position ?? "none"}
        lift={swapping}
        list={m.lifts}
        canAlways={swapping !== null && swapping.from !== "added" && m.templateId !== null && m.templateId in plan.templates}
        onToday={(id) => {
          setSwapping(null);
          void act.editLifts((list) => swapToday(list, swapping!.position, id));
        }}
        onAlways={(id) => {
          setSwapping(null);
          void act.swapAlways(swapping!, id);
        }}
        onSkip={() => {
          setSwapping(null);
          void act.editLifts((list) => dropLift(list, swapping!.position));
        }}
        onClose={() => setSwapping(null)}
      />
      <AddLiftSheet open={adding} lifts={m.lifts} onAdd={(ids) => void act.editLifts((list) => addLifts(list, ids))} onClose={() => setAdding(false)} />
      {moving && anchor && <MoveSheet open onClose={() => setMoving(false)} anchor={anchor} week={m.schedule} today={m.date} />}
    </GymFrame>
  );
}

function LiftRow({ l, first, setsPerLift, onSwap, onUndo, onRemove }: { l: LiftView; first: boolean; setsPerLift: number; onSwap: () => void; onUndo: () => void; onRemove: () => void }) {
  const changed = l.from !== "plan";
  const up = l.suggestion.goUp && l.suggestion.weight !== null && l.last ? l.suggestion.weight - Math.max(...l.last.sets.map((x) => x.weight)) : null;
  const replaced = l.replaces ? exercises.get(l.replaces)?.name.toLowerCase() : null;
  const link = "h-11 px-2 font-num text-[15px] font-bold text-ink underline underline-offset-[3px]";
  return (
    <li className={`flex min-h-[46px] items-center gap-2.5 ${first ? "border-t-2 border-ink" : "border-t border-rule"} ${changed ? "-mx-2 bg-raised px-2" : ""} last:border-b last:border-b-rule`}>
      <span className="flex flex-1 flex-col py-1">
        <span className="text-[16px] font-semibold">{l.name}</span>
        <span className={`tabular text-[13px] ${changed ? "text-ink-3" : "text-muted"}`}>
          {setsPerLift} × {l.repMin} to {l.repMax}
          {l.from === "swap" && <span className="font-bold"> · swapped for {replaced}, today only</span>}
          {l.from === "added" && <span className="font-bold"> · added today</span>}
          {up !== null && (
            <span className="font-bold text-brass-tag">
              {" "}
              · {l.suggestion.weight} lb, up {up}
            </span>
          )}
        </span>
      </span>
      {l.from === "swap" ? (
        <button type="button" onClick={onUndo} aria-label={`Undo swap, back to ${replaced}`} className={link}>
          Undo
        </button>
      ) : l.from === "added" ? (
        <button type="button" onClick={onRemove} aria-label={`Remove ${l.name.toLowerCase()}`} className={link}>
          Remove
        </button>
      ) : (
        <button type="button" onClick={onSwap} aria-label={`Swap ${l.name.toLowerCase()}`} className="flex size-11 items-center justify-center text-ink-3">
          <Icon name="swap" size={18} />
        </button>
      )}
    </li>
  );
}
```

- [ ] **Step 2: Typecheck.** `npm run typecheck`. Expected: only Task 4's `today.tsx` errors.

- [ ] **Step 3: Commit.**

```bash
git add app/workout/PlanScreen.tsx
git commit -m "Plan: pick, swap, add and skip lifts before the clock starts"
```

---

### Task 12: Set and Rest

Rest is Set's resting state: the same layout with the lift's set rows above the dark panel.

**Files:**
- Create: `app/workout/SetScreen.tsx`

- [ ] **Step 1: Write `app/workout/SetScreen.tsx`:**

```tsx
import { useEffect, useState } from "react";
import { Icon } from "~/components/ui";
import { plan } from "~/content";
import { btn } from "~/ui/button";
import { Dock, GymFrame, HeaderIcon } from "~/ui/GymFrame";
import { ProgressionCallout } from "~/ui/ProgressionCallout";
import { RestPanel } from "~/ui/RestPanel";
import { SegmentRow } from "~/ui/SegmentRow";
import { Stepper } from "~/ui/Stepper";
import { AddLiftSheet } from "./AddLiftSheet";
import { LiftListSheet } from "./LiftListSheet";
import { addLifts, dropLift, swapToday } from "./lifts";
import { lastLine, nextOpen, nextTarget, restAfter, restLeft, standingLine, type LiftView, type RestState, type WorkoutModel } from "./model";
import { NoteSheet } from "./NoteSheet";
import { cancelPing, notificationsOn, pingBody, schedulePing } from "./ping";
import { SetsSheet } from "./SetsSheet";
import { SwapSheet } from "./SwapSheet";
import { useWorkoutActions } from "./use-actions";

type Ping = "on" | "off" | "failed";
const PING_LINE: Record<Ping, string> = {
  on: "Lock your phone. Rocky pings you at 0:00.",
  off: "Turn on notifications in Settings to get a ping.",
  failed: "No signal, so no ping. Keep an eye on the clock.",
};

type SheetName = "list" | "swap" | "add" | "note" | "sets";

/** Time since Start, in its own component so the 1 s tick redraws the header and not the screen. */
function Elapsed({ since }: { since: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  const s = Math.max(0, Math.floor((now - Date.parse(since)) / 1000));
  const h = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return <>{h > 0 ? `${h}:${String(mm).padStart(2, "0")}:${ss}` : `${mm}:${ss}`}</>;
}

/** Set and Rest (mocks WorkoutSet, WorkoutRest). */
export function SetScreen({ m, back }: { m: WorkoutModel; back: string }) {
  const act = useWorkoutActions(m);
  // The lift jumped to from the list, while it is unfinished. Otherwise the first unfinished one.
  const [picked, setPicked] = useState<number | null>(null);
  const [rest, setRest] = useState<RestState | null>(() => restLeft(m, Date.now()));
  const [ping, setPing] = useState<Ping>("on");
  const [sheet, setSheet] = useState<SheetName | null>(null);
  const [entry, setEntry] = useState<{ key: string; weight: number | null; reps: number | null }>({ key: "", weight: null, reps: null });
  useEffect(() => {
    void notificationsOn().then((on) => !on && setPing("off"));
  }, []);

  const lift = rest ? (m.lifts.find((l) => l.position === rest.position) ?? null) : (m.lifts.find((l) => l.position === picked && !l.done) ?? m.current);
  const target = lift && !rest ? nextTarget(lift, m.setsPerLift) : null;
  // The weight and reps on the cards start from the target and reset when the target moves on.
  const targetKey = lift && target ? `${lift.position}-${target.setNumber}` : "";
  const values = entry.key === targetKey ? entry : { key: targetKey, weight: target?.weight ?? null, reps: target?.reps ?? null };

  function schedule(seconds: number, next: RestState["next"]) {
    if (ping === "off") return;
    void schedulePing(seconds, pingBody(next.name, next.setNumber)).then((ok) => setPing((p) => (p === "off" ? p : ok ? "on" : "failed")));
  }

  async function log(l: LiftView, setNumber: number, weight: number, reps: number) {
    if (!(await act.logSet(l, setNumber, weight, reps))) return;
    const after = restAfter(m.lifts, m.setsPerLift, l.position, setNumber, Date.now());
    setRest(after);
    if (after) schedule(after.total, after.next);
    // The last set of the workout has no rest, so any ping still waiting goes.
    else void cancelPing();
  }

  function endRest() {
    if (rest) setPicked(rest.next.position);
    setRest(null);
  }

  function skip() {
    void cancelPing();
    endRest();
  }

  function adjust(delta: number) {
    if (!rest) return;
    const endsAt = rest.endsAt + delta * 1000;
    const left = (endsAt - Date.now()) / 1000;
    if (left <= 0) return skip();
    setRest({ ...rest, endsAt, total: Math.max(rest.total, Math.ceil(left)) });
    schedule(left, rest.next);
  }

  async function check(l: LiftView) {
    if (await act.check(l, true)) setPicked(nextOpen(m.lifts, l.position)?.position ?? null);
  }

  async function finish() {
    setSheet(null);
    void cancelPing();
    await act.finish();
  }

  const index = lift ? m.lifts.indexOf(lift) : m.lifts.length - 1;
  const header = (
    <>
      <HeaderIcon to={back} label="Back to Today. The workout keeps running" icon="close" />
      <button type="button" onClick={() => setSheet("list")} className="tabular h-11 whitespace-nowrap font-num text-[17px] font-bold tracking-[0.04em]">
        LIFT {index + 1} OF {m.lifts.length} · <Elapsed since={m.startedAt!} />
      </button>
      <button type="button" disabled={!lift} onClick={() => setSheet("swap")} className="flex h-11 items-center gap-1.5 rounded-[6px] border-[1.5px] border-border px-3.5 font-num text-[16px] font-bold disabled:opacity-60">
        <Icon name="swap" size={16} />
        Swap
      </button>
    </>
  );
  const segments = m.lifts.map((l) => (l === lift ? ("current" as const) : l.done ? ("done" as const) : ("todo" as const)));

  let body: React.ReactNode;
  let dock: React.ReactNode;
  if (!lift) {
    body = (
      <>
        <section className="flex flex-col gap-2">
          <h1 className="font-display text-[64px] uppercase leading-[0.92]">
            <span className="block">Every lift.</span>
            <span className="block">Done.</span>
          </h1>
          <p className="font-num text-[18px] font-semibold text-ink-3">Finish to see what moves up next week.</p>
        </section>
        <button type="button" onClick={() => setSheet("list")} className={btn.quiet}>
          See or fix the lifts
        </button>
      </>
    );
    dock = (
      <Dock>
        <button type="button" onClick={() => void finish()} className={`${btn.gym} h-16`}>
          Finish workout
        </button>
      </Dock>
    );
  } else if (rest) {
    const nextLift = m.lifts.find((l) => l.position === rest.next.position);
    const same = rest.next.position === lift.position;
    const nextUp = nextLift ? nextTarget(nextLift, m.setsPerLift) : null;
    body = (
      <>
        <section className="flex flex-col gap-2">
          <h1 className="font-display text-[64px] uppercase leading-[0.92] [overflow-wrap:anywhere]">{lift.name}.</h1>
          <p className="font-num text-[18px] font-semibold text-ink-3">
            {same ? `Set ${rest.next.setNumber} of ${m.setsPerLift} next` : `Next: ${rest.next.name}`} · {lift.repMin} to {lift.repMax} reps · to failure
          </p>
        </section>
        <ol aria-label="Sets" className="flex flex-col">
          {lift.sets.map((x, i) => (
            <li key={x.key} className={i === 0 ? "border-t-2 border-ink" : "border-t border-rule"}>
              <button type="button" onClick={() => setSheet("sets")} aria-label={`Set ${x.setNumber}, ${x.weight} pounds, ${x.reps} reps. Fix it`} className="flex min-h-14 w-full items-center gap-3 text-left">
                <span className="w-[54px] font-num text-[15px] font-bold text-ink-3">SET {x.setNumber}</span>
                <span className="tabular flex-1 font-num text-[26px] font-bold">
                  {x.weight} × {x.reps}
                </span>
                <span className="flex items-center gap-1 text-[14px] font-semibold text-ink-3">
                  <Icon name="check" size={16} strokeWidth={2.8} />
                  Logged
                </span>
              </button>
            </li>
          ))}
          {nextUp && (
            <li className="flex min-h-14 items-center gap-3 border-y border-rule">
              <span className="w-[54px] font-num text-[15px] font-bold text-ink-3">{same ? `SET ${nextUp.setNumber}` : "NEXT"}</span>
              <span className={`tabular flex-1 font-num font-bold text-muted ${same ? "text-[26px]" : "text-[18px]"}`}>
                {same ? `${nextUp.weight ?? ""} × ${nextUp.reps}` : `${rest.next.name}${nextUp.weight !== null ? `, ${nextUp.weight} × ${nextUp.reps}` : ""}`}
              </span>
              <span className="text-[14px] text-ink-3">target</span>
            </li>
          )}
        </ol>
        <p className="text-[16px] leading-[1.45] text-ink-2">{standingLine(lift, m.setsPerLift)}</p>
      </>
    );
    dock = <RestPanel endsAt={rest.endsAt} total={rest.total} line={PING_LINE[ping]} onAdjust={adjust} onSkip={skip} onDone={endRest} />;
  } else {
    const t = target!;
    const line = lastLine(lift, m.date);
    const after = nextOpen(m.lifts, lift.position);
    const ready = values.weight !== null && values.reps !== null;
    body = (
      <>
        <section className="flex flex-col gap-2">
          <h1 className="font-display text-[64px] uppercase leading-[0.92] [overflow-wrap:anywhere]">{lift.name}.</h1>
          <p className="font-num text-[18px] font-semibold text-ink-3">
            Set {t.setNumber} of {m.setsPerLift} · {lift.repMin} to {lift.repMax} reps · to failure
          </p>
        </section>
        {line.goUp ? <ProgressionCallout>{line.text}</ProgressionCallout> : <p className="text-[16px] leading-[1.4] text-ink-2">{line.text}</p>}
        <button type="button" onClick={() => setSheet("note")} className="flex min-h-11 items-start gap-2 text-left text-[15px] leading-[1.4] text-ink-3">
          <span className="mt-0.5 flex-none">
            <Icon name="pin" size={16} strokeWidth={2} />
          </span>
          {lift.note ? <span>Your note: {lift.note}</span> : <span className="underline decoration-underline underline-offset-4">Add a note</span>}
        </button>
        <section aria-label={`Set ${t.setNumber}`} className="mt-1 grid grid-cols-2 gap-3">
          <Stepper
            label="Weight, lb"
            value={values.weight}
            step={lift.increment}
            decimal
            less={`${lift.increment} pounds less`}
            more={`${lift.increment} pounds more`}
            onChange={(weight) => setEntry({ ...values, weight })}
          />
          <Stepper label="Reps" value={values.reps} step={1} less="One rep fewer" more="One rep more" onChange={(reps) => setEntry({ ...values, reps })} />
        </section>
        {lift.sets.length === 0 && (
          <button type="button" onClick={() => void check(lift)} className={btn.quiet}>
            Done, no numbers
          </button>
        )}
      </>
    );
    dock = (
      <Dock>
        <div className="flex justify-between gap-3 text-[15px] text-ink-3">
          <span>{t.setNumber < m.setsPerLift ? `Then set ${t.setNumber + 1}${values.weight !== null ? ` at ${values.weight}` : ""}` : "Last set"}</span>
          <span className="text-right">{after ? `Next lift: ${after.name}` : "Last lift"}</span>
        </div>
        <button type="button" disabled={!ready} onClick={() => ready && void log(lift, t.setNumber, values.weight!, values.reps!)} className={`${btn.gym} h-16 disabled:opacity-60`}>
          Log set {t.setNumber}
          {ready ? `: ${values.weight} × ${values.reps}` : ""}
        </button>
      </Dock>
    );
  }

  return (
    <GymFrame header={header} dock={dock}>
      <SegmentRow segments={segments} />
      {body}

      <LiftListSheet
        m={m}
        open={sheet === "list"}
        onJump={(position) => {
          setSheet(null);
          setRest(null);
          setPicked(position);
        }}
        onUncheck={(l) => void act.check(l, false)}
        onAdd={() => setSheet("add")}
        onFinish={() => void finish()}
        onClose={() => setSheet(null)}
      />
      <AddLiftSheet open={sheet === "add"} lifts={m.lifts} onAdd={(ids) => void act.editLifts((list) => addLifts(list, ids))} onClose={() => setSheet(null)} />
      <SwapSheet
        key={`swap-${lift?.position}`}
        lift={sheet === "swap" ? lift : null}
        list={m.lifts}
        canAlways={lift !== null && lift.from !== "added" && m.templateId !== null && m.templateId in plan.templates}
        onToday={(id) => {
          setSheet(null);
          void act.editLifts((list) => swapToday(list, lift!.position, id));
        }}
        onAlways={(id) => {
          setSheet(null);
          void act.swapAlways(lift!, id);
        }}
        onSkip={() => {
          setSheet(null);
          setPicked(null);
          void act.editLifts((list) => dropLift(list, lift!.position));
        }}
        onClose={() => setSheet(null)}
      />
      <NoteSheet
        key={`note-${lift?.position}`}
        lift={sheet === "note" ? lift : null}
        onSave={(note) => {
          setSheet(null);
          if (lift) void act.note(lift.exercise, note);
        }}
        onClose={() => setSheet(null)}
      />
      <SetsSheet
        key={`sets-${lift?.position}`}
        lift={sheet === "sets" ? lift : null}
        setsPerLift={m.setsPerLift}
        canAdd={false}
        onEdit={(key, w, r) => void act.editSet(key, w, r)}
        onDelete={(key) => void act.deleteSet(key)}
        onAdd={() => undefined}
        onClose={() => setSheet(null)}
      />
    </GymFrame>
  );
}
```

- [ ] **Step 2: Typecheck.** `npm run typecheck`. Expected: only Task 4's `today.tsx` errors.

- [ ] **Step 3: Commit.**

```bash
git add app/workout/SetScreen.tsx
git commit -m "Set and Rest: log a set, rest with the locked-phone ping, and move on"
```

---

### Task 13: Done

**Files:**
- Create: `app/workout/DoneScreen.tsx`

- [ ] **Step 1: Write `app/workout/DoneScreen.tsx`:**

```tsx
import { useState } from "react";
import { Link } from "react-router";
import type { Feel } from "~/domain/progression";
import { btn } from "~/ui/button";
import { ChoiceRow } from "~/ui/ChoiceRow";
import { Dock, GymFrame, HeaderIcon } from "~/ui/GymFrame";
import { setsText, type WorkoutModel } from "./model";
import { SetsSheet } from "./SetsSheet";
import { useWorkoutActions } from "./use-actions";

const FEELS: { value: Feel; label: string }[] = [
  { value: "easy", label: "Easy" },
  { value: "right", label: "About right" },
  { value: "hard", label: "Hard" },
];

/** Done (mock WorkoutDone). Tapping a lift fixes its sets, or adds them on a day logged after the fact. */
export function DoneScreen({ m, back, dateLabel }: { m: WorkoutModel; back: string; dateLabel: string }) {
  const act = useWorkoutActions(m);
  const [fixing, setFixing] = useState<number | null>(null);
  const fixLift = m.lifts.find((l) => l.position === fixing) ?? null;
  const backLabel = back === "/" ? "Back to Today" : "Back";
  const ups = m.movedUp.length;

  return (
    <GymFrame
      gap="gap-3.5"
      header={
        m.live ? undefined : (
          <>
            <HeaderIcon to={back} label={backLabel} icon="back" />
            <span className="font-num text-[16px] font-bold text-ink-3">{dateLabel}</span>
          </>
        )
      }
      dock={
        <Dock>
          <Link to={back} className={`${btn.gym} h-[60px]`}>
            {backLabel}
          </Link>
        </Dock>
      }
    >
      <section className="flex flex-col gap-2">
        <h1 className="font-display text-[60px] uppercase leading-[0.92]">
          {[...m.headline, "Done."].map((l, i) => (
            <span key={i} className="block">
              {l}
            </span>
          ))}
        </h1>
        <p className="font-num text-[18px] font-semibold text-ink-3">
          {m.totals.lifts} lifts · {m.totals.sets} sets{m.totals.minutes > 0 ? ` · ${m.totals.minutes} min` : ""}
        </p>
        <p className="mt-1 text-[17px] font-medium leading-[1.4]">
          <span className="font-num font-bold">Rocky:</span> {m.rockyLine}
        </p>
      </section>

      {ups > 0 && (
        <section aria-labelledby="moved-up" className="flex flex-col rounded-[6px] border-[1.5px] border-brass-border bg-brass-fill px-3.5 pb-1.5 pt-1">
          <h2 id="moved-up" className="mb-1 mt-2 flex items-center gap-2 font-num text-[16px] font-bold">
            <span className="rounded-[3px] bg-brass-tag px-[7px] py-[3px] text-[13px] tracking-[0.06em] text-brass-on">MOVED UP</span>
            {ups} lift{ups === 1 ? " goes" : "s go"} up next week
          </h2>
          {m.movedUp.map((x, i) => (
            <div key={x.name} className={`flex min-h-10 items-baseline justify-between gap-3 pt-2 ${i < ups - 1 ? "border-b border-brass-border" : ""}`}>
              <span className="text-[16px]">{x.name}</span>
              <span className="tabular font-num text-[18px] font-bold">
                {x.from} → {x.to} lb
              </span>
            </div>
          ))}
        </section>
      )}

      <ul aria-label="Every lift" className="flex flex-col text-[15px]">
        {m.lifts.map((l, i) => {
          const up = m.movedUp.some((x) => x.name === l.name);
          return (
            <li key={l.position} className={`${i === 0 ? "border-t-2 border-ink" : "border-t border-rule"} last:border-b last:border-b-rule`}>
              <button type="button" onClick={() => setFixing(l.position)} className="flex min-h-11 w-full items-center justify-between gap-3 text-left">
                <span>{l.name}</span>
                {l.checked ? (
                  <span className="font-num font-bold">Done, no numbers</span>
                ) : l.sets.length > 0 ? (
                  <span className="tabular font-num font-bold">
                    {setsText(l.sets)}
                    {up ? "" : " · holds"}
                  </span>
                ) : (
                  <span className="text-muted">{m.live ? "Not done" : "Add sets"}</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      <section aria-label="How it felt" className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <span className="text-[16px] font-semibold">How did it feel?</span>
          <span className="text-[14px] text-muted">optional</span>
        </div>
        <ChoiceRow label="How it felt" layout="grid" choices={FEELS} value={m.feel} onPick={(f) => void act.rate(f === m.feel ? null : f)} />
      </section>

      <SetsSheet
        key={fixing ?? "none"}
        lift={fixLift}
        setsPerLift={m.setsPerLift}
        canAdd
        onEdit={(key, w, r) => void act.editSet(key, w, r)}
        onDelete={(key) => void act.deleteSet(key)}
        onAdd={(n, w, r) => fixLift && void act.logSet(fixLift, n, w, r)}
        onClose={() => setFixing(null)}
      />
    </GymFrame>
  );
}
```

- [ ] **Step 2: Typecheck.** `npm run typecheck`. Expected: only Task 4's `today.tsx` errors.

- [ ] **Step 3: Commit.**

```bash
git add app/workout/DoneScreen.tsx
git commit -m "Done: what moved up, every lift's sets, and the feel tap"
```

---

### Task 14: The route, and the v1 workout screen goes

**Files:**
- Modify: `app/routes/workout.tsx` (full rewrite), `app/server/workouts.server.ts`, `tests/workers/workouts.test.ts`
- Delete: `tests/workers/workout-route.test.ts`, `tests/workers/custom-workout.test.ts`
- Create: `tests/workers/workout-readers.test.ts`

- [ ] **Step 1: Write the readers test first.** The deleted custom-workout tests checked that Progress and the check-in counts see a custom or no-numbers workout. This keeps that cover with the new mutators. Create `tests/workers/workout-readers.test.ts`:

```ts
import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { addDays, localDate } from "~/domain/dates";
import { datesWithWorkouts } from "~/server/history.server";
import { progressData } from "~/server/progress.server";
import { processPush } from "~/sync/push.server";
import { db } from "./helpers";

// v1 screens (Progress, the check-in counts) keep reading workouts the new screens write.
const now = new Date();
const at = now.toISOString();
const day = (n: number) => addDays(localDate(now), -n);
const push = (clientId: string, mutations: { name: string; args: unknown }[]) => processPush(env.DB, { clientId, mutations: mutations.map((m, i) => ({ id: i + 1, ...m })) }, now);

describe("v1 readers see workouts made on the new screens", () => {
  it("shows Your own, checked off without numbers, in Progress and counts its day", async () => {
    const date = day(1);
    const res = await push("phone-1", [
      { name: "planWorkout", args: { clientId: "own-1", date, templateId: "custom", at } },
      { name: "setLifts", args: { workout: "own-1", lifts: [{ position: 100, exercise: "pull-up", repMin: 8, repMax: 12, from: "added" }] } },
      { name: "checkLift", args: { workout: "own-1", exercise: "pull-up", done: true } },
      { name: "finishWorkout", args: { workout: "own-1", at } },
    ]);
    expect(res.rejected).toEqual([]);
    const { recentWorkouts } = await progressData(db(), localDate(now));
    expect(recentWorkouts).toContainEqual(expect.objectContaining({ date, name: "Custom workout", sets: 0, checks: 1 }));
    expect(await datesWithWorkouts(db(), date, date)).toEqual(new Set([date]));
  });

  it("leaves a workout planned but never started out of Progress and the counts", async () => {
    const date = day(2);
    await push("phone-2", [{ name: "planWorkout", args: { clientId: "plan-only", date, templateId: "wed-legs-shoulders", at } }]);
    const { recentWorkouts } = await progressData(db(), localDate(now));
    expect(recentWorkouts.some((w) => w.date === date)).toBe(false);
    expect(await datesWithWorkouts(db(), date, date)).toEqual(new Set());
  });
});
```

- [ ] **Step 2: Run it.**

```bash
npx vitest run --project workers tests/workers/workout-readers.test.ts
```

Expected: PASS. It guards behaviour W1 already has; it must stay green after the deletions below. If it fails, the v1 readers break on W2 data: stop and report rather than working around it.

- [ ] **Step 3: Rewrite `app/routes/workout.tsx`:**

```tsx
import { useMemo } from "react";
import { useSearchParams } from "react-router";
import { plan } from "~/content";
import { useNow } from "~/lib/use-now";
import { useStoreVersion, useSyncClient, useSyncStatus } from "~/sync/react";
import { dateLabel } from "~/today/model";
import { DoneScreen } from "~/workout/DoneScreen";
import { buildWorkout } from "~/workout/model";
import { PlanScreen } from "~/workout/PlanScreen";
import { SetScreen } from "~/workout/SetScreen";

export const handle = { hideTabBar: true };

export function meta() {
  return [{ title: "Workout · Rocky" }];
}

const BACK: Record<string, string> = { today: "/", plan: "/plan", progress: "/progress" };

/** All four workout screens. The workout's state picks one, so a change on the phone moves the screen on by itself. */
export default function Workout() {
  const client = useSyncClient();
  const ready = useSyncStatus()?.ready ?? false;
  const version = useStoreVersion();
  const [params] = useSearchParams();
  const minute = Math.floor(useNow(30_000).getTime() / 60_000);
  const date = params.get("date");
  // ?plan=b is the Plan B reminder's link.
  const template = params.get("plan") === "b" ? plan.planB : params.get("template");
  const model = useMemo(
    () => (client && ready ? buildWorkout((t) => client.store.rows(t), new Date(minute * 60_000), { date, template }) : null),
    [client, ready, version, minute, date, template],
  );
  const back = BACK[params.get("from") ?? ""] ?? "/";
  // The server and the first paint have no store yet. It loads from the phone in a few milliseconds.
  if (!model) return <main aria-busy="true" className="min-h-dvh" />;
  if (model.screen === "plan") return <PlanScreen m={model} back={back} dateLabel={dateLabel(model.date)} />;
  if (model.screen === "set") return <SetScreen m={model} back={back} />;
  return <DoneScreen m={model} back={back} dateLabel={dateLabel(model.date)} />;
}
```

- [ ] **Step 4: Remove the v1 write helpers only the old route used.** In `app/server/workouts.server.ts`, delete `updateSet`, `deleteSet`, `swapExercise`, `checkExercise` and `setCustomExercises`. Keep `logSet` and `endSession`, and add this line above `logSet`:

```ts
// No app caller since W2: the worker tests seed history with logSet and endSession. Project 4 removes them.
```

- [ ] **Step 5: Delete the v1 route tests and trim `tests/workers/workouts.test.ts`.**

```bash
git rm tests/workers/workout-route.test.ts tests/workers/custom-workout.test.ts
```

   In `tests/workers/workouts.test.ts`:
1. Change the `~/server/workouts.server` import to `import { endSession, goUps, lastSessionSets, logSet, resolveTemplate, workoutView } from "~/server/workouts.server";`.
2. Delete the tests "swaps for today only without touching other days" and "swaps for good and keeps separate history per exercise".
3. In "keys v1 sets and checks to their workout, and keeps a custom list in lifts", rename it to "keys v1 sets to their workout", and delete the `checkExercise` line, the `exercise_checks` expectation, and the three `setCustomExercises` / `custom` lines at the end.

   Then check nothing still reaches the old route or the deleted helpers:

```bash
rg -n "~/routes/workout|swapExercise|checkExercise|setCustomExercises|updateSet|offline-queue" app tests | rg -v "app/routes/meal.tsx|app/components/PendingSync.tsx|app/lib/offline-queue.ts"
```

   Expected: no output. (The v1 meal screen still uses the offline queue, and `PendingSync` still drains it.)

- [ ] **Step 6: Run the changed worker files.**

```bash
npx vitest run --project workers tests/workers/workouts.test.ts tests/workers/workout-readers.test.ts
```

Expected: PASS.

- [ ] **Step 7: Typecheck.** `npm run typecheck`. Expected: only Task 4's `today.tsx` errors.

- [ ] **Step 8: Commit.**

```bash
git add -A app/routes/workout.tsx app/server/workouts.server.ts tests/workers
git commit -m "The workout route becomes Plan, Set, Rest and Done on the phone's copy"
```

---

### Task 15: Today's links

**Files:**
- Modify: `app/routes/today.tsx`

- [ ] **Step 1: Imports.** In `app/routes/today.tsx`:
1. Change the react-router import to `import { Link, useNavigate, useRouteLoaderData } from "react-router";`.
2. Delete the `MoveSheet` and `CUSTOM_WORKOUT` imports.
3. Add `import { plan } from "~/content";`.
4. Add `type TrainingModel` to the `~/today/model` import.
5. Change the `~/sync/react` import to `import { useMutate, useStoreVersion, useSyncClient, useSyncStatus } from "~/sync/react";` (unchanged if it already reads so).

- [ ] **Step 2: Replace `TodayWithPlan`** with:

```tsx
function TodayWithPlan({ m }: { m: PlanToday }) {
  const [offPlanOpen, setOffPlanOpen] = useState(false);
  // Checks that were already there when the screen opened do not animate. Nothing moves on load.
  const eatenAtOpen = useRef<Set<string> | null>(null);
  eatenAtOpen.current ??= new Set(m.slots.filter((s) => s.logKey).map((s) => s.slot));

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

      <RockyCard label={m.voice === "plain" ? "Rocky" : "Rocky, in your corner"}>{m.message}</RockyCard>

      <Fuel m={m} eatenAtOpen={eatenAtOpen.current} onAteElse={() => setOffPlanOpen(true)} />

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

      <OffPlanSheet open={offPlanOpen} date={m.date} onClose={() => setOffPlanOpen(false)} />
    </Page>
  );
}
```

   If `useSyncClient` is now unused in the file, drop it from the import.

- [ ] **Step 3: The workout poster runs the mutators.** In `NextUpPoster`, replace the `if (n.kind === "workout" && m.training) { ... }` branch with:

```tsx
  if (n.kind === "workout" && m.training) return <WorkoutPoster m={m} t={m.training} />;
```

   and add below `NextUpPoster`:

```tsx
function WorkoutPoster({ m, t }: { m: PlanToday; t: TrainingModel }) {
  const mutate = useMutate();
  const navigate = useNavigate();
  // Plans the workout if nothing has yet (or retargets it, for Short), then starts it, all on the phone.
  async function begin(templateId: string) {
    const at = new Date().toISOString();
    const key = t.workoutKey ?? crypto.randomUUID();
    if ((!t.workoutKey || templateId !== t.templateId) && !(await mutate("planWorkout", { clientId: key, date: m.date, templateId, at }))) return;
    if (await mutate("startWorkout", { workout: key, at })) navigate("/workout");
  }
  return (
    <Poster lines={t.headline} meta={t.meta}>
      {t.goUp && <ProgressionCallout>{t.goUp}</ProgressionCallout>}
      <div className="flex gap-2.5">
        {t.started ? (
          <Link to="/workout" className={`${btn.primary} h-14 flex-1 px-3`}>
            {t.buttonLabel}
          </Link>
        ) : (
          <button type="button" onClick={() => void begin(t.templateId)} className={`${btn.primary} h-14 flex-1 px-3`}>
            {t.buttonLabel}
          </button>
        )}
        {!t.started && t.templateId !== plan.planB && (
          <button type="button" onClick={() => void begin(plan.planB)} className={`${btn.outline} h-14 flex-col px-3.5 text-[16px] uppercase leading-[1.1] tracking-[0.02em]`}>
            Short
            <span className="text-[13px] font-semibold normal-case tracking-normal text-ink-3">25 min, home</span>
          </button>
        )}
      </div>
    </Poster>
  );
}
```

- [ ] **Step 4: Typecheck.** `npm run typecheck`. Expected: no errors.

- [ ] **Step 5: Run Today's model test** once more, since the screen now depends on its new fields:

```bash
npx vitest run --project unit tests/unit/today/model.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add app/routes/today.tsx
git commit -m "Today: Change opens Plan, Start and Short plan and start on the phone"
```

---

### Task 16: Look at each screen against its mock

- [ ] **Step 1: Sign in locally** with a temporary password, as F4a's Task 11 did. Save the hash, swap it, and put it back in Step 7:

```bash
npx wrangler d1 execute rocky-core --local --command "select password_hash from users where name_key = 'kameron'"
npx tsx -e 'import("./app/server/password.ts").then(async (m) => console.log(await m.hashPassword("local-look-check")))'
npx wrangler d1 execute rocky-core --local --command "update users set password_hash = '<hash printed above>' where name_key = 'kameron'"
```

- [ ] **Step 2: Give the local data a last session** so the go-up callout and "MOVED UP" have something to show. With `npm run dev` running and signed in, open `/workout?date=<last Wednesday, YYYY-MM-DD>&template=wed-legs-shoulders`. Tap "Log it", then on Done tap Leg press and add two sets at 270 × 12. Today's Wednesday-style workout then suggests 280. (On another weekday, use that day's template and a date 7 days back.)

- [ ] **Step 3: Compare at 390 x 844** (the same-origin iframe trick from F3), side by side with each artboard:
1. **Plan** (`WorkoutPlan`): open Today, tap "Change today's workout".
    - The header, 48 px headline, meta, picker, lift rows and docked bar match the mock's sizes and weights.
    - The brass "280 lb, up 10" is on Leg press.
    - Swap a lift for today: the row turns `raised` with "swapped for ..., today only" and Undo.
    - "+ Add a lift" adds a raised row with "added today" and Remove.
    - "Move to another day" opens the move sheet; moving the day and then moving it back leaves the week as it was.
    - Before 11:30 the red button is "Done, see you at noon"; from 11:30 it is "Start now".
2. **Set** (`WorkoutSet`): tap Start now.
    - The X, "LIFT 1 OF n · 0:0x" ticking, Swap, the segment row (first red), the 64 px poster, the callout, the note line, the two set cards with 56 px numbers and 48 px steppers, and the 64 px red "LOG SET 1: 280 × 12".
    - Steppers move weight by the exercise's increment and reps by 1. Typing a weight works.
    - Tap the clock: the lift list opens, a jump works, "Finish workout" is there.
3. **Rest** (`WorkoutRest`): log set 1.
    - The set row with a check and "Logged", the muted target row, the standing line, and the dark panel with coral REST, the Anton countdown and the red bar.
    - In DevTools Network: logging posted `/api/rest` (204), +15 s posted again, Skip sent DELETE.
    - With DevTools offline, log the next set: the panel says "No signal, so no ping. Keep an eye on the clock." and the countdown still runs. "Saving 1 change... (offline)" shows. Go back online.
    - Reload mid-rest: the countdown comes back with the right time left.
    - On a browser without notification permission the line reads "Turn on notifications in Settings to get a ping." and no `/api/rest` POST is sent.
4. **Done** (`WorkoutDone`): finish from the lift list.
    - The 60 px headline ends "DONE.", the meta has minutes, "Rocky:" is bold ink, the brass MOVED UP card lists what went up, every lift row shows its sets with "· holds" where it holds.
    - Tap Hard: the MOVED UP card empties. Tap Hard again: it clears and the card comes back.
    - Tap a lift: its sets open; fix one and see the row change.
5. Red appears only on the primary buttons, the current segment, the rest bar and the focus ring. Brass only on the go-up text, the callout and MOVED UP.
6. Run F3's contrast snippet on each screen. Expected: `all text passes`.

- [ ] **Step 4: Today's links.** Back on Today: with a workout planned, the poster still says "Start: <lift>" and "Change today's workout" shows. Tap Start: Set opens with the clock at 0:00. Go back with the X: Today says "Resume: <lift>" and the change link is gone. On a rest day, the optional link opens Plan with that workout picked.

- [ ] **Step 5: The past-day path.** From Plan (the tab), open last week's "Log workout" on a day with nothing logged. Plan shows the date in the header and a red "Log it". Done follows, and its lifts take sets through "+ Add set".

- [ ] **Step 6: Screenshots for the PR**, saved to the session scratchpad: Plan (before noon, with a swap and an add), Set, Rest, Done with MOVED UP, and Done on a past day.

- [ ] **Step 7: Put the local hash back.**

```bash
npx wrangler d1 execute rocky-core --local --command "update users set password_hash = '<saved hash>' where name_key = 'kameron'"
```

- [ ] **Step 8: Commit any fixes** from this task, with a message naming what was fixed.

---

### Task 17: Full suite, PR, and the gym

- [ ] **Step 1: Run the whole suite once.**

```bash
npm run typecheck && npm test
```

Expected: all green. Fix only the failing files, then re-run those files only.

- [ ] **Step 2: Push and open the PR. Do not merge.**

```bash
git push -u origin v2/w2-workout-screens
gh pr create --title "Rocky v2 W2: the four workout screens" --body "<what changed, the answers to the three questions at the top of this plan, the calls, the deviations, the screenshots>"
```

There are no migrations. Cloudflare does not build branches, so the PR has no build check.

- [ ] **Step 3: Report back and wait.** Kameron reviews and merges. After the merge, confirm the Workers Builds check on the merge commit is green:

```bash
gh api repos/kameronpduhon/rocky-the-coach/commits/$(git rev-parse origin/main)/check-runs --jq '.check_runs[] | "\(.name) \(.status) \(.conclusion)"'
```

- [ ] **Step 4: Verify on the wire (Kameron's iPhone, installed app, at the gym).** Kameron does these and reports:
1. **In the morning, plan it.** Tap "Change today's workout", swap one lift for today and add one. Tap "Done, see you at noon". The row is in D1 with its list and a phone time:

    ```bash
    npx wrangler d1 execute rocky-db --remote --command "select client_id, date, template_id, planned_at, started_at, lifts from workout_sessions order by id desc limit 1"
    ```

2. **At noon, offline.** Turn on airplane mode, open the app, tap Start, and log every set. Each set lands on the tap; Rest shows the no-signal line. "Saving <n> changes... (offline)" shows. Turn airplane mode off. Within a minute the notice clears, and the sets are in D1 with the phone's times, not the sync time:

    ```bash
    npx wrangler d1 execute rocky-db --remote --command "select session_key, exercise_id, set_number, weight_lb, reps, logged_at from set_logs order by id desc limit 14"
    ```

    Expected: every `logged_at` is from the gym, minutes apart, and `session_key` is the workout's `client_id`.
3. **The locked-phone ping.** With signal and notifications on, log a set and lock the phone. "Rest's up" with "Set 2 of <lift>." arrives at 0:00. Skip on the next rest: no ping arrives.
4. **Hard holds next week's weight.** Finish and tap Hard on Done. The MOVED UP card empties at once, and D1 has the feel:

    ```bash
    npx wrangler d1 execute rocky-db --remote --command "select date, ended_at, feel from workout_sessions order by id desc limit 1"
    ```

    The next time those lifts come round, Today shows no go-up note for them and Set's line reads "It felt hard, so <weight> again today."
5. **Today afterwards.** Back on Today, the poster has moved on from the workout, and the week strip counts today.
