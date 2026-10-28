# P5c: Tell Rocky Implementation Plan

> **For agentic workers:** implement this plan task-by-task with the `executing-plans` skill. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Starts from P5b's live result.** **No migration in P5c.** With no `ANTHROPIC_API_KEY` set, or the AI switch off, nothing here shows on Today and Settings' "+ Tell Rocky something" keeps saving the note as written, so nothing waits on the secret.

**Goal:** The person tells Rocky something in plain words ("My left shoulder is sore, no overhead pressing this week") and Rocky proposes changes they can accept one by one (option 4B):
- **Three kinds only:** swap an exercise (library exercises only), move a workout, remember a fact. Nothing changes until Accept, and each Accept runs an existing named change.
- **A swap states its scope.** A temporary note gets "This week only", which changes this week's remaining workouts that have the lift and leaves next week alone. A lasting preference gets "From now on", which swaps the lift in the plan.
- **Where it opens:** a "Tell Rocky something" line on Today's Rocky card (with the AI on and set up), and Settings' "+ Tell Rocky something", which opens the AI sheet when the AI is on.
- **Checked twice.** The Worker drops a proposal that names anything outside the plan or the library, or a fact with a number the person didn't type. The phone drops one that no longer fits its copy (a lift already swapped, a move across weeks or onto a logged day, a fact past 30).

**Architecture:**
- **`app/ai/proposals.ts`, pure, run by both sides:** the flat structured-output schema the model fills, the Worker's content checks (`checkProposals`), the phone's context (`tellContext`), its row checks and card copy (`proposalCards`), the result line, and what Accept runs (`runAccept`).
- **The Worker** adds `AiClient.tell` (structured output at low effort, the exercise library as a cached system block) and `POST /api/ai/tell` on P5a's gate.
- **The phone.** `TellSheet` gains its AI branch: the note, Send, the result line and a card per proposal. `RockyCard` gains an `action` slot for Today's line.
- **One named change widens:** `planWorkout` accepts any day up to the end of the week ahead, so a this-week swap can give Friday's workout its own lift list with `setLifts`.

**Tech Stack:** React Router 8.4 in SPA mode, Cloudflare Workers (D1), `@anthropic-ai/sdk` through P5a's `structuredCall` with Zod 4, the F2 sync layer and the W1 workout changes, Tailwind 4, Vitest 4.

**Spec:** `docs/superpowers/specs/2026-10-28-rocky-ai-design.md`: section 4 "Tell Rocky" (Where it opens, The sheet AI on and AI off, What the model is given, Proposals and their checks), section 1 (the tell row in Endpoints, effort, caching, `max_tokens`), section 7 (the proposal rows, Catherine, 30 facts), section 8 rollout step 3, Testing ("Proposals", "`/api/ai/tell`"). **Earlier plans:** P5a `docs/superpowers/plans/2026-10-28-p5a-ai-data.md` and P5b `docs/superpowers/plans/2026-10-28-p5b-rocky-take.md` (their interface sections). **Branch:** `v2/p5-rocky-ai`, worktree `/Users/kameron/Code/rocky-wt/p5`.

**Mocks:**
- The P5 options board https://claude.ai/artifact/QpJ72DACbHp4WyvN13Gdcj, band 4, picked B: the line on Today's Rocky card (1 px rule above, 48 px row, Barlow 600 16 in paper, underlined, a right chevron) opening the sheet that option A draws (title, 3-line box, outline Send at the right, the result line, a raised card per proposal with a bold title, an ink-3 subline, outline Accept and quiet Dismiss). Settings keeps its button (band 7).
- **Design system:** `docs/design/system.md`. Where it and a mock disagree on looks, the mock wins, except the colour rules.

## Calls made in this plan (flag them when shipping)

- **A swap proposal offers a scope. This overrides the spec's call 1** ("A swap proposal is 'from now on', not 'this week'"), on Kameron's decision of Oct 28:
    - **The model proposes the scope:** `"week"` for a temporary note (soreness, travel, "this week"), `"always"` for a lasting preference.
    - **The card states it** in a small label above the title: "This week only" or "From now on".
    - **"This week only"** runs the existing `setLifts` change on each of this week's remaining planned workouts that contain the lift, giving each day its own list with the lift swapped (the same "Today" swap the workout screen makes). Next week reads the plan again. Its subline names the days: "Legs, Shoulders on Wednesday, Oct 28. Next week goes back to normal."
    - **"From now on"** runs `swapAlways`, with the spec's subline: "Legs, Shoulders, from Wednesday, Oct 28 on. Swap back from the workout any time."
    - **Swaps only to exercises in `content/exercises.json`.** The board's "Landmine press" example isn't in the library, so it can't be proposed.
- **`planWorkout` now accepts any day up to the end of the week ahead,** not only up to tomorrow. A this-week swap on Friday needs Friday's workout saved before `setLifts` can give it a list. The spec didn't foresee this: before this override no proposal touched a future workout's lifts.
- **"This week" is today through the coming Sunday, and on a Sunday the week starting tomorrow** (`weekAheadEnd`). A note on Sunday night ("no overhead pressing this week") is about the week ahead, as the board's example is.
- **A this-week swap covers every remaining workout this week with that lift,** whichever template it's in, not only the template the model named: the note is about the lift. A day whose workout has started, or is logged, is left alone.
- **Moving a day afterwards drops its this-week swap.** `moveWorkout` deletes a planned-but-unstarted workout on the days it swaps, and the day replans from its new workout. Moving a sore-shoulder day is rare enough to leave as is.
- **A move proposal must start on a day with a workout** (on the phone). The title reads "Move <Weekday>'s <workout> to <Weekday>", which needs one.
- **The model gets the next 8 days (today and 7 more),** as the spec says, and each of their templates' current lifts. Optional workouts don't show as days: the context lists only the scheduled plan, and "rest" for the rest.
- **Proposals are capped at 3 after the Worker's checks drop the bad ones,** so a dropped proposal doesn't use up a slot.
- **"Remember it"** (after no proposals, or a fallback) saves the note as an undated fact, as the AI-off Save does. A note over 200 characters can't be a fact, so for one that long the button is replaced by "What Rocky knows keeps 200 characters a note. Shorten it to keep it."
- **Today's line shows only on the plan Today.** Catherine's Today ("Your plan is on the way") has no Rocky card; she tells Rocky from Settings, and gets fact proposals only.
- **Today's date** sent with a note is the Chicago calendar date (`localDate`), not the meal date that rolls at 3am: a note at 1am Tuesday is about Tuesday's plans.
- **The sheet's outline buttons** (Send, Accept, Remember it, and the AI-off Save) use the mock's `.bo` style: Barlow Semi Condensed 700 16 in a 44 px ink outline. P5a's Save moves to the same style.
- **The Today line's rule** is paper at 20% opacity, measured from the board (`rgba(243, 238, 228, 0.18)`). The system has no on-ink rule token.

---

## Ground rules

- Everything from the earlier plans applies:
    - No em dashes in code, copy, comments, commits or docs. No emojis.
    - No `Co-Authored-By` lines in commits.
    - Names in copy come from `APP_NAME` and `COACH_NAME` in `app/brand.ts`. Tests build those strings with them.
    - Look with `npm run dev`.
    - During tasks, run only the files named in the step. One full `npm run typecheck && npm test` at the end (Task 7).
    - One commit per task. Stage by path, never `git add -A`, `git add .` or `git commit -a`: another agent writes plan files in this worktree.
    - Never switch branches. Kameron reviews and ships. Remote D1 commands, secrets and calls on the live key are his to run.
- **No real network calls in tests.** Unit tests use `tests/unit/ai/fake-anthropic.ts`; worker tests use `tests/workers/fake-ai.ts` (both from P5a).
- **Nothing personal is logged.** No `console.log` of a note, a proposal or a reply.
- `app/ai/proposals.ts`, `app/tell/*`, `app/ui/*` and `app/routes/today.tsx` run on the phone: no `cloudflare:workers`, no `@anthropic-ai/sdk`, no `*.server.ts` (`import type` is fine). The Worker may import `proposals.ts`.
- Unit test dates use Chicago daylight time and stay before November 1, 2026, except where a test names a later day and passes dates only.
- Worker test storage is isolated per file and shared across the tests in a file, which run in order.

## Files

| File | Responsibility |
|---|---|
| `app/domain/dates.ts` | `weekAheadEnd` |
| `app/sync/mutators.ts` | `planWorkout` reaches the end of the week ahead |
| `app/ai/proposals.ts` (new) | `RawProposal`, `TellReply`, `Proposal`, `checkProposals`, `TellContext`, `tellContext`, `ProposalCard`, `proposalCards`, `resultLine`, `TELL_FAILED`, `Accept`, `runAccept` |
| `app/ai/prompts.server.ts` | `tellRules`, `libraryBlock`, `tellUser` |
| `app/ai/claude.server.ts` | `TellInput`, `AiClient.tell` |
| `workers/api/ai.ts`, `workers/api/router.ts` | `aiTell`; `POST /api/ai/tell` |
| `app/ui/RockyCard.tsx` | The `action` slot |
| `app/tell/TellSheet.tsx`, `app/tell/TellLine.tsx` (new) | The sheet's AI branch; Today's line |
| `app/routes/today.tsx` | The line on Rocky's card, and the sheet |
| `tests/unit/domain/dates.test.ts`, `tests/unit/sync/workout-mutators.test.ts` | The week ahead; planning into it |
| `tests/unit/ai/proposals.test.ts`, `tests/unit/ai/tell-call.test.ts` (new) | Both sides' checks, copy, context, Accept; the request |
| `tests/workers/api-ai-tell.test.ts` (new) | The route against real D1 with a fake model |

---

### Task 0: Confirm P5b is live

No code. Stop and report if a check fails.

- [ ] **Step 1: Branch, tree and what P5c builds on.**

```bash
cd /Users/kameron/Code/rocky-wt/p5 && git branch --show-current && git status --short && git fetch origin && git log --oneline -1 origin/main
rg -n 'export function (readNumbers|strayNumbers)' app/ai/numbers.ts
rg -n 'export async function (aiTake|factTexts|aiGate)' workers/api/ai.ts
rg -n 'prose\?: string|placeholder\?: boolean' app/ui/RockyCard.tsx
rg -n 'export function TellSheet' app/tell/TellSheet.tsx
rg -n 'swapAlways: \{|moveWorkout: \{|setLifts: \{|planWorkout: \{' app/sync/mutators.ts
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://kampduh.com/api/ai/take
```

Expected: `v2/p5-rocky-ai` with nothing modified under `app/`, `workers/` or `tests/` (plan files from another agent are fine); every match; `401`. If `origin/main` is ahead, `git merge origin/main`.

---

### Task 1: A workout can be planned up to the end of the week ahead

**Files:**
- Modify: `app/domain/dates.ts`, `app/sync/mutators.ts`
- Test: `tests/unit/domain/dates.test.ts`, `tests/unit/sync/workout-mutators.test.ts`

- [ ] **Step 1: Write the failing tests.**

1. In `tests/unit/domain/dates.test.ts`, add `weekAheadEnd` to the `~/domain/dates` import and add inside the `describe`:

```ts
  it('ends the week ahead on the coming Sunday, or on a Sunday the next one', () => {
    expect(weekAheadEnd('2026-10-27')).toBe('2026-11-01');
    expect(weekAheadEnd('2026-10-31')).toBe('2026-11-01');
    expect(weekAheadEnd('2026-10-25')).toBe('2026-11-01');
    expect(weekAheadEnd('2026-10-26')).toBe('2026-11-01');
  });
```

2. In `tests/unit/sync/workout-mutators.test.ts`, add inside the `describe` (its `ctx.today` is Wednesday Oct 28):

```ts
  it("plans a workout as far as the end of the week ahead, for a this-week swap, and no further", async () => {
    const tx = fresh();
    await run(tx, "planWorkout", { clientId: "w-fri", date: "2026-10-30", templateId: "fri-chest-shoulders-arms", at: ctx.now });
    expect(await tx.get("workout_sessions", "w-fri")).toMatchObject({ date: "2026-10-30", template_id: "fri-chest-shoulders-arms", started_at: null, lifts: null });
    await expect(run(tx, "planWorkout", { clientId: "w-mon", date: "2026-11-02", templateId: "mon-chest-back-arms", at: ctx.now })).rejects.toThrow("That date is in the future.");
    // On a Sunday the week ahead is the one starting tomorrow.
    await runMutation(tx, "planWorkout", { clientId: "w-wed", date: "2026-10-28", templateId: LEGS, at: "2026-10-25T23:00:00.000Z" }, { now: "2026-10-25T23:00:00.000Z", today: "2026-10-25" });
    expect(await tx.get("workout_sessions", "w-wed")).toMatchObject({ date: "2026-10-28" });
  });
```

- [ ] **Step 2: Run them to make sure they fail.**

```bash
npx vitest run --project unit tests/unit/domain/dates.test.ts tests/unit/sync/workout-mutators.test.ts
```

Expected: FAIL. `weekAheadEnd` is not exported; planning Oct 30 on Oct 28 throws "That date is in the future."

- [ ] **Step 3: `weekAheadEnd`.** In `app/domain/dates.ts`, add under `weekStart`:

```ts
/** The last day of the week ahead: the coming Sunday, or on a Sunday the next one. A note on Sunday night is about the week starting tomorrow. */
export function weekAheadEnd(today: ISODate): ISODate {
  return addDays(weekStart(addDays(today, 1)), 6);
}
```

- [ ] **Step 4: `planWorkout` reaches it.** In `app/sync/mutators.ts`:

1. Add `weekAheadEnd` to the `~/domain/dates` import.

2. Add under `notFuture`:

```ts
/** Up to the end of the week ahead, so Tell Rocky's this-week swap can give Friday's workout its own lift list. */
function notPastWeekAhead(d: string, ctx: MutationContext) {
  if (d > weekAheadEnd(ctx.today)) throw new MutationRejected("That date is in the future.");
}
```

3. In `planWorkout`'s `run`, replace `notFuture(a.date, ctx);` with `notPastWeekAhead(a.date, ctx);`.

Tomorrow is always on or before `weekAheadEnd(today)`, so every date `planWorkout` took before still passes.

- [ ] **Step 5: Run the tests.** Same command as Step 2. Expected: PASS, the older planning tests too.

- [ ] **Step 6: Commit.**

```bash
git add app/domain/dates.ts app/sync/mutators.ts tests/unit/domain/dates.test.ts tests/unit/sync/workout-mutators.test.ts
git commit -m "A workout can be planned up to the end of the week ahead, for a this-week swap"
```

---

### Task 2: The proposal shape and the Worker's checks

**Files:**
- Create: `app/ai/proposals.ts`
- Test: `tests/unit/ai/proposals.test.ts`

- [ ] **Step 1: Write the failing tests.** Create `tests/unit/ai/proposals.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { checkProposals, type Proposal, type RawProposal } from "~/ai/proposals";

const LEGS = "wed-legs-shoulders";
const PRESS = "seated-dumbbell-shoulder-press";
const RAISE = "seated-lateral-raise";
const NOTE = "My left shoulder is sore, no overhead pressing this week";

const raw = (p: Partial<RawProposal>): RawProposal => ({ kind: "fact", templateId: null, replaces: null, exercise: null, scope: null, from: null, to: null, text: null, ...p });
const SWAP: Proposal = { kind: "swap", templateId: LEGS, replaces: PRESS, exercise: RAISE, scope: "week" };
const MOVE: Proposal = { kind: "move", from: "2026-10-28", to: "2026-10-29" };
const FACT: Proposal = { kind: "fact", text: "Left shoulder sore" };

describe("checkProposals (the Worker, against the content)", () => {
  it("keeps proposals naming a plan template, library exercises and real dates, trimming a fact", () => {
    expect(
      checkProposals(
        [
          raw({ kind: "swap", templateId: LEGS, replaces: PRESS, exercise: RAISE, scope: "week" }),
          raw({ kind: "move", from: "2026-10-28", to: "2026-10-29" }),
          raw({ kind: "fact", text: "  Left shoulder sore  " }),
        ],
        NOTE,
        true,
      ),
    ).toEqual([SWAP, MOVE, FACT]);
  });

  it("drops a non-library exercise, an unknown template, a same-exercise swap, a swap with no scope, and a bad move", () => {
    expect(
      checkProposals(
        [
          raw({ kind: "swap", templateId: LEGS, replaces: PRESS, exercise: "landmine-press", scope: "week" }),
          raw({ kind: "swap", templateId: "sat-arms", replaces: PRESS, exercise: RAISE, scope: "always" }),
          raw({ kind: "swap", templateId: LEGS, replaces: PRESS, exercise: PRESS, scope: "always" }),
          raw({ kind: "swap", templateId: LEGS, replaces: PRESS, exercise: RAISE, scope: null }),
          raw({ kind: "move", from: "2026-10-28", to: "2026-02-30" }),
          raw({ kind: "move", from: "2026-10-28", to: "2026-10-28" }),
        ],
        NOTE,
        true,
      ),
    ).toEqual([]);
  });

  it("drops a fact with a number the person didn't type, or past 200 characters, and keeps one with a typed number", () => {
    expect(checkProposals([raw({ text: "Keep walks under 30 minutes" })], NOTE, true)).toEqual([]);
    expect(checkProposals([raw({ text: "x".repeat(201) })], NOTE, true)).toEqual([]);
    expect(checkProposals([raw({ text: "Feet hurt after 45 minutes" })], "My feet hurt after 45 minutes of walking", true)).toEqual([{ kind: "fact", text: "Feet hurt after 45 minutes" }]);
  });

  it("keeps at most three, and only facts for someone with no plan", () => {
    const facts = ["Sore shoulder", "Bad knee", "Short on sleep", "Travelling Thursday"].map((text) => raw({ text }));
    expect(checkProposals(facts, NOTE, true)).toHaveLength(3);
    expect(
      checkProposals([raw({ kind: "swap", templateId: LEGS, replaces: PRESS, exercise: RAISE, scope: "week" }), raw({ kind: "move", from: "2026-10-28", to: "2026-10-29" }), raw({ text: "Left shoulder sore" })], NOTE, false),
    ).toEqual([FACT]);
  });
});
```

- [ ] **Step 2: Run them to make sure they fail.**

```bash
npx vitest run --project unit tests/unit/ai/proposals.test.ts
```

Expected: FAIL, "Cannot find module '~/ai/proposals'".

- [ ] **Step 3: Implement.** Create `app/ai/proposals.ts`:

```ts
// Tell Rocky's proposals (spec section 4, "Proposals"): the shape the model fills, and the Worker's checks against the
// content. Task 3 adds the phone's side. Pure: the Worker, the phone and the tests all run it.
import { z } from "zod";
import { exercises, plan } from "~/content";
import { isISODate } from "~/domain/dates";
import type { ISODate } from "~/domain/types";
import { FACT_MAX } from "./facts";
import { readNumbers } from "./numbers";

/** One proposal as the model writes it: flat, with nulls for the fields a kind doesn't use, so one schema fits all three. */
export const RawProposal = z.object({
  kind: z.enum(["swap", "move", "fact"]),
  templateId: z.string().nullable(),
  replaces: z.string().nullable(),
  exercise: z.string().nullable(),
  /** A swap's reach: "week" for a temporary note, "always" for a lasting preference. */
  scope: z.enum(["week", "always"]).nullable(),
  from: z.string().nullable(),
  to: z.string().nullable(),
  text: z.string().nullable(),
});
export type RawProposal = z.infer<typeof RawProposal>;

/** Tell Rocky's structured output. The list is checked and cut to MAX_PROPOSALS here, not by the schema. */
export const TellReply = z.object({ proposals: z.array(RawProposal) });
export type TellReply = z.infer<typeof TellReply>;

export type Scope = "week" | "always";

export type Proposal =
  | { kind: "swap"; templateId: string; replaces: string; exercise: string; scope: Scope }
  | { kind: "move"; from: ISODate; to: ISODate }
  | { kind: "fact"; text: string };

export const MAX_PROPOSALS = 3;

function contentCheck(p: RawProposal, note: string, hasPlan: boolean): Proposal | null {
  if (p.kind === "fact") {
    const text = p.text?.trim() ?? "";
    if (!text || text.length > FACT_MAX) return null;
    // A fact may only carry numbers the person typed: never a number the model made up.
    const typed = new Set(readNumbers(note));
    return readNumbers(text).every((n) => typed.has(n)) ? { kind: "fact", text } : null;
  }
  if (!hasPlan) return null;
  if (p.kind === "swap") {
    const { templateId, replaces, exercise, scope } = p;
    if (!templateId || !(templateId in plan.templates) || !scope) return null;
    if (!replaces || !exercise || !exercises.has(replaces) || !exercises.has(exercise) || replaces === exercise) return null;
    return { kind: "swap", templateId, replaces, exercise, scope };
  }
  if (!isISODate(p.from) || !isISODate(p.to) || p.from === p.to) return null;
  return { kind: "move", from: p.from, to: p.to };
}

/** The Worker's checks (spec section 4, "Checks"). A proposal that fails is dropped without a word; then at most 3. */
export function checkProposals(raw: RawProposal[], note: string, hasPlan: boolean): Proposal[] {
  return raw
    .map((p) => contentCheck(p, note, hasPlan))
    .filter((p): p is Proposal => p !== null)
    .slice(0, MAX_PROPOSALS);
}
```

- [ ] **Step 4: Run the tests.** Same command as Step 2. Expected: PASS. `isISODate` already refuses Feb 30: it round-trips the date.

- [ ] **Step 5: Commit.**

```bash
git add app/ai/proposals.ts tests/unit/ai/proposals.test.ts
git commit -m "Tell Rocky's proposals have one shape, and the Worker drops any that name something outside the plan"
```

---

### Task 3: The phone's context, its checks, the cards, and Accept

**Files:**
- Modify: `app/ai/proposals.ts`
- Test: `tests/unit/ai/proposals.test.ts`

Today in these tests is Tuesday Oct 27. The week ahead runs to Sunday Nov 1: Legs, Shoulders on Wednesday Oct 28 (the shoulder press is its fifth lift, position 4), Chest, Shoulders, Arms on Friday Oct 30 (no shoulder press), rest otherwise.

- [ ] **Step 1: Write the failing tests.** In `tests/unit/ai/proposals.test.ts`:

1. Replace the imports with:

```ts
import { describe, expect, it } from "vitest";
import { checkProposals, proposalCards, resultLine, runAccept, tellContext, TELL_FAILED, type Proposal, type RawProposal } from "~/ai/proposals";
import { COACH_NAME } from "~/brand";
import { plan } from "~/content";
import type { Row } from "~/sync/tables";
```

2. Add under the `FACT` constant:

```ts
const TODAY = "2026-10-27";
const rowsOf =
  (t: Record<string, Row[]> = {}) =>
  (name: string): Row[] =>
    t[name] ?? [];
const swap = (scope: "week" | "always"): Proposal => ({ kind: "swap", templateId: LEGS, replaces: PRESS, exercise: RAISE, scope });
const TITLE = "Swap Seated dumbbell shoulder press for Seated lateral raise";
const OVERRIDE = { exercise_overrides: [{ template_id: LEGS, position: 4, exercise_id: "machine-shoulder-press" }] };
```

3. Append at the end of the file:

```ts
describe("tellContext (what the phone sends)", () => {
  it("lists today and the next 7 days, and each workout's lifts as the plan has them now", () => {
    const ctx = tellContext(rowsOf(OVERRIDE), TODAY, true);
    expect(ctx.days.map((d) => [d.date, d.weekday, d.workout, d.templateId, d.logged])).toEqual([
      ["2026-10-27", "Tuesday", "rest", null, false],
      ["2026-10-28", "Wednesday", "Legs, Shoulders", LEGS, false],
      ["2026-10-29", "Thursday", "rest", null, false],
      ["2026-10-30", "Friday", "Chest, Shoulders, Arms", "fri-chest-shoulders-arms", false],
      ["2026-10-31", "Saturday", "rest", null, false],
      ["2026-11-01", "Sunday", "rest", null, false],
      ["2026-11-02", "Monday", "Chest, Back, Arms", "mon-chest-back-arms", false],
      ["2026-11-03", "Tuesday", "rest", null, false],
    ]);
    expect(Object.keys(ctx.templates)).toEqual([LEGS, "fri-chest-shoulders-arms", "mon-chest-back-arms"]);
    expect(ctx.templates[LEGS]).toEqual(["leg-press", "dumbbell-romanian-deadlift", "lying-leg-curl", "leg-extension", "machine-shoulder-press", "cable-lateral-raise"]);
  });

  it("sends nothing about workouts for someone with no plan", () => {
    expect(tellContext(rowsOf(), TODAY, false)).toEqual({ days: [], templates: {} });
  });
});

describe("proposalCards (the phone, against its copy)", () => {
  it("a this-week swap names the days it changes and leaves next week alone", () => {
    const [card] = proposalCards(rowsOf(), [swap("week")], TODAY, true);
    expect(card).toMatchObject({ id: "p0", scope: "This week only", title: TITLE, sub: "Legs, Shoulders on Wednesday, Oct 28. Next week goes back to normal.", done: "Swapped." });
    expect(card.accept).toMatchObject({ kind: "swapWeek", exercise: RAISE, days: [{ date: "2026-10-28", templateId: LEGS, workout: null, position: 4 }] });
  });

  it("a this-week swap uses a workout already planned for the day", () => {
    const planned = { workout_sessions: [{ client_id: "w-28", date: "2026-10-28", template_id: LEGS, started_at: null, ended_at: null, lifts: null, planned_at: "2026-10-27T15:00:00.000Z" }] };
    const [card] = proposalCards(rowsOf(planned), [swap("week")], TODAY, true);
    expect(card.accept).toMatchObject({ kind: "swapWeek", days: [{ date: "2026-10-28", workout: "w-28", position: 4 }] });
  });

  it("a from-now-on swap runs swapAlways at the lift's place in the template", () => {
    expect(proposalCards(rowsOf(), [swap("always")], TODAY, true)).toEqual([
      {
        id: "p0",
        scope: "From now on",
        title: TITLE,
        sub: "Legs, Shoulders, from Wednesday, Oct 28 on. Swap back from the workout any time.",
        done: "Swapped.",
        accept: { kind: "swapAlways", templateId: LEGS, position: 4, exercise: RAISE },
      },
    ]);
  });

  it("drops a swap whose lift isn't in the workout any more", () => {
    expect(proposalCards(rowsOf(OVERRIDE), [swap("week"), swap("always")], TODAY, true)).toEqual([]);
  });

  it("a move names both days, and the workout that trades places", () => {
    expect(proposalCards(rowsOf(), [{ kind: "move", from: "2026-10-28", to: "2026-10-29" }, { kind: "move", from: "2026-10-28", to: "2026-10-30" }], TODAY, true)).toEqual([
      { id: "p0", scope: null, title: "Move Wednesday's Legs, Shoulders to Thursday", sub: "Oct 28 to Oct 29.", done: "Moved.", accept: { kind: "move", a: "2026-10-28", b: "2026-10-29" } },
      {
        id: "p1",
        scope: null,
        title: "Move Wednesday's Legs, Shoulders to Friday",
        sub: "Oct 28 to Oct 30. Friday's Chest, Shoulders, Arms moves to Wednesday.",
        done: "Moved.",
        accept: { kind: "move", a: "2026-10-28", b: "2026-10-30" },
      },
    ]);
  });

  it("drops a move across weeks, from the past, from a rest day, or touching a logged day", () => {
    const logged = { workout_sessions: [{ client_id: "w-28", date: "2026-10-28", template_id: LEGS, started_at: "2026-10-27T17:00:00.000Z", ended_at: "2026-10-27T18:00:00.000Z", lifts: null }] };
    const moves: Proposal[] = [
      { kind: "move", from: "2026-10-30", to: "2026-11-02" },
      { kind: "move", from: "2026-10-26", to: "2026-10-29" },
      { kind: "move", from: "2026-10-29", to: "2026-10-31" },
    ];
    expect(proposalCards(rowsOf(), moves, TODAY, true)).toEqual([]);
    expect(proposalCards(rowsOf(logged), [{ kind: "move", from: "2026-10-28", to: "2026-10-29" }], TODAY, true)).toEqual([]);
  });

  it("a fact is dated today, and dropped when What Rocky knows is full", () => {
    expect(proposalCards(rowsOf(), [FACT], TODAY, true)).toEqual([
      { id: "p0", scope: null, title: "Remember: Left shoulder sore (Oct 27)", sub: `Goes in What ${COACH_NAME} knows. Forget it there any time.`, done: "Remembered.", accept: { kind: "fact", text: "Left shoulder sore" } },
    ]);
    const facts = Array.from({ length: 30 }, (_, i) => ({ client_id: `f-${i}`, text: `Fact ${i}`, dated: 0, created_at: "2026-10-20T15:00:00.000Z" }));
    expect(proposalCards(rowsOf({ facts }), [FACT], TODAY, true)).toEqual([]);
  });

  it("keeps only facts for someone with no plan", () => {
    expect(proposalCards(rowsOf(), [swap("week"), { kind: "move", from: "2026-10-28", to: "2026-10-29" }, FACT], TODAY, false).map((c) => c.accept.kind)).toEqual(["fact"]);
  });
});

describe("resultLine", () => {
  it("counts the changes, and says when there are none", () => {
    expect(resultLine(2)).toBe(`${COACH_NAME} suggests 2 changes. Nothing changes until you accept one.`);
    expect(resultLine(1)).toBe(`${COACH_NAME} suggests 1 change. Nothing changes until you accept it.`);
    expect(resultLine(0)).toBe(`${COACH_NAME} has nothing to change for that. Keep it in What ${COACH_NAME} knows?`);
    expect(TELL_FAILED).toBe(`${COACH_NAME} couldn't read that just now. Keep it as written?`);
  });
});

describe("runAccept", () => {
  const recorder = (refuse?: string) => {
    const calls: [string, unknown][] = [];
    const mutate = async (name: string, args: unknown) => {
      calls.push([name, args]);
      return name !== refuse;
    };
    return { calls, mutate };
  };
  const ids = () => {
    const queue = ["w-new", "f-new"];
    return () => queue.shift()!;
  };
  const now = () => new Date("2026-10-27T21:00:00.000Z");

  it("a this-week swap plans the day's workout, then gives it the swapped list", async () => {
    const { calls, mutate } = recorder();
    const [card] = proposalCards(rowsOf(), [swap("week")], TODAY, true);
    expect(await runAccept(card.accept, mutate, ids(), now)).toBe(true);
    const legs = plan.templates[LEGS]!.exercises;
    expect(calls).toEqual([
      ["planWorkout", { clientId: "w-new", date: "2026-10-28", templateId: LEGS, at: "2026-10-27T21:00:00.000Z" }],
      [
        "setLifts",
        {
          workout: "w-new",
          lifts: legs.map((e, position) =>
            position === 4
              ? { position, exercise: RAISE, repMin: e.repMin, repMax: e.repMax, from: "swap", replaces: PRESS }
              : { position, exercise: e.exercise, repMin: e.repMin, repMax: e.repMax, from: "plan" },
          ),
        },
      ],
    ]);
  });

  it("stops at the first change the rules refuse", async () => {
    const { calls, mutate } = recorder("planWorkout");
    const [card] = proposalCards(rowsOf(), [swap("week")], TODAY, true);
    expect(await runAccept(card.accept, mutate, ids(), now)).toBe(false);
    expect(calls.map(([name]) => name)).toEqual(["planWorkout"]);
  });

  it("runs swapAlways, moveWorkout and rememberFact for the other kinds", async () => {
    const { calls, mutate } = recorder();
    const cards = proposalCards(rowsOf(), [swap("always"), MOVE, FACT], TODAY, true);
    const next = ids();
    next(); // The fact takes the second id.
    for (const c of cards) await runAccept(c.accept, mutate, next, now);
    expect(calls).toEqual([
      ["swapAlways", { templateId: LEGS, position: 4, exercise: RAISE }],
      ["moveWorkout", { a: "2026-10-28", b: "2026-10-29" }],
      ["rememberFact", { clientId: "f-new", text: "Left shoulder sore", dated: true }],
    ]);
  });
});
```

- [ ] **Step 2: Run them to make sure they fail.**

```bash
npx vitest run --project unit tests/unit/ai/proposals.test.ts
```

Expected: FAIL. `tellContext`, `proposalCards`, `resultLine`, `runAccept` and `TELL_FAILED` are not exported. Task 2's tests still pass.

- [ ] **Step 3: Implement.** In `app/ai/proposals.ts`:

1. Replace the comment and imports at the top with:

```ts
// Tell Rocky's proposals (spec section 4, "Proposals"): the shape the model fills, the Worker's checks against the
// content, the context the phone sends, the phone's checks against its copy, each card's copy, and what Accept runs.
// Pure: the Worker, the phone and the tests all run it.
import { z } from "zod";
import { COACH_NAME } from "~/brand";
import { exercises, plan } from "~/content";
import { templateFor, type Moves } from "~/domain/calendar";
import { addDays, isISODate, weekAheadEnd, weekStart, weekday } from "~/domain/dates";
import type { ISODate } from "~/domain/types";
import type { Row } from "~/sync/tables";
import type { Mutate } from "~/workout/actions";
import { resolveLifts, swapToday, workoutTitle, type Lift } from "~/workout/lifts";
import { doneDates, sessionKey, type Rows } from "~/workout/sessions";
import { FACT_LIMIT, FACT_MAX } from "./facts";
import { readNumbers } from "./numbers";
```

2. Append:

```ts
const DAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const CONTEXT_DAYS = 8;

const dayName = (d: ISODate) => DAY[weekday(d)];

function monthDay(d: ISODate): string {
  const [, m, day] = d.split("-").map(Number);
  return `${MONTH_SHORT[m - 1]} ${day}`;
}

const movesOf = (rows: Rows): Moves => Object.fromEntries(rows("schedule_moves").map((r) => [r.date as string, (r.template_id as string | null) ?? null]));
const sessionOn = (rows: Rows, d: ISODate): Row | null => rows("workout_sessions").find((r) => r.date === d) ?? null;

export interface TellDay {
  date: ISODate;
  weekday: string;
  /** The workout's name, or "rest". */
  workout: string;
  templateId: string | null;
  logged: boolean;
}

export interface TellContext {
  days: TellDay[];
  /** Each listed template's current lifts by position, with "always" swaps applied, as the Plan screen shows them. */
  templates: Record<string, string[]>;
}

/** What the phone tells the model about the plan (spec section 4, "What the model is given"). Nothing without a plan. */
export function tellContext(rows: Rows, today: ISODate, hasPlan: boolean): TellContext {
  if (!hasPlan) return { days: [], templates: {} };
  const moves = movesOf(rows);
  const done = doneDates(rows, today);
  const days = Array.from({ length: CONTEXT_DAYS }, (_, i) => addDays(today, i)).map((date): TellDay => {
    const templateId = templateFor(plan, date, moves);
    return { date, weekday: dayName(date), workout: templateId ? workoutTitle(templateId) : "rest", templateId, logged: done.has(date) };
  });
  const ids = [...new Set(days.map((d) => d.templateId).filter((id): id is string => id !== null))];
  return { days, templates: Object.fromEntries(ids.map((id) => [id, resolveLifts(rows, null, id, today).map((l) => l.exercise)])) };
}

/** A day a this-week swap changes: its workout (saved already, or not yet) and its list with the lift's place. */
export interface WeekDay {
  date: ISODate;
  templateId: string;
  /** The saved workout's key; null when Accept has to plan it first. */
  workout: string | null;
  lifts: Lift[];
  position: number;
}

export type Accept =
  | { kind: "swapAlways"; templateId: string; position: number; exercise: string }
  | { kind: "swapWeek"; exercise: string; days: WeekDay[] }
  | { kind: "move"; a: ISODate; b: ISODate }
  | { kind: "fact"; text: string };

export interface ProposalCard {
  id: string;
  /** "This week only" or "From now on" on a swap. */
  scope: string | null;
  title: string;
  sub: string;
  /** The one muted line the card collapses to after Accept. */
  done: string;
  accept: Accept;
}

/** Today through the end of the week ahead: each day whose workout hasn't started and has the lift. */
function weekDays(rows: Rows, today: ISODate, exercise: string): WeekDay[] {
  const moves = movesOf(rows);
  const done = doneDates(rows, today);
  const out: WeekDay[] = [];
  for (let d = today; d <= weekAheadEnd(today); d = addDays(d, 1)) {
    const session = sessionOn(rows, d);
    if (done.has(d) || session?.started_at || session?.ended_at) continue;
    const templateId = (session?.template_id as string | undefined) ?? templateFor(plan, d, moves);
    if (!templateId || !(templateId in plan.templates)) continue;
    const lifts = resolveLifts(rows, session, templateId, d);
    const lift = lifts.find((l) => l.exercise === exercise);
    if (lift) out.push({ date: d, templateId, workout: session ? sessionKey(session) : null, lifts, position: lift.position });
  }
  return out;
}

/** The next day, from today, that the template is on and isn't done. */
function nextDayOf(rows: Rows, today: ISODate, templateId: string): ISODate | null {
  const moves = movesOf(rows);
  const done = doneDates(rows, today);
  for (let i = 0; i < 14; i++) {
    const d = addDays(today, i);
    if (templateFor(plan, d, moves) === templateId && !done.has(d)) return d;
  }
  return null;
}

function cardFor(rows: Rows, p: Proposal, today: ISODate, hasPlan: boolean): Omit<ProposalCard, "id"> | null {
  if (p.kind === "fact") {
    if (rows("facts").length >= FACT_LIMIT) return null;
    return { scope: null, title: `Remember: ${p.text} (${monthDay(today)})`, sub: `Goes in What ${COACH_NAME} knows. Forget it there any time.`, done: "Remembered.", accept: { kind: "fact", text: p.text } };
  }
  if (!hasPlan) return null;
  if (p.kind === "swap") {
    const title = `Swap ${exercises.get(p.replaces)!.name} for ${exercises.get(p.exercise)!.name}`;
    if (p.scope === "week") {
      const days = weekDays(rows, today, p.replaces);
      if (!days.length) return null;
      const on = days.map((d) => `${workoutTitle(d.templateId)} on ${dayName(d.date)}, ${monthDay(d.date)}`).join(" and ");
      return { scope: "This week only", title, sub: `${on}. Next week goes back to normal.`, done: "Swapped.", accept: { kind: "swapWeek", exercise: p.exercise, days } };
    }
    // The template's current lift at some place; that place is what swapAlways gets.
    const lift = resolveLifts(rows, null, p.templateId, today).find((l) => l.exercise === p.replaces);
    if (!lift) return null;
    const next = nextDayOf(rows, today, p.templateId);
    const from = next ? `from ${dayName(next)}, ${monthDay(next)} on` : "from now on";
    return {
      scope: "From now on",
      title,
      sub: `${workoutTitle(p.templateId)}, ${from}. Swap back from the workout any time.`,
      done: "Swapped.",
      accept: { kind: "swapAlways", templateId: p.templateId, position: lift.position, exercise: p.exercise },
    };
  }
  // moveWorkout's own rules, checked here first: the same week, not in the past, neither day logged.
  const moves = movesOf(rows);
  const onFrom = templateFor(plan, p.from, moves);
  const onTo = templateFor(plan, p.to, moves);
  const done = doneDates(rows, today);
  if (!onFrom || weekStart(p.from) !== weekStart(p.to) || p.from < today || p.to < today || done.has(p.from) || done.has(p.to)) return null;
  const trade = onTo ? ` ${dayName(p.to)}'s ${workoutTitle(onTo)} moves to ${dayName(p.from)}.` : "";
  return {
    scope: null,
    title: `Move ${dayName(p.from)}'s ${workoutTitle(onFrom)} to ${dayName(p.to)}`,
    sub: `${monthDay(p.from)} to ${monthDay(p.to)}.${trade}`,
    done: "Moved.",
    accept: { kind: "move", a: p.from, b: p.to },
  };
}

/** The cards the sheet shows, just before it shows them. A proposal that no longer fits the phone's copy is dropped. */
export function proposalCards(rows: Rows, proposals: Proposal[], today: ISODate, hasPlan: boolean): ProposalCard[] {
  const cards: ProposalCard[] = [];
  for (const p of proposals) {
    const card = cardFor(rows, p, today, hasPlan);
    if (card) cards.push({ ...card, id: `p${cards.length}` });
  }
  return cards;
}

export function resultLine(count: number): string {
  if (count === 0) return `${COACH_NAME} has nothing to change for that. Keep it in What ${COACH_NAME} knows?`;
  return count === 1 ? `${COACH_NAME} suggests 1 change. Nothing changes until you accept it.` : `${COACH_NAME} suggests ${count} changes. Nothing changes until you accept one.`;
}

export const TELL_FAILED = `${COACH_NAME} couldn't read that just now. Keep it as written?`;

/** Runs an accepted proposal as named changes. False at the first one the rules refuse; the sync notice says why. */
export async function runAccept(a: Accept, mutate: Mutate, newId: () => string = () => crypto.randomUUID(), now: () => Date = () => new Date()): Promise<boolean> {
  if (a.kind === "swapAlways") return mutate("swapAlways", { templateId: a.templateId, position: a.position, exercise: a.exercise });
  if (a.kind === "move") return mutate("moveWorkout", { a: a.a, b: a.b });
  if (a.kind === "fact") return mutate("rememberFact", { clientId: newId(), text: a.text, dated: true });
  for (const d of a.days) {
    const key = d.workout ?? newId();
    if (!d.workout && !(await mutate("planWorkout", { clientId: key, date: d.date, templateId: d.templateId, at: now().toISOString() }))) return false;
    if (!(await mutate("setLifts", { workout: key, lifts: swapToday(d.lifts, d.position, a.exercise) }))) return false;
  }
  return true;
}
```

- [ ] **Step 4: Run the tests and typecheck.** Same command as Step 2, then `npm run typecheck`. Expected: PASS, no type errors.

- [ ] **Step 5: Commit.**

```bash
git add app/ai/proposals.ts tests/unit/ai/proposals.test.ts
git commit -m "The phone sends Tell Rocky its week, checks each proposal against its copy, and knows what Accept runs"
```

---

### Task 4: Tell Rocky's model call

**Files:**
- Modify: `app/ai/prompts.server.ts`, `app/ai/claude.server.ts`
- Test: `tests/unit/ai/tell-call.test.ts`

- [ ] **Step 1: Write the failing tests.** Create `tests/unit/ai/tell-call.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { anthropicClient, type TellInput } from "~/ai/claude.server";
import { libraryBlock, tellRules, tellUser } from "~/ai/prompts.server";
import { COACH_NAME } from "~/brand";
import { fakeFetch, message, USAGE } from "./fake-anthropic";

const LEGS = "wed-legs-shoulders";
const NOTE = "My left shoulder is sore, no overhead pressing this week";
const INPUT: TellInput = {
  note: NOTE,
  today: "2026-10-27",
  context: {
    days: [
      { date: "2026-10-27", weekday: "Tuesday", workout: "rest", templateId: null, logged: false },
      { date: "2026-10-28", weekday: "Wednesday", workout: "Legs, Shoulders", templateId: LEGS, logged: false },
    ],
    templates: { [LEGS]: ["leg-press", "seated-dumbbell-shoulder-press"] },
  },
  facts: ["No squats or lunges."],
  hasPlan: true,
};
const REPLY = { proposals: [{ kind: "fact", templateId: null, replaces: null, exercise: null, scope: null, from: null, to: null, text: "Left shoulder sore" }] };

describe("AiClient.tell", () => {
  it("asks at low effort for the proposal schema, with the library as a cached block", async () => {
    const { sent, fetch } = fakeFetch(() => message({ content: [{ type: "text", text: JSON.stringify(REPLY) }] }));
    expect(await anthropicClient("k", { fetch, maxRetries: 0 }).tell(INPUT)).toEqual({ ok: true, value: REPLY, usage: USAGE });
    expect(sent[0].body).toMatchObject({
      max_tokens: 3000,
      output_config: { effort: "low", format: { type: "json_schema" } },
      system: [
        { type: "text", text: tellRules(true) },
        { type: "text", text: libraryBlock(), cache_control: { type: "ephemeral" } },
      ],
      messages: [{ role: "user", content: [{ type: "text", text: tellUser(INPUT) }] }],
    });
  });

  it("writes the day, the plan, what Rocky knows and the note", () => {
    expect(tellUser(INPUT)).toBe(
      [
        "Today is Tuesday, 2026-10-27.",
        "",
        "The next days:",
        "- 2026-10-27 Tuesday: rest",
        "- 2026-10-28 Wednesday: Legs, Shoulders (wed-legs-shoulders)",
        "",
        "Each workout's lifts, by position:",
        "- wed-legs-shoulders: leg-press, seated-dumbbell-shoulder-press",
        "",
        "What you know about the person:",
        "- No squats or lunges.",
        "",
        "The note:",
        NOTE,
      ].join("\n"),
    );
    expect(libraryBlock()).toContain("seated-dumbbell-shoulder-press | Seated dumbbell shoulder press | shoulder-press | dumbbell");
    expect(tellRules(true)).toContain(`You are ${COACH_NAME}`);
    expect(tellRules(true)).toContain('Set scope to "week" when the note is temporary');
  });

  it("asks for facts only, with no library, for someone with no plan", async () => {
    const { sent, fetch } = fakeFetch(() => message({ content: [{ type: "text", text: JSON.stringify({ proposals: [] }) }] }));
    const noPlan: TellInput = { ...INPUT, context: { days: [], templates: {} }, hasPlan: false };
    await anthropicClient("k", { fetch, maxRetries: 0 }).tell(noPlan);
    expect(sent[0].body.system).toEqual([{ type: "text", text: tellRules(false) }]);
    expect(tellRules(false)).not.toContain('"swap"');
    expect(tellUser(noPlan)).toBe(["Today is Tuesday, 2026-10-27.", "", "What you know about the person:", "- No squats or lunges.", "", "The note:", NOTE].join("\n"));
  });
});
```

- [ ] **Step 2: Run them to make sure they fail.**

```bash
npx vitest run --project unit tests/unit/ai/tell-call.test.ts
```

Expected: FAIL, `tellRules` is not exported.

- [ ] **Step 3: The prompt.** In `app/ai/prompts.server.ts`:

1. Add to the imports:

```ts
import { exercises } from "~/content";
import { weekday } from "~/domain/dates";
import type { TellInput } from "./claude.server";
```

2. Append:

```ts
const DAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Tell Rocky's rules (spec section 4, "What the model is given"). Without a plan, only facts are asked for. */
export function tellRules(hasPlan: boolean): string {
  return [
    `You are ${COACH_NAME}, the coach in ${APP_NAME}, a fitness app. The person has told you something. Propose changes they can accept or dismiss. Nothing changes unless they accept.`,
    `Propose at most three things, and only of ${hasPlan ? "these three kinds" : "this kind"}:`,
    ...(hasPlan
      ? [
          '- "swap": replace one lift in a workout with an exercise from the library. Give templateId, replaces (the exercise id it replaces, from that workout\'s lifts) and exercise (a library id). Set scope to "week" when the note is temporary (soreness, travel, "this week") and to "always" when it is a lasting preference.',
          '- "move": move the workout on one listed day to another day in the same Monday to Sunday week. Give from and to as dates. Never a logged day, never a day before today.',
        ]
      : []),
    '- "fact": something worth keeping in mind beyond this week. Write it in the person\'s own words, short, with no number they did not type.',
    "Never propose calories, macros, steps or meals. Use only exercise ids from the library and template ids from the listed days.",
    "Set the fields a kind doesn't use to null. Return an empty list when nothing should change.",
  ].join("\n");
}

/** Every exercise in the library, one a line. Cached: it is the same for every note. */
export function libraryBlock(): string {
  return ["The exercise library (id | name | group | equipment):", ...[...exercises.values()].map((e) => `${e.id} | ${e.name} | ${e.group} | ${e.equipment}`)].join("\n");
}

export function tellUser(i: TellInput): string {
  const out = [`Today is ${DAY[weekday(i.today)]}, ${i.today}.`];
  if (i.hasPlan) {
    out.push("", "The next days:", ...i.context.days.map((d) => `- ${d.date} ${d.weekday}: ${d.workout}${d.templateId ? ` (${d.templateId})` : ""}${d.logged ? ", logged" : ""}`));
    out.push("", "Each workout's lifts, by position:", ...Object.entries(i.context.templates).map(([id, lifts]) => `- ${id}: ${lifts.join(", ")}`));
  }
  out.push("", "What you know about the person:", ...(i.facts.length ? i.facts.map((f) => `- ${f}`) : ["- Nothing yet."]), "", "The note:", i.note);
  return out.join("\n");
}
```

- [ ] **Step 4: The call.** In `app/ai/claude.server.ts`:

1. Change the prompts import to `import { libraryBlock, PROBE_SYSTEM, takeSystem, takeUser, tellRules, tellUser } from "./prompts.server";` and add:

```ts
import { TellReply, type TellContext } from "./proposals";
import type { ISODate } from "~/domain/types";
```

2. Add above `export interface AiClient`:

```ts
export interface TellInput {
  note: string;
  today: ISODate;
  context: TellContext;
  /** What Rocky knows, oldest first. */
  facts: string[];
  hasPlan: boolean;
}
```

3. Add to `AiClient`:

```ts
  /** Tell Rocky: proposals in TellReply's shape, checked by the route before they reach the phone. */
  tell(input: TellInput): Promise<AiResult<TellReply>>;
```

4. Add to the object `anthropicClient` returns:

```ts
    tell: (i) =>
      structuredCall(client, {
        // The library is the same for every note, so it is cached; a second note inside 5 minutes reads it from cache.
        system: i.hasPlan ? [{ type: "text", text: tellRules(true) }, { type: "text", text: libraryBlock(), cache_control: { type: "ephemeral" } }] : [{ type: "text", text: tellRules(false) }],
        content: [{ type: "text", text: tellUser(i) }],
        effort: "low",
        maxTokens: 3000,
        schema: TellReply,
      }),
```

`TellReply` is a value import (the schema); `proposals.ts` is pure, so the Worker may import it.

- [ ] **Step 5: Run the tests.**

```bash
npx vitest run --project unit tests/unit/ai/tell-call.test.ts tests/unit/ai/take-call.test.ts tests/unit/ai/claude.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add app/ai/prompts.server.ts app/ai/claude.server.ts tests/unit/ai/tell-call.test.ts
git commit -m "The Worker can ask Claude for Tell Rocky's proposals, with the exercise library cached"
```

---

### Task 5: `POST /api/ai/tell`

**Files:**
- Modify: `workers/api/ai.ts`, `workers/api/router.ts`
- Test: `tests/workers/api-ai-tell.test.ts`

- [ ] **Step 1: Write the failing tests.** Create `tests/workers/api-ai-tell.test.ts`:

```ts
import { env } from "cloudflare:test";
import { afterEach, describe, expect, it } from "vitest";
import type { TellInput } from "~/ai/claude.server";
import type { RawProposal } from "~/ai/proposals";
import { fakeAi, lastCall, seedCalls, setSwitch, withFakeAi, withoutKey } from "./fake-ai";
import { api, CATHERINE, KAMERON, postJson } from "./helpers";

const LEGS = "wed-legs-shoulders";
const PRESS = "seated-dumbbell-shoulder-press";
const NOTE = "My left shoulder is sore, no overhead pressing this week";
const CONTEXT = {
  days: [{ date: "2026-10-28", weekday: "Wednesday", workout: "Legs, Shoulders", templateId: LEGS, logged: false }],
  templates: { [LEGS]: ["leg-press", "dumbbell-romanian-deadlift", "lying-leg-curl", "leg-extension", PRESS, "cable-lateral-raise"] },
};
const USAGE = { input: 3000, output: 600, cacheRead: 1100 };

const raw = (p: Partial<RawProposal>): RawProposal => ({ kind: "fact", templateId: null, replaces: null, exercise: null, scope: null, from: null, to: null, text: null, ...p });
const REPLY = [
  raw({ kind: "swap", templateId: LEGS, replaces: PRESS, exercise: "seated-lateral-raise", scope: "week" }),
  raw({ kind: "swap", templateId: LEGS, replaces: PRESS, exercise: "landmine-press", scope: "week" }),
  raw({ text: "Left shoulder sore, no overhead pressing" }),
];

const tell = (as: number = KAMERON, text = NOTE) => api("/api/ai/tell", postJson({ text, today: "2026-10-27", context: CONTEXT }), as);

let restore = () => {};
afterEach(() => restore());

describe("POST /api/ai/tell", () => {
  it("is a 401 signed out", async () => {
    expect((await api("/api/ai/tell", postJson({ text: NOTE, today: "2026-10-27", context: CONTEXT }))).status).toBe(401);
  });

  it("is a 503 with no key, a 403 with the switch off, and a 400 for an empty note, with no model call", async () => {
    restore = withoutKey();
    expect((await tell()).status).toBe(503);
    restore();
    const { client, calls } = fakeAi({});
    restore = withFakeAi(client);
    await setSwitch(env.DB, false);
    expect(await (await tell()).json()).toEqual({ fallback: "off" });
    await setSwitch(env.DB, true);
    expect((await tell(KAMERON, "   ")).status).toBe(400);
    expect(calls).toEqual([]);
  });

  it("returns only the proposals that pass the checks, and logs the call", async () => {
    const at = "2026-10-20T15:00:00.000Z";
    await env.DB.prepare(`INSERT INTO facts (client_id, text, dated, created_at, updated_at) VALUES ('f-1', 'No squats or lunges.', 0, '${at}', '${at}')`).run();
    const seen: TellInput[] = [];
    const { client } = fakeAi({
      tell: async (input: TellInput) => {
        seen.push(input);
        return { ok: true, value: { proposals: REPLY }, usage: USAGE };
      },
    });
    restore = withFakeAi(client);
    expect(await (await tell()).json()).toEqual({
      proposals: [
        { kind: "swap", templateId: LEGS, replaces: PRESS, exercise: "seated-lateral-raise", scope: "week" },
        { kind: "fact", text: "Left shoulder sore, no overhead pressing" },
      ],
    });
    expect(seen).toEqual([{ note: NOTE, today: "2026-10-27", context: CONTEXT, facts: ["No squats or lunges."], hasPlan: true }]);
    expect(await lastCall(env.DB)).toEqual({ kind: "tell", ok: 1, reason: null, input_tokens: 3000, output_tokens: 600, cache_read_tokens: 1100 });
  });

  it("asks only for facts, with no plan context, for someone with no plan", async () => {
    const seen: TellInput[] = [];
    const { client } = fakeAi({
      tell: async (input: TellInput) => {
        seen.push(input);
        return { ok: true, value: { proposals: REPLY }, usage: USAGE };
      },
    });
    restore = withFakeAi(client);
    expect(await (await tell(CATHERINE)).json()).toEqual({ proposals: [{ kind: "fact", text: "Left shoulder sore, no overhead pressing" }] });
    expect(seen[0]).toMatchObject({ hasPlan: false, context: { days: [], templates: {} } });
  });

  it("answers null proposals when the model fails, and logs why", async () => {
    const { client } = fakeAi({ tell: async () => ({ ok: false, reason: "bad-output", usage: USAGE }) });
    restore = withFakeAi(client);
    expect(await (await tell()).json()).toEqual({ proposals: null });
    expect(await lastCall(env.DB)).toEqual({ kind: "tell", ok: 0, reason: "bad-output", input_tokens: 3000, output_tokens: 600, cache_read_tokens: 1100 });
  });

  it("is a 429 past 20 notes in a day", async () => {
    const { client, calls } = fakeAi({});
    restore = withFakeAi(client);
    await seedCalls(env.DB, "tell", 20);
    const res = await tell();
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ fallback: "cap" });
    expect(calls).toEqual([]);
  });
});
```

- [ ] **Step 2: Run them to make sure they fail.**

```bash
npx vitest run --project workers tests/workers/api-ai-tell.test.ts
```

Expected: FAIL. `/api/ai/tell` gets the router's JSON 404.

- [ ] **Step 3: The route.** In `workers/api/ai.ts`:

1. Add to the imports:

```ts
import { checkProposals } from "~/ai/proposals";
import { currentUser } from "~/server/current-user.server";
```

(`userD1` already comes from `~/server/current-user.server`; merge the two into one import.)

2. Append:

```ts
const TellBody = z.object({
  text: z.string().trim().min(1).max(500),
  today: z.string().refine(isISODate, "Not a date"),
  context: z.object({
    days: z
      .array(z.object({ date: z.string().max(10), weekday: z.string().max(12), workout: z.string().max(80), templateId: z.string().max(64).nullable(), logged: z.boolean() }))
      .max(8),
    templates: z.record(z.string().max(64), z.array(z.string().max(64)).max(30)),
  }),
});

/**
 * Tell Rocky (spec section 4): the model proposes, the content checks drop anything outside the plan or the library,
 * and the phone checks the rest against its copy before showing them. Without a plan only facts are asked for.
 */
export async function aiTell(request: Request): Promise<Response> {
  const call = await aiGate();
  if (call instanceof Response) return call;
  const body = TellBody.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Bad note" }, { status: 400 });
  if (await overCap(call, "tell")) return fallback("cap");
  const hasPlan = Boolean(currentUser().planKey);
  const { text, today, context } = body.data;
  const result = await call.ai.tell({ note: text, today, context: hasPlan ? context : { days: [], templates: {} }, facts: await factTexts(call.d1), hasPlan });
  await logged(call, "tell", result);
  if (!result.ok) return Response.json({ proposals: null }, { headers: NO_STORE });
  return Response.json({ proposals: checkProposals(result.value.proposals, text, hasPlan) }, { headers: NO_STORE });
}
```

3. In `workers/api/router.ts`, add `aiTell` to the `./ai` import and append to `ROUTES`:

```ts
  { method: "POST", path: /^\/api\/ai\/tell$/, run: aiTell },
```

- [ ] **Step 4: Run the tests.** Same command as Step 2, plus `tests/workers/api-ai.test.ts tests/workers/api-ai-take.test.ts`. Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add workers/api/ai.ts workers/api/router.ts tests/workers/api-ai-tell.test.ts
git commit -m "POST /api/ai/tell returns Rocky's checked proposals, facts only without a plan"
```

---

### Task 6: The sheet, Today's line, and Settings' button

The sheet and the line are presentational, and the repo has no DOM test environment. Every rule and string they show comes from `app/ai/proposals.ts` (Tasks 2 and 3) or P5a's components. They are checked by `npm run typecheck` and by eye.

**Files:**
- Modify: `app/ui/RockyCard.tsx`, `app/tell/TellSheet.tsx`, `app/routes/today.tsx`
- Create: `app/tell/TellLine.tsx`

- [ ] **Step 1: `RockyCard`'s action slot.** In `app/ui/RockyCard.tsx`:

1. Add `action` to the props, after `placeholder`:

```tsx
  placeholder,
  action,
}: {
  label: string;
  children?: ReactNode;
  rows?: { label: string; text: string }[];
  prose?: string;
  placeholder?: boolean;
  /** A row under the body, after a hairline rule: Today's "Tell Rocky something". */
  action?: ReactNode;
}) {
```

2. Add just before the closing `</section>`:

```tsx
      {action && <div className="mt-1 border-t border-paper/20 pt-1">{action}</div>}
```

- [ ] **Step 2: Today's line.** Create `app/tell/TellLine.tsx`:

```tsx
import { COACH_NAME } from "~/brand";
import { Icon } from "~/components/ui";

/** "Tell Rocky something" on Today's Rocky card (option 4B). Only shown with the AI on and set up. */
export function TellLine({ onTap }: { onTap: () => void }) {
  return (
    <button type="button" onClick={onTap} className="flex min-h-12 w-full items-center justify-between text-left text-[16px] font-semibold text-paper">
      <span className="underline decoration-on-ink-2 underline-offset-4">Tell {COACH_NAME} something</span>
      <Icon name="chevron" size={18} strokeWidth={2.4} />
    </button>
  );
}
```

- [ ] **Step 3: The sheet's AI branch.** Replace `app/tell/TellSheet.tsx` with:

```tsx
import { useState } from "react";
import { postAi } from "~/ai/client";
import { FACT_LIMIT, FACT_MAX } from "~/ai/facts";
import { proposalCards, resultLine, runAccept, tellContext, TELL_FAILED, type Proposal, type ProposalCard } from "~/ai/proposals";
import { useAi, type AiState } from "~/ai/use-ai";
import { COACH_NAME } from "~/brand";
import { Sheet } from "~/components/Sheet";
import { localDate } from "~/domain/dates";
import { useMe } from "~/me";
import { useMutate, useStoreVersion, useSyncClient, useTable } from "~/sync/react";
import { btn } from "~/ui/button";

export const TELL_PLACEHOLDER = `Sore shoulder, travelling Thursday, anything ${COACH_NAME} should know`;
/** The phone waits this long for Rocky's proposals. */
export const TELL_WAIT_MS = 20_000;
const NOTE_MAX = 500;

const OUTLINE = `${btn.outline} h-11 px-4 text-[16px] disabled:opacity-50`;

/**
 * Tell Rocky (spec section 4). With the AI on and set up, Rocky reads the note and proposes; nothing changes until a
 * proposal is accepted. With the AI off or no key, the note is saved as written.
 */
export function TellSheet({ onClose }: { onClose: () => void }) {
  const ai = useAi();
  return (
    <Sheet open onClose={onClose} title={`Tell ${COACH_NAME}`}>
      {ai.on && ai.available !== false ? <AskRocky ai={ai} onClose={onClose} /> : <SaveAsWritten onClose={onClose} />}
    </Sheet>
  );
}

function NoteBox({ value, max, onChange }: { value: string; max: number; onChange: (text: string) => void }) {
  return (
    <>
      <label htmlFor="tell-note" className="sr-only">
        What should {COACH_NAME} know?
      </label>
      <textarea
        id="tell-note"
        rows={3}
        maxLength={max}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={TELL_PLACEHOLDER}
        className="min-h-[92px] rounded-[6px] border-[1.5px] border-border bg-field px-3 py-[11px] text-[17px] leading-[1.4] focus:border-2 focus:border-ink focus:outline-none"
      />
    </>
  );
}

function SaveAsWritten({ onClose }: { onClose: () => void }) {
  const mutate = useMutate();
  const full = useTable("facts").length >= FACT_LIMIT;
  const [text, setText] = useState("");
  async function save() {
    if (await mutate("rememberFact", { clientId: crypto.randomUUID(), text, dated: false })) onClose();
  }
  if (full) {
    return (
      <p className="text-[16px] leading-[1.45] text-ink-2">
        {COACH_NAME} knows {FACT_LIMIT} things. Forget one to add another.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <NoteBox value={text} max={FACT_MAX} onChange={setText} />
      <p className="text-[14px] leading-[1.4] text-ink-3">{COACH_NAME}'s AI is off, so this is saved as written.</p>
      <button type="button" disabled={!text.trim()} onClick={save} className={`${OUTLINE} self-end`}>
        Save
      </button>
    </div>
  );
}

type Phase = { kind: "edit" } | { kind: "reading" } | { kind: "failed" } | { kind: "result"; cards: ProposalCard[] };

function AskRocky({ ai, onClose }: { ai: AiState; onClose: () => void }) {
  const client = useSyncClient();
  const mutate = useMutate();
  const hasPlan = useMe()?.hasPlan ?? false;
  useStoreVersion();
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "edit" });
  const [settled, setSettled] = useState<Record<string, "done" | "gone">>({});
  const rows = (table: string) => client?.store.rows(table) ?? [];

  async function send() {
    const today = localDate();
    setPhase({ kind: "reading" });
    setSettled({});
    const reply = await postAi<{ proposals: Proposal[] | null }>("/api/ai/tell", { text, today, context: tellContext(rows, today, hasPlan) }, TELL_WAIT_MS);
    // The proposals are checked against the phone's copy as it is now, just before they show.
    setPhase(reply?.proposals ? { kind: "result", cards: proposalCards(rows, reply.proposals, today, hasPlan) } : { kind: "failed" });
  }

  async function remember() {
    if (await mutate("rememberFact", { clientId: crypto.randomUUID(), text, dated: false })) onClose();
  }

  async function accept(card: ProposalCard) {
    if (await runAccept(card.accept, mutate)) setSettled((s) => ({ ...s, [card.id]: "done" }));
  }

  const reading = phase.kind === "reading";
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <NoteBox value={text} max={NOTE_MAX} onChange={setText} />
        <button type="button" onClick={send} disabled={!ai.ready || reading || !text.trim()} className={`${OUTLINE} self-end`}>
          {!ai.ready ? "Needs a signal" : reading ? "Reading" : "Send"}
        </button>
      </div>
      {phase.kind === "failed" && <KeepIt line={TELL_FAILED} text={text} onRemember={remember} />}
      {phase.kind === "result" && phase.cards.length === 0 && <KeepIt line={resultLine(0)} text={text} onRemember={remember} />}
      {phase.kind === "result" && phase.cards.length > 0 && (
        <>
          <p aria-live="polite" className="text-[15px] leading-[1.4] text-ink-3">
            {resultLine(phase.cards.length)}
          </p>
          <ul className="flex flex-col gap-3">
            {phase.cards
              .filter((c) => settled[c.id] !== "gone")
              .map((c) =>
                settled[c.id] === "done" ? (
                  <li key={c.id} className="text-[15px] text-ink-3">
                    {c.done}
                  </li>
                ) : (
                  <li key={c.id} className="flex flex-col gap-2.5 rounded-[6px] border-[1.5px] border-ink bg-raised px-4 py-3.5">
                    {c.scope && <span className="font-num text-[13px] font-bold uppercase tracking-[0.06em] text-ink-3">{c.scope}</span>}
                    <span className="text-[17px] font-bold leading-[1.3]">{c.title}</span>
                    <span className="text-[14px] leading-[1.35] text-ink-3">{c.sub}</span>
                    <span className="flex items-center gap-[18px]">
                      <button type="button" onClick={() => void accept(c)} className={OUTLINE}>
                        Accept
                      </button>
                      <button type="button" onClick={() => setSettled((s) => ({ ...s, [c.id]: "gone" }))} className={`${btn.quiet} self-center`}>
                        Dismiss
                      </button>
                    </span>
                  </li>
                ),
              )}
          </ul>
        </>
      )}
    </div>
  );
}

/** After no proposals or a fallback: keep the note as written, if it fits in What Rocky knows. */
function KeepIt({ line, text, onRemember }: { line: string; text: string; onRemember: () => void }) {
  return (
    <div className="flex flex-col gap-2.5">
      <p aria-live="polite" className="text-[15px] leading-[1.4] text-ink-3">
        {line}
      </p>
      {text.trim().length > FACT_MAX ? (
        <p className="text-[14px] leading-[1.4] text-ink-3">
          What {COACH_NAME} knows keeps {FACT_MAX} characters a note. Shorten it to keep it.
        </p>
      ) : (
        <button type="button" onClick={onRemember} className={`${OUTLINE} self-start`}>
          Remember it
        </button>
      )}
    </div>
  );
}
```

Settings needs no change: its "+ Tell Rocky something" already opens `TellSheet`, which now picks the AI branch when the AI is on.

- [ ] **Step 4: The line on Today.** In `app/routes/today.tsx`:

1. Add to the imports:

```tsx
import { useAi } from "~/ai/use-ai";
import { TellLine } from "~/tell/TellLine";
import { TellSheet } from "~/tell/TellSheet";
```

2. In `TodayWithPlan`, add under `const [closing, setClosing] = useState<CloseOutModel | null>(null);`:

```tsx
  const ai = useAi();
  const [telling, setTelling] = useState(false);
```

3. Replace:

```tsx
      <RockyCard label={m.voice === "plain" ? COACH_NAME : `${COACH_NAME}, in your corner`}>{m.message}</RockyCard>
```

with:

```tsx
      <RockyCard
        label={m.voice === "plain" ? COACH_NAME : `${COACH_NAME}, in your corner`}
        action={ai.on && ai.available === true ? <TellLine onTap={() => setTelling(true)} /> : undefined}
      >
        {m.message}
      </RockyCard>
```

4. Add after the `{closing && <CloseOutSheet ... />}` line:

```tsx
      {telling && <TellSheet onClose={() => setTelling(false)} />}
```

- [ ] **Step 5: Typecheck.**

```bash
npm run typecheck
rg -n 'cloudflare:workers|@anthropic-ai/sdk|\.server"' app/tell app/ai/proposals.ts app/ui/RockyCard.tsx app/routes/today.tsx
```

Expected: no type errors, and the `rg` prints nothing.

- [ ] **Step 6: Look.** `npm run dev`, signed in locally as Kameron as F4a's Task 11 did, at 390 × 844 beside band 4 of the options board:
1. **No key in `.dev.vars`:** Today's Rocky card has no "Tell Rocky something" line. Settings' "+ Tell Rocky something" opens "TELL ROCKY" with "Rocky's AI is off, so this is saved as written." and Save, as in P5a.
2. **Only if Kameron agrees to local calls on his key** (about a cent a note): add `ANTHROPIC_API_KEY` to `.dev.vars` and restart.
    - Today's card ends with a hairline rule and the underlined "Tell Rocky something" with a chevron.
    - Tap it. Type "My left shoulder is sore, no overhead pressing this week" and tap Send: it reads "Reading", then "Rocky suggests 2 changes. Nothing changes until you accept one." (or 1) and a card per proposal. A swap card carries "THIS WEEK ONLY" above its title; its subline names the days.
    - Accept the swap: the card turns into "Swapped.". Open Wednesday's workout from the Plan tab: the shoulder press is replaced for that day only. Accept the fact: "Remembered.", and Settings lists it with today's date.
    - Dismiss a card: it goes.
    - In DevTools go offline: Send reads "Needs a signal" and is disabled; the text stays.
    - Turn the switch off in Settings: the Today line goes, and Settings' button opens the save-as-written sheet.
    - Remove the key from `.dev.vars` afterwards if Kameron prefers local dev on the rules.
3. Red appears nowhere in the sheet or on the line. Run F3's contrast snippet on the sheet. Expected: `all text passes`.

- [ ] **Step 7: Commit.**

```bash
git add app/ui/RockyCard.tsx app/tell/TellLine.tsx app/tell/TellSheet.tsx app/routes/today.tsx
git commit -m "Tell Rocky from Today's card or Settings: Rocky proposes, and nothing changes until you accept"
```

---

### Task 7: Full suite, ship, and check on the wire

- [ ] **Step 1: Run the whole suite once.**

```bash
npm run typecheck && npm test
```

Expected: all green. Fix only the failing files, then re-run those files only.

- [ ] **Step 2: Push the branch and hand over the commit.**

```bash
git push origin v2/p5-rocky-ai
git rev-parse HEAD
```

Report the sha to Kameron and wait for him to say ship. No migrations, no new secrets.

- [ ] **Step 3: Ship that commit.** Only after Kameron says so:

```bash
git push origin <sha>:main
gh api repos/kameronpduhon/rocky-the-coach/commits/<sha>/check-suites --jq '.check_suites[] | "\(.app.name) \(.status) \(.conclusion)"'
```

Expected within a few minutes: the Workers Builds suite `completed success`. If it sits `queued` for more than 6 minutes, tell Kameron; he runs `! npm run deploy`.

- [ ] **Step 4: Check on the wire.**

```bash
M=$(curl -s https://kampduh.com/ | grep -o '/assets/manifest-[A-Za-z0-9_-]*\.js' | head -1); echo "$M"
for c in $(curl -s "https://kampduh.com$M" | grep -o '/assets/[A-Za-z0-9_-]*\.js' | sort -u); do n=$(curl -s "https://kampduh.com$c" | grep -c 'Nothing changes until you accept'); [ "$n" -gt 0 ] && echo "$c $n"; done
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://kampduh.com/api/ai/tell
```

Expected: a manifest path, at least one chunk with a count of 1 or more, and `401`.

- [ ] **Step 5: One real call through the deployed status route.** If the key is set, Kameron opens `https://kampduh.com/api/ai/status?probe=1` signed in, in his desktop browser. Expected: `{"available":true,"probe":{"ok":true,"reason":null}}`. If the key isn't set yet, say so in the report; Tell Rocky stays hidden on Today until it is.

- [ ] **Step 6: Report.** One or two sentences to Kameron: Tell Rocky is live behind the AI switch, with "This week only" and "From now on" swaps, and P5d (Scan) is next. If he wants to see the tell calls later:

```bash
! npx wrangler d1 execute rocky-db --remote --command "select at, ok, reason, input_tokens, output_tokens, cache_read_tokens from ai_calls where kind = 'tell' order by id desc limit 5"
```

---

## Self-review

- **Spec coverage (rollout step 3):**
    - The sheet with the AI on: the box (500), Send, "Reading", "Needs a signal", the result line, a card per proposal with Accept and Dismiss, the collapsed "Swapped.", "Moved.", "Remembered.", no proposals and fallback with "Remember it" (Task 6, copy from Task 3).
    - The sheet with the AI off or no key: the note, Save, the 30-fact line (Task 6, from P5a).
    - What the model is given: today's date and weekday, the next 8 days with workouts and templates' current lifts, the cached library, What Rocky knows, the rules (Tasks 3, 4).
    - Proposals: the three kinds, their copy, the Worker's checks (ids exist, a different exercise, real dates, facts 1 to 200 with typed numbers only) and the phone's (the lift still in the workout, `moveWorkout`'s rules, 30 facts), facts only without a plan (Tasks 2, 3, 5).
    - The line on Today's Rocky card with the AI on and available, `RockyCard`'s `action`; Settings' button opening the AI sheet when the AI is on (Task 6).
    - `/api/ai/tell` with 401/503/403/429/400, `ai_calls`, effort low, `max_tokens` 3000, the library cached (Tasks 4, 5).
    - The override: a scope on each swap, "This week only" through `setLifts` on the week's remaining workouts, "From now on" through `swapAlways` (Tasks 1, 3, 6; see Calls).
- **Testing section items this step owns:** Proposals (each kind's copy; the Worker drops a non-library exercise, an unknown template, a same-exercise swap, a fact with an untyped number; the phone drops a stale `replaces`, a cross-week move and a logged day; Catherine keeps only facts); `/api/ai/tell` drops invalid proposals.
