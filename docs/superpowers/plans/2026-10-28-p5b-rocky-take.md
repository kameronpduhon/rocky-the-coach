# P5b: Rocky's Take Implementation Plan

> **For agentic workers:** implement this plan task-by-task with the `executing-plans` skill. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Starts from P5a's live result.** P5a's migration (`takes`, `facts`, `ai_calls`, `profile.ai`) is on both remote databases and P5a's code is on `main`. **No migration in P5b.** `ANTHROPIC_API_KEY` may or may not be set yet: with no key the check-in keeps showing the rule take, so nothing here waits on it.

**Goal:** With the AI on, the Sunday check-in's ROCKY'S TAKE card shows a take Claude wrote from the week's numbers, in the person's voice, in the same dark card with no label saying who wrote it (option 5A):
- **Written once per week state and stored.** On opening the check-in, if no stored take matches the week's lines and voice, the phone asks `/api/ai/take`, shows three static placeholder bars for up to 10 seconds, then the written take, or the rule take if nothing usable came back.
- **Guarded.** Every number in the take must appear in the lines the model was given; at most four sentences and 420 characters; no dashes, no emoji. The Worker checks before storing, and the phone checks again before showing.
- **Bounded.** Up to 3 writes a week per person (a new weigh-in or a voice change makes a new state), and 6 take calls a day.
- **The rule take stays** whenever the AI is off, there's no key, the phone is offline with nothing stored, or anything fails.

**Architecture:**
- **Pure pieces in `app/ai/`, run by both sides.** `numbers.ts` reads numbers out of text (digits and number words). `take.ts` holds `takeLines` (the week as short labelled lines from P4a's `CheckInDigest` and `ruleTake`), `checkTake`, `takeHash`, and `chooseTake` (which take the card shows, and whether to ask for one).
- **The Worker** adds `AiClient.take` (a plain text call at medium effort) and `POST /api/ai/take`, on P5a's gate. On a pass it upserts the `takes` row; sync carries it to the phone.
- **The phone.** `useTake` hashes the lines, reads the `takes` row, asks when `chooseTake` says so, and pulls after a new take. `TakeCard` renders the result in `RockyCard`, which gains a prose form and a placeholder form.
- **The check-in model** hands the card the digest its rule take was written from, so the AI narrates the same week the rules did.

**Tech Stack:** React Router 8.4 in SPA mode, Cloudflare Workers (D1), `@anthropic-ai/sdk` through P5a's `textCall`, Web Crypto SHA-256, the F2 sync layer, Tailwind 4, Vitest 4.

**Spec:** `docs/superpowers/specs/2026-10-28-rocky-ai-design.md`: section 2 "Rocky's take" (What the model is given, The check, When it is written and shown), section 1 (the take's row in Endpoints, effort and `max_tokens`), section 7 (the take rows), section 8 rollout step 2, Testing ("Numbers", "`checkTake`", "`takeLines`", "`/api/ai/take`", `useTake`'s choice). **P5a plan:** `docs/superpowers/plans/2026-10-28-p5a-ai-data.md` (its "Interfaces later steps build on"). **P4 contracts:** `CheckInDigest`, `buildDigest`, `ruleTake`, `Take` and the `weekThree()` fixture (`docs/superpowers/plans/2026-10-28-p4a-checkin-data.md`, Tasks 8 to 11); `buildCheckIn`, `CheckInModel`, `CheckInScreen` and `RockyCard`'s `rows` (`docs/superpowers/plans/2026-10-28-p4b-checkin-page.md`, Tasks 1 to 3). **Branch:** `v2/p5-rocky-ai`, worktree `/Users/kameron/Code/rocky-wt/p5`. **Next:** `docs/superpowers/plans/2026-10-28-p5c-tell-rocky.md`.

**Mocks:**
- Artboard `CheckInWeek` on https://claude.ai/artifact/65WeReuGH5ZageJng9K6nq: the ROCKY'S TAKE card, coral label, one paragraph in Barlow 500 18 / 1.45, paper on ink.
- The P5 options board https://claude.ai/artifact/QpJ72DACbHp4WyvN13Gdcj, band 5, picked A: the same card for the AI take and the rule take, no label saying who wrote it.

## Calls made in this plan (flag them when shipping)

- **A take is written only while the check-in is open** (phase `open`). Before the window there is no take at all (P4b); after Finish the stored take shows if it still matches, otherwise the rule take. The spec's "After Finish the stored take stays with the week" is kept; a finished week never asks for a new one.
- **The lines' wording,** where the spec's table gives an example but not every case:
    - Lifts: "3 sessions, 2 of 3 planned. 2 lifts moved up. Seated dumbbell shoulder press stuck at 45 lb". The spec's example ("4 sessions, 3 planned") doesn't say how many planned were done; this line does, and names stuck lifts, because the rule fix can name one.
    - The call when Rocky picks steps reads "keep 2,400, walk 1,000 more, step goal 8,000". "Walk ... more" is left out when the new goal isn't higher.
    - A raise reads "raise 150, from 2,400 to 2,550 cal a day from Monday". The spec lists no raise line.
    - The rule take goes in as three lines: "Written win:", "Written fix:" and "Written call:".
- **A stored take whose hash matches but which fails the phone's check shows the rule take and is not re-asked.** The Worker would hand back the same stored text for the same hash, so asking again can't help. It can only happen if `checkTake` changes in a deploy.
- **While the phone is still asking whether the AI is set up** (P5a's `checking`), the card shows the placeholder bars rather than flashing the rule take first. If that ask fails, the rule take shows.
- **The placeholder** is three static bars (100%, 92%, 64% wide, 14 px tall, `on-ink-2` at 30%), with `aria-busy` on the card. Nothing animates, as the spec says.
- **The AI paragraph is 18 / 1.45,** as `CheckInWeek` draws it; Today's card keeps its 19 / 1.4. The rule take keeps P4b's WIN, FIX and CALL rows.
- **The hash is SHA-256 of `JSON.stringify([voice, ...lines])`,** first 16 hex characters, through Web Crypto on both sides.
- **The take's daily cap of 6 calls** (P5a) applies beside the 3 writes a week, so a week whose takes keep failing the check stops calling.
- **The prompt is told the take is to the person, and the call is already made.** The spec's rules say what to write, not who to; the mock writes to "you", with Rocky as "I".

---

## Ground rules

- Everything from the earlier plans applies:
    - No em dashes in code, copy, comments, commits or docs. No emojis. In test strings that need one, write the escape (`"\u2014"`, `"\u2013"`, `"\u{1F4AA}"`), never the character.
    - No `Co-Authored-By` lines in commits.
    - Names in copy come from `APP_NAME` and `COACH_NAME` in `app/brand.ts`. Tests build those strings with them.
    - Look with `npm run dev`.
    - During tasks, run only the files named in the step. One full `npm run typecheck && npm test` at the end (Task 7).
    - One commit per task. Stage by path, never `git add -A`, `git add .` or `git commit -a`: another agent writes plan files in this worktree.
    - Never switch branches. Kameron reviews and ships. Remote D1 commands, secrets and calls on the live key are his to run.
- **No real network calls in tests.** Unit tests use `tests/unit/ai/fake-anthropic.ts`; worker tests use `tests/workers/fake-ai.ts` (both from P5a).
- **Nothing personal is logged.** No `console.log` of lines, facts or a take.
- `app/ai/numbers.ts`, `app/ai/take.ts`, `app/ai/use-take.ts`, `app/checkin/*` and `app/ui/*` run on the phone: no `cloudflare:workers`, no `@anthropic-ai/sdk`, no `*.server.ts` (`import type` is fine). The Worker may import `numbers.ts` and `take.ts`.
- Unit test dates use Chicago daylight time and stay before November 1, 2026.
- Worker test storage is isolated per file and shared across the tests in a file, which run in order.

## Files

| File | Responsibility |
|---|---|
| `app/ai/numbers.ts` (new) | `readNumbers`, `allowedNumbers`, `strayNumbers` |
| `app/ai/take.ts` (new) | `Voice`, `takeLines`, `checkTake`, `takeHash`, `TakeState`, `TakeView`, `chooseTake` |
| `app/ai/prompts.server.ts` | `takeSystem`, `takeUser` |
| `app/ai/claude.server.ts` | `TakeInput`, `AiClient.take` |
| `workers/api/ai.ts`, `workers/api/router.ts` | `factTexts`, `aiTake`; `POST /api/ai/take` |
| `app/ai/use-take.ts` (new) | `useTake`, `TAKE_WAIT_MS` |
| `app/checkin/model.ts` | `CheckInModel.digest`: the digest the rule take was written from |
| `app/ui/RockyCard.tsx` | `prose` and `placeholder` forms |
| `app/checkin/TakeCard.tsx` (new), `app/checkin/CheckInScreen.tsx` | The card picks the AI take, the placeholder or the rule take |
| `tests/unit/ai/numbers.test.ts`, `tests/unit/ai/take.test.ts`, `tests/unit/ai/take-call.test.ts` (new) | The reader, the lines, the check, the hash, the choice, the request |
| `tests/workers/api-ai-take.test.ts` (new) | The route against real D1 with a fake model |
| `tests/unit/checkin/model.test.ts` | The model hands over the digest |

## Interfaces P5c builds on

```ts
// app/ai/numbers.ts (P5c's fact check: a fact may only use numbers the person typed)
export function readNumbers(text: string): number[];
export function allowedNumbers(lines: string[]): Set<number>;
export function strayNumbers(text: string, allowed: Set<number>): number[];

// workers/api/ai.ts
export function factTexts(d1: D1Database): Promise<string[]>; // What Rocky knows, oldest first, for a prompt

// app/ui/RockyCard.tsx (P5c adds `action`)
export function RockyCard(props: { label: string; children?: ReactNode; rows?: { label: string; text: string }[]; prose?: string; placeholder?: boolean }): JSX.Element;
```

---

### Task 0: Confirm P5a is live

No code. Stop and report if a check fails.

- [ ] **Step 1: Branch, tree and P5a's pieces.**

```bash
cd /Users/kameron/Code/rocky-wt/p5 && git branch --show-current && git status --short && git fetch origin && git log --oneline -1 origin/main
rg -n 'export async function (aiGate|overCap|logged|aiStatus)|export function (setAiDeps|fallback)' workers/api/ai.ts
rg -n 'export async function (textCall|structuredCall)|export function anthropicClient' app/ai/claude.server.ts
ls tests/workers/fake-ai.ts tests/unit/ai/fake-anthropic.ts app/ai/use-ai.ts app/ai/client.ts
rg -n 'export function RockyCard' app/ui/RockyCard.tsx && rg -n 'take: Take \| null' app/checkin/model.ts
curl -s -o /dev/null -w '%{http_code}\n' https://kampduh.com/api/ai/status
```

Expected: `v2/p5-rocky-ai` with nothing modified under `app/`, `workers/` or `tests/` (plan files from another agent are fine); every export and file listed; `401`. If `origin/main` is ahead, `git merge origin/main`.

---

### Task 1: Reading numbers out of text

**Files:**
- Create: `app/ai/numbers.ts`
- Test: `tests/unit/ai/numbers.test.ts`

- [ ] **Step 1: Write the failing tests.** Create `tests/unit/ai/numbers.test.ts`:

```ts
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
```

- [ ] **Step 2: Run them to make sure they fail.**

```bash
npx vitest run --project unit tests/unit/ai/numbers.test.ts
```

Expected: FAIL, "Cannot find module '~/ai/numbers'".

- [ ] **Step 3: Implement.** Create `app/ai/numbers.ts`:

```ts
// Numbers in text (spec section 2, "The check"): digits, and the number words a coach might write. "One" and "a" are
// left alone, since they are mostly a pronoun and an article. Pure: the phone and the Worker both run it.

const WORDS: Record<string, number> = {
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
  hundred: 100,
  thousand: 1000,
  half: 0.5,
  quarter: 0.25,
};

const DIGITS = /\d[\d,]*(?:\.\d+)?/g;

/** Every number in the text, by value: the digits (commas dropped, never a sign), then the number words. */
export function readNumbers(text: string): number[] {
  const digits = [...text.matchAll(DIGITS)].map((m) => Number(m[0].replace(/,/g, "")));
  const words = (text.toLowerCase().match(/[a-z]+/g) ?? []).filter((w) => Object.hasOwn(WORDS, w)).map((w) => WORDS[w]);
  return [...digits, ...words];
}

export function allowedNumbers(lines: string[]): Set<number> {
  return new Set(lines.flatMap(readNumbers));
}

/** The numbers in `text` that aren't allowed. */
export function strayNumbers(text: string, allowed: Set<number>): number[] {
  return readNumbers(text).filter((n) => !allowed.has(n));
}
```

- [ ] **Step 4: Run the tests.** Same command as Step 2. Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add app/ai/numbers.ts tests/unit/ai/numbers.test.ts
git commit -m "Numbers are read out of text as digits and number words, for the take's check"
```

---

### Task 2: The take's lines, its check, its hash, and which take shows

**Files:**
- Create: `app/ai/take.ts`
- Test: `tests/unit/ai/take.test.ts`

The tests run on P4a's `weekThree()` fixture: Sunday Oct 25, week 3. P4a's digest test works out its numbers (trend 205.1 and down 0.4, 7 of 7 counted with 4 full, 7,443 steps against 7,000 with Saturday low at 5,900, 2 of 3 planned plus an extra, incline press and pec deck moved up, the shoulder press stuck at 45, waist 35.5 and down 0.25, burn 2,680 settling to week 6, the cut from 2,400 to 2,300), and P4a's take test gives its rule take.

- [ ] **Step 1: Write the failing tests.** Create `tests/unit/ai/take.test.ts`:

```ts
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
```

- [ ] **Step 2: Run them to make sure they fail.**

```bash
npx vitest run --project unit tests/unit/ai/take.test.ts
```

Expected: FAIL, "Cannot find module '~/ai/take'".

- [ ] **Step 3: Implement.** Create `app/ai/take.ts`:

```ts
// Rocky's take, AI-written (spec section 2): the lines the model is given, the check its text must pass, the hash a
// stored take is keyed by, and which take the card shows. Pure: the phone and the Worker both run it.
import type { CheckInDigest } from "~/checkin/digest";
import type { Take } from "~/checkin/take";
import { weekday } from "~/domain/dates";
import type { ISODate } from "~/domain/types";
import { allowedNumbers, strayNumbers } from "./numbers";

export type Voice = "corner" | "plain";
export type TakeCheck = "ok" | "numbers" | "length" | "characters";

export const TAKE_MAX_SENTENCES = 4;
export const TAKE_MAX_CHARS = 420;

const DAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const num = (n: number) => n.toLocaleString("en-US");
const count = (n: number, one: string, many: string) => `${num(n)} ${n === 1 ? one : many}`;
/** Inches, at most two decimals: "0.25", "35.5". */
const inches = (n: number) => String(Math.round(Math.abs(n) * 100) / 100);

function monthDay(d: ISODate): string {
  const [, m, day] = d.split("-").map(Number);
  return `${MONTH_SHORT[m - 1]} ${day}`;
}

/** "Oct 19 to 25", or "Oct 26 to Nov 1" across a month. */
function range(from: ISODate, to: ISODate): string {
  return from.slice(0, 7) === to.slice(0, 7) ? `${monthDay(from)} to ${Number(to.slice(8))}` : `${monthDay(from)} to ${monthDay(to)}`;
}

/** Rocky's pick, as the rules made it. The model may quote it ("I'm trimming 100") but never changes it. */
function callLine(d: CheckInDigest): string {
  const c = d.call;
  if (c.kind === "maintenance") return `The call: maintenance week, ${num(c.maintenanceKcal ?? c.burn)} cal a day`;
  if (c.pick === "steps" && c.steps) {
    const more = c.steps.stepGoal - d.steps.goal;
    return `The call: keep ${num(c.steps.kcal)}, ${more > 0 ? `walk ${num(more)} more, ` : ""}step goal ${num(c.steps.stepGoal)}`;
  }
  const change = c.calories.kcal - c.currentKcal;
  if (change < 0) return `The call: trim ${num(-change)}, from ${num(c.currentKcal)} to ${num(c.calories.kcal)} cal a day from Monday`;
  if (change > 0) return `The call: raise ${num(change)}, from ${num(c.currentKcal)} to ${num(c.calories.kcal)} cal a day from Monday`;
  return `The call: calories hold at ${num(c.calories.kcal)}`;
}

/**
 * The week as short labelled lines (spec section 2, "What the model is given"). A line the digest has no number for is
 * left out. The rule take goes last, so the AI narrates the same win and fix the rules picked.
 */
export function takeLines(d: CheckInDigest, rule: Take): string[] {
  const lines = [`Week ${d.week.number}, ${range(d.week.monday, d.week.sunday)}`, `${d.days.counted} of ${d.days.total} days counted, ${d.days.full} fully on plan`];
  const { trend, change } = d.weight;
  if (trend !== null) {
    const moved = change === null ? "" : Math.abs(change) < 0.05 ? ", steady this week" : `, ${change < 0 ? "down" : "up"} ${Math.abs(change).toFixed(1)} lb this week`;
    lines.push(`Trend weight ${trend.toFixed(1)} lb${moved}`);
  }
  const w = d.waist;
  if (w.now !== null) {
    const moved = w.change === null ? "" : w.change === 0 ? ", no change" : `, ${w.change < 0 ? "down" : "up"} ${inches(w.change)} in`;
    lines.push(`Waist ${inches(w.now)} in${moved}`);
  }
  if (d.protein.avg !== null) lines.push(`Protein averaged ${d.protein.avg} g a day, target ${d.protein.target} g`);
  const low = d.steps.lowDay;
  lines.push(`Steps averaged ${num(d.steps.avg)} a day, goal ${num(d.steps.goal)}${low ? `. Lowest day ${DAY[weekday(low.date)]}, ${num(low.steps)}` : ""}`);
  const l = d.lifts;
  const lifts = [`${count(l.plannedDone + l.extras.length, "session", "sessions")}, ${l.plannedDone} of ${l.planned} planned`];
  if (l.movedUp.length) lifts.push(`${count(l.movedUp.length, "lift", "lifts")} moved up`);
  for (const s of l.stuck) lifts.push(`${s.name} stuck at ${s.top} lb`);
  lines.push(lifts.join(". "));
  const c = d.call;
  lines.push(`Burn estimate ${num(c.burn)} a day${c.state === "settling" && c.steadyBy !== null ? `, settling, steady by week ${c.steadyBy}` : ""}`);
  lines.push(callLine(d), `Written win: ${rule.win}`, `Written fix: ${rule.fix}`, `Written call: ${rule.call}`);
  return lines;
}

/** The take passes only if every rule holds (spec section 2, "The check"). Not retried: a failure shows the rule take. */
export function checkTake(text: string, lines: string[]): TakeCheck {
  if (/[\u2013\u2014]/.test(text) || /\p{Extended_Pictographic}/u.test(text)) return "characters";
  if (/[\r\n]/.test(text) || text.length > TAKE_MAX_CHARS) return "length";
  const sentences = text.trim().split(/(?<=[.!?])\s+/).filter(Boolean);
  if (sentences.length < 1 || sentences.length > TAKE_MAX_SENTENCES) return "length";
  return strayNumbers(text, allowedNumbers(lines)).length ? "numbers" : "ok";
}

/** SHA-256 of the voice and the lines, first 16 hex characters. A new weigh-in or a voice change makes a new one. */
export async function takeHash(lines: string[], voice: Voice): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify([voice, ...lines])));
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
}

export type TakeView = { kind: "ai"; text: string } | { kind: "waiting" } | { kind: "rule" };

export interface TakeState {
  aiOn: boolean;
  /** Whether the server has a key; null until it has answered. */
  available: boolean | null;
  /** The status ask is still out. */
  checking: boolean;
  online: boolean;
  /** The check-in is open, so a missing take may be written now. */
  writable: boolean;
  /** takeHash of the current lines and voice; null for the moment it takes to work out. */
  hash: string | null;
  /** The week's `takes` row. */
  stored: { text: string; hash: string } | null;
  /** A take the server just returned, before the pull brings its row. */
  fresh: { text: string; hash: string } | null;
  /** The hash a take was asked for on this page, and whether the answer is still coming. */
  asked: { hash: string; pending: boolean } | null;
}

const RULE: TakeView = { kind: "rule" };
const WAITING: TakeView = { kind: "waiting" };

/** Which take the card shows, and whether to ask for one now (spec section 2, "When it is written and shown"). */
export function chooseTake(s: TakeState, lines: string[]): { view: TakeView; ask: boolean } {
  if (!s.aiOn || s.available === false) return { view: RULE, ask: false };
  if (s.available === null) return { view: s.checking ? WAITING : RULE, ask: false };
  if (s.hash === null) return { view: WAITING, ask: false };
  const written = [s.fresh, s.stored].find((t) => t?.hash === s.hash);
  // The same hash would only fetch the same stored text, so a written take that fails here is never re-asked.
  if (written) return { view: checkTake(written.text, lines) === "ok" ? { kind: "ai", text: written.text } : RULE, ask: false };
  if (!s.online || !s.writable) return { view: RULE, ask: false };
  if (s.asked?.hash === s.hash) return { view: s.asked.pending ? WAITING : RULE, ask: false };
  return { view: WAITING, ask: true };
}
```

- [ ] **Step 4: Run the tests and typecheck.** Same command as Step 2, then `npm run typecheck`. Expected: PASS, no type errors.

If "writes week three as short labelled lines" fails because the built P4 fixture's numbers differ from P4a's plan (the plans were the contract while P4 was being built), change `WEEK_THREE` to what the digest really holds, check the mock still passes or swap in a take that uses those numbers, and recompute the three hashes:

```bash
node -e 'const { createHash } = require("node:crypto"); const lines = JSON.parse(process.argv[1]); for (const v of ["corner", "plain"]) console.log(v, createHash("sha256").update(JSON.stringify([v, ...lines])).digest("hex").slice(0, 16));' '<WEEK_THREE as a JSON array>'
```

- [ ] **Step 5: Commit.**

```bash
git add app/ai/take.ts tests/unit/ai/take.test.ts
git commit -m "Rocky's take has its lines, its number check, its hash, and a rule for which take shows"
```

---

### Task 3: The take's model call

**Files:**
- Modify: `app/ai/prompts.server.ts`, `app/ai/claude.server.ts`
- Test: `tests/unit/ai/take-call.test.ts`

- [ ] **Step 1: Write the failing test.** Create `tests/unit/ai/take-call.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { anthropicClient } from "~/ai/claude.server";
import { takeSystem } from "~/ai/prompts.server";
import { COACH_NAME } from "~/brand";
import { fakeFetch, message, USAGE } from "./fake-anthropic";

describe("AiClient.take", () => {
  it("asks at medium effort with the voice in the system prompt, and the lines and facts in the message", async () => {
    const { sent, fetch } = fakeFetch(() => message({ content: [{ type: "text", text: " Every day counted. " }] }));
    const lines = ["Week 3, Oct 19 to 25", "Trend weight 205.1 lb, down 0.4 lb this week"];
    expect(await anthropicClient("k", { fetch, maxRetries: 0 }).take({ lines, voice: "plain", facts: ["No squats or lunges."] })).toEqual({ ok: true, value: "Every day counted.", usage: USAGE });
    expect(sent[0].body).toMatchObject({
      max_tokens: 2000,
      output_config: { effort: "medium" },
      system: [{ type: "text", text: takeSystem("plain") }],
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: "The week:\n- Week 3, Oct 19 to 25\n- Trend weight 205.1 lb, down 0.4 lb this week\n\nWhat you know about the person:\n- No squats or lunges." }],
        },
      ],
    });
  });

  it("gives each voice its line and the same rules", () => {
    expect(takeSystem("corner")).toContain("Voice: Straight shooter, a little fight. One boxing image at most.");
    expect(takeSystem("plain")).toContain("Voice: Same advice, no boxing talk.");
    for (const voice of ["corner", "plain"] as const) {
      expect(takeSystem(voice)).toContain(`You are ${COACH_NAME}`);
      expect(takeSystem(voice)).toContain("At most four sentences, in this order: one win, one fix, the call and why, next week's focus.");
      expect(takeSystem(voice)).toContain("Use only numbers that appear in the week's lines, written as digits.");
    }
  });
});
```

- [ ] **Step 2: Run it to make sure it fails.**

```bash
npx vitest run --project unit tests/unit/ai/take-call.test.ts
```

Expected: FAIL, "takeSystem is not exported" or "take is not a function".

- [ ] **Step 3: The prompt.** In `app/ai/prompts.server.ts`, add at the top:

```ts
import { APP_NAME, COACH_NAME } from "~/brand";
import type { Voice } from "./take";
```

and append:

```ts
const VOICE: Record<Voice, string> = {
  corner: "Straight shooter, a little fight. One boxing image at most.",
  plain: "Same advice, no boxing talk.",
};

/** Rocky's take (spec section 2, "What the model is given"). */
export function takeSystem(voice: Voice): string {
  return [
    `You are ${COACH_NAME}, the coach in ${APP_NAME}, a fitness app. Write this week's take for the Sunday check-in, speaking to the person as "you".`,
    `Voice: ${VOICE[voice]}`,
    "Rules:",
    "- At most four sentences, in this order: one win, one fix, the call and why, next week's focus.",
    "- The written win and fix are the points to make. Say them in your own words.",
    "- The call is already made. Say it and why. Never change it.",
    "- Use only numbers that appear in the week's lines, written as digits. Never work out a new number.",
    "- Never blame, never shame. No medical advice.",
    "- No em dashes, no emojis, no lists, no line breaks, and no quotation marks around the call.",
    "- What you know about the person shapes the tone. Never quote a number from it.",
    "- Reply with the take and nothing else.",
  ].join("\n");
}

export function takeUser(lines: string[], facts: string[]): string {
  return ["The week:", ...lines.map((l) => `- ${l}`), "", "What you know about the person:", ...(facts.length ? facts.map((f) => `- ${f}`) : ["- Nothing yet."])].join("\n");
}
```

- [ ] **Step 4: The call.** In `app/ai/claude.server.ts`:

1. Change the prompts import to `import { PROBE_SYSTEM, takeSystem, takeUser } from "./prompts.server";` and add `import type { Voice } from "./take";`.

2. Add above `export interface AiClient`:

```ts
export interface TakeInput {
  lines: string[];
  voice: Voice;
  /** What Rocky knows, oldest first. */
  facts: string[];
}
```

3. Add to `AiClient`:

```ts
  /** Rocky's take: plain text, checked by the route before it is stored. */
  take(input: TakeInput): Promise<AiResult<string>>;
```

4. Add to the object `anthropicClient` returns:

```ts
    // Too small and too rare to cache.
    take: (i) => textCall(client, { system: [{ type: "text", text: takeSystem(i.voice) }], content: [{ type: "text", text: takeUser(i.lines, i.facts) }], effort: "medium", maxTokens: 2000 }),
```

- [ ] **Step 5: Run the tests.**

```bash
npx vitest run --project unit tests/unit/ai/take-call.test.ts tests/unit/ai/claude.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add app/ai/prompts.server.ts app/ai/claude.server.ts tests/unit/ai/take-call.test.ts
git commit -m "The Worker can ask Claude for Rocky's take, in the person's voice, from the week's lines"
```

---

### Task 4: `POST /api/ai/take`

**Files:**
- Modify: `workers/api/ai.ts`, `workers/api/router.ts`
- Test: `tests/workers/api-ai-take.test.ts`

- [ ] **Step 1: Write the failing tests.** Create `tests/workers/api-ai-take.test.ts`:

```ts
import { env } from "cloudflare:test";
import { afterEach, describe, expect, it } from "vitest";
import type { TakeInput } from "~/ai/claude.server";
import { fakeAi, lastCall, seedCalls, setSwitch, withFakeAi, withoutKey } from "./fake-ai";
import { api, CATHERINE, KAMERON, postJson } from "./helpers";

const LINES = ["Week 3, Oct 19 to 25", "Trend weight 205.1 lb, down 0.4 lb this week", "The call: trim 100, from 2,400 to 2,300 cal a day from Monday"];
// takeHash(LINES, voice), worked out with node:crypto.
const CORNER = "c24a4bf682abf6ea";
const PLAIN = "a528a5f3f63943db";
const GOOD = "Trend down 0.4 lb this week. I'm trimming 100, so it's 2,300 from Monday.";
const USAGE = { input: 2500, output: 600, cacheRead: 0 };

const take = (weekStart: string, voice = "corner", as: number = KAMERON) => api("/api/ai/take", postJson({ weekStart, lines: LINES, voice }), as);
const takeRow = (week: string) => env.DB.prepare("SELECT text, hash, voice, writes FROM takes WHERE week_start = ?").bind(week).first();
const writes = (text: string) => async () => ({ ok: true as const, value: text, usage: USAGE });

let restore = () => {};
afterEach(() => restore());

describe("POST /api/ai/take", () => {
  it("is a 401 signed out", async () => {
    expect((await api("/api/ai/take", postJson({ weekStart: "2026-10-19", lines: LINES, voice: "corner" }))).status).toBe(401);
  });

  it("is a 503 with no key, a 403 with the switch off, and a 400 for a bad body, with no model call", async () => {
    restore = withoutKey();
    const noKey = await take("2026-10-19");
    expect(noKey.status).toBe(503);
    expect(await noKey.json()).toEqual({ fallback: "no-key" });
    restore();
    const { client, calls } = fakeAi({});
    restore = withFakeAi(client);
    await setSwitch(env.DB, false);
    const off = await take("2026-10-19");
    expect(off.status).toBe(403);
    expect(await off.json()).toEqual({ fallback: "off" });
    await setSwitch(env.DB, true);
    expect((await api("/api/ai/take", postJson({ weekStart: "2026-10-20", lines: [], voice: "loud" }), KAMERON)).status).toBe(400);
    expect(calls).toEqual([]);
  });

  it("writes the take with What Rocky knows, keeps it for the week, and logs the call", async () => {
    const at = "2026-10-20T15:00:00.000Z";
    await env.DB.prepare(`INSERT INTO facts (client_id, text, dated, created_at, updated_at) VALUES ('f-1', 'No squats or lunges.', 0, '${at}', '${at}')`).run();
    const seen: TakeInput[] = [];
    const { client, calls } = fakeAi({
      take: async (input: TakeInput) => {
        seen.push(input);
        return { ok: true, value: GOOD, usage: USAGE };
      },
    });
    restore = withFakeAi(client);

    expect(await (await take("2026-10-19")).json()).toEqual({ text: GOOD });
    expect(seen).toEqual([{ lines: LINES, voice: "corner", facts: ["No squats or lunges."] }]);
    expect(await takeRow("2026-10-19")).toEqual({ text: GOOD, hash: CORNER, voice: "corner", writes: 1 });
    expect(await lastCall(env.DB)).toEqual({ kind: "take", ok: 1, reason: null, input_tokens: 2500, output_tokens: 600, cache_read_tokens: 0 });

    // A reload with the same lines and voice reads the stored take, with no model call.
    expect(await (await take("2026-10-19")).json()).toEqual({ text: GOOD });
    expect(calls).toEqual(["take"]);
  });

  it("writes again for a new voice, up to 3 writes a week", async () => {
    const { client, calls } = fakeAi({ take: writes(GOOD) });
    restore = withFakeAi(client);
    await take("2026-10-12", "corner");
    await take("2026-10-12", "plain");
    expect(await takeRow("2026-10-12")).toEqual({ text: GOOD, hash: PLAIN, voice: "plain", writes: 2 });
    await take("2026-10-12", "corner");
    const fourth = await take("2026-10-12", "plain");
    expect(fourth.status).toBe(429);
    expect(await fourth.json()).toEqual({ fallback: "cap" });
    expect(await takeRow("2026-10-12")).toEqual({ text: GOOD, hash: CORNER, voice: "corner", writes: 3 });
    expect(calls).toEqual(["take", "take", "take"]);
  });

  it("stores nothing for a take with a number not in the lines, and logs why", async () => {
    const { client } = fakeAi({ take: writes("Trend down 0.4 lb. I'm trimming 150 from Monday.") });
    restore = withFakeAi(client);
    expect(await (await take("2026-10-05")).json()).toEqual({ text: null });
    expect(await takeRow("2026-10-05")).toBeNull();
    expect(await lastCall(env.DB)).toEqual({ kind: "take", ok: 0, reason: "numbers", input_tokens: 2500, output_tokens: 600, cache_read_tokens: 0 });
  });

  it("falls back when the model fails, and logs the reason", async () => {
    const { client } = fakeAi({ take: async () => ({ ok: false, reason: "refusal", usage: null }) });
    restore = withFakeAi(client);
    expect(await (await take("2026-09-28")).json()).toEqual({ text: null });
    expect(await lastCall(env.DB)).toEqual({ kind: "take", ok: 0, reason: "refusal", input_tokens: 0, output_tokens: 0, cache_read_tokens: 0 });
  });

  it("is a 429 past 6 take calls in a day", async () => {
    const { client, calls } = fakeAi({ take: writes(GOOD) });
    restore = withFakeAi(client);
    await seedCalls(env.DB_CATHERINE, "take", 6);
    const res = await take("2026-10-19", "corner", CATHERINE);
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ fallback: "cap" });
    expect(calls).toEqual([]);
  });
});
```

- [ ] **Step 2: Run them to make sure they fail.**

```bash
npx vitest run --project workers tests/workers/api-ai-take.test.ts
```

Expected: FAIL. `/api/ai/take` gets the router's JSON 404.

- [ ] **Step 3: The route.** In `workers/api/ai.ts`:

1. Add to the imports:

```ts
import { z } from "zod";
import { checkTake, takeHash } from "~/ai/take";
import { isISODate, weekday } from "~/domain/dates";
```

2. Append:

```ts
/** What Rocky knows, oldest first, for a prompt. */
export async function factTexts(d1: D1Database): Promise<string[]> {
  return (await d1.prepare("SELECT text FROM facts ORDER BY created_at, client_id").all<{ text: string }>()).results.map((f) => f.text);
}

const TAKE_WRITES_PER_WEEK = 3;

const TakeBody = z.object({
  weekStart: z.string().refine((d) => isISODate(d) && weekday(d) === 1, "Not a Monday"),
  lines: z.array(z.string().min(1).max(300)).min(1).max(16),
  voice: z.enum(["corner", "plain"]),
});

/**
 * Rocky's take for a week (spec section 2). The same lines and voice read the stored take with no model call. A new
 * take is checked before it is stored; sync carries the row to the phones.
 */
export async function aiTake(request: Request): Promise<Response> {
  const call = await aiGate();
  if (call instanceof Response) return call;
  const body = TakeBody.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Bad take" }, { status: 400 });
  const { weekStart, lines, voice } = body.data;
  const hash = await takeHash(lines, voice);
  const stored = await call.d1.prepare("SELECT text, hash, writes FROM takes WHERE week_start = ?").bind(weekStart).first<{ text: string; hash: string; writes: number }>();
  if (stored?.hash === hash) return Response.json({ text: stored.text }, { headers: NO_STORE });
  if ((stored?.writes ?? 0) >= TAKE_WRITES_PER_WEEK || (await overCap(call, "take"))) return fallback("cap");

  const result = await call.ai.take({ lines, voice, facts: await factTexts(call.d1) });
  const check = result.ok ? checkTake(result.value, lines) : "ok";
  const refused = check === "ok" ? null : check;
  await logged(call, "take", result, refused);
  if (!result.ok || refused) return Response.json({ text: null }, { headers: NO_STORE });

  await call.d1
    .prepare(
      "INSERT INTO takes (week_start, text, hash, voice, writes, written_at) VALUES (?, ?, ?, ?, 1, ?) " +
        "ON CONFLICT (week_start) DO UPDATE SET text = excluded.text, hash = excluded.hash, voice = excluded.voice, writes = takes.writes + 1, written_at = excluded.written_at",
    )
    .bind(weekStart, result.value, hash, voice, call.now.toISOString())
    .run();
  return Response.json({ text: result.value }, { headers: NO_STORE });
}
```

3. In `workers/api/router.ts`, add `aiTake` to the `./ai` import and append to `ROUTES`:

```ts
  { method: "POST", path: /^\/api\/ai\/take$/, run: aiTake },
```

- [ ] **Step 4: Run the tests.** Same command as Step 2, plus `tests/workers/api-ai.test.ts`. Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add workers/api/ai.ts workers/api/router.ts tests/workers/api-ai-take.test.ts
git commit -m "POST /api/ai/take writes Rocky's take once per week state, checks its numbers, and stores it"
```

---

### Task 5: The phone asks for a take and picks what the card shows

**Files:**
- Create: `app/ai/use-take.ts`

The rules are `chooseTake`, tested in Task 2. The hook only wires them to the store, the network and the clock; it is checked by `npm run typecheck` and by eye in Task 6.

- [ ] **Step 1: Implement.** Create `app/ai/use-take.ts`:

```ts
import { useEffect, useMemo, useState } from "react";
import type { CheckInDigest } from "~/checkin/digest";
import type { Take } from "~/checkin/take";
import type { ISODate } from "~/domain/types";
import { voiceOf } from "~/settings/model";
import { useSyncClient, useTable } from "~/sync/react";
import { postAi } from "./client";
import { chooseTake, takeHash, takeLines, type TakeView } from "./take";
import { useAi } from "./use-ai";

/** The phone waits this long for a new take, then shows the rule take. */
export const TAKE_WAIT_MS = 10_000;

/**
 * Rocky's take for the check-in card: the stored AI take when it matches the week, a new one asked for once while the
 * check-in is open, or the rule take (spec section 2, "When it is written and shown").
 */
export function useTake({ week, digest, rule, writable }: { week: ISODate; digest: CheckInDigest; rule: Take; writable: boolean }): TakeView {
  const ai = useAi();
  const client = useSyncClient();
  const voice = voiceOf(useTable("profile"));
  const row = useTable("takes").find((r) => r.week_start === week);
  const lines = useMemo(() => takeLines(digest, rule), [digest, rule]);
  // The model is rebuilt on every store change; the key only moves when the lines or the voice really do.
  const key = JSON.stringify([voice, ...lines]);

  const [hashed, setHashed] = useState<{ key: string; hash: string } | null>(null);
  useEffect(() => {
    let live = true;
    void takeHash(lines, voice).then((hash) => {
      if (live) setHashed({ key, hash });
    });
    return () => {
      live = false;
    };
  }, [key]);
  const hash = hashed?.key === key ? hashed.hash : null;

  const [fresh, setFresh] = useState<{ text: string; hash: string } | null>(null);
  const [asked, setAsked] = useState<{ hash: string; pending: boolean } | null>(null);
  const stored = row ? { text: String(row.text), hash: String(row.hash) } : null;
  const { view, ask } = chooseTake({ aiOn: ai.on, available: ai.available, checking: ai.checking, online: ai.online, writable, hash, stored, fresh, asked }, lines);

  useEffect(() => {
    if (!ask || !hash) return;
    setAsked({ hash, pending: true });
    void postAi<{ text: string | null }>("/api/ai/take", { weekStart: week, lines, voice }, TAKE_WAIT_MS).then((reply) => {
      if (reply?.text) {
        setFresh({ text: reply.text, hash });
        // The Worker stored the row; pull it so a reload reads it at once.
        void client?.sync();
      }
      setAsked({ hash, pending: false });
    });
  }, [ask, hash]);

  return view;
}
```

- [ ] **Step 2: Typecheck.**

```bash
npm run typecheck
rg -n 'cloudflare:workers|@anthropic-ai/sdk|\.server"' app/ai/use-take.ts app/ai/take.ts app/ai/numbers.ts
```

Expected: no type errors, and the `rg` prints nothing.

- [ ] **Step 3: Commit.**

```bash
git add app/ai/use-take.ts
git commit -m "The phone asks for Rocky's take once per week state and falls back to the rules on time"
```

---

### Task 6: The take on the check-in card

**Files:**
- Modify: `app/checkin/model.ts`, `app/ui/RockyCard.tsx`, `app/checkin/CheckInScreen.tsx`
- Create: `app/checkin/TakeCard.tsx`
- Test: `tests/unit/checkin/model.test.ts`

- [ ] **Step 1: Write the failing test.** In `tests/unit/checkin/model.test.ts`, add `import { ruleTake } from "~/checkin/take";` and add inside `describe("buildCheckIn: the window is open")`:

```ts
  it("hands the card the digest its rule take was written from", () => {
    const m = buildCheckIn(rows, SUNDAY_6PM, null);
    expect(m.digest!.week.monday).toBe("2026-10-19");
    expect(ruleTake(m.digest!)).toEqual(m.take);
    expect(buildCheckIn(rows, new Date("2026-10-28T10:00:00-05:00"), null).digest).toBeNull();
  });
```

- [ ] **Step 2: Run it to make sure it fails.**

```bash
npx vitest run --project unit tests/unit/checkin/model.test.ts
```

Expected: FAIL, `m.digest` is undefined.

- [ ] **Step 3: The model hands over the digest.** In `app/checkin/model.ts`:

1. In `CheckInModel`, add after `take: Take | null;`:

```ts
  /** The digest `take` was written from, so project 5's AI take narrates the same week. Null before the window. */
  digest: CheckInDigest | null;
```

2. In the `if (early)` return, add `digest: null,` after `take: null,`.

3. Replace:

```ts
  const take = ruleTake(readOnly && kept?.call ? { ...digest, call: { ...digest.call, ...kept.call } } : digest);
```

with:

```ts
  const takeDigest = readOnly && kept?.call ? { ...digest, call: { ...digest.call, ...kept.call } } : digest;
  const take = ruleTake(takeDigest);
```

4. In the final return, add `digest: takeDigest,` after `take,`.

- [ ] **Step 4: Run the test.** Same command as Step 2. Expected: PASS, the earlier model tests too.

- [ ] **Step 5: `RockyCard`'s prose and placeholder.** Replace `app/ui/RockyCard.tsx` with:

```tsx
import type { ReactNode } from "react";
import { COACH_NAME } from "~/brand";

const BAR = "block h-3.5 rounded-[3px] bg-on-ink-2/30";

/**
 * The dark card in Rocky's voice. With `rows`, each row is a bold label (WIN, FIX, CALL) and a line. `prose` is the
 * AI-written take (option 5A: the same card, no label saying who wrote it). `placeholder` holds its place while it is
 * written: three static bars, nothing animated.
 */
export function RockyCard({
  label,
  children,
  rows,
  prose,
  placeholder,
}: {
  label: string;
  children?: ReactNode;
  rows?: { label: string; text: string }[];
  prose?: string;
  placeholder?: boolean;
}) {
  return (
    <section aria-label={COACH_NAME} aria-busy={placeholder || undefined} className="flex flex-col gap-2 rounded-[6px] bg-ink px-[18px] pb-5 pt-[18px] text-paper">
      <h2 className="font-num text-[14px] font-bold uppercase tracking-[0.06em] text-coral">{label}</h2>
      {placeholder ? (
        <div aria-hidden="true" className="flex flex-col gap-2.5 py-1.5">
          <span className={`${BAR} w-full`} />
          <span className={`${BAR} w-[92%]`} />
          <span className={`${BAR} w-[64%]`} />
        </div>
      ) : prose !== undefined ? (
        <p className="text-[18px] font-medium leading-[1.45]">{prose}</p>
      ) : rows ? (
        <dl className="flex flex-col gap-2.5">
          {rows.map((r) => (
            <div key={r.label} className="grid grid-cols-[40px_minmax(0,1fr)] gap-2">
              <dt className="pt-[3px] font-num text-[14px] font-bold uppercase tracking-[0.06em] text-on-ink-2">{r.label}</dt>
              <dd className="text-[17px] font-medium leading-[1.4]">{r.text}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-[19px] font-medium leading-[1.4]">{children}</p>
      )}
    </section>
  );
}
```

- [ ] **Step 6: The card.** Create `app/checkin/TakeCard.tsx`:

```tsx
import { useTake } from "~/ai/use-take";
import { COACH_NAME } from "~/brand";
import type { ISODate } from "~/domain/types";
import { RockyCard } from "~/ui/RockyCard";
import type { CheckInDigest } from "./digest";
import type { Take } from "./take";

/** ROCKY'S TAKE: the AI paragraph when there is a good one, bars while it's written, else the rule take's rows. */
export function TakeCard({ week, digest, rule, writable }: { week: ISODate; digest: CheckInDigest; rule: Take; writable: boolean }) {
  const take = useTake({ week, digest, rule, writable });
  const label = `${COACH_NAME}'s take`;
  if (take.kind === "ai") return <RockyCard label={label} prose={take.text} />;
  if (take.kind === "waiting") return <RockyCard label={label} placeholder />;
  return (
    <RockyCard
      label={label}
      rows={[
        { label: "Win", text: rule.win },
        { label: "Fix", text: rule.fix },
        { label: "Call", text: rule.call },
      ]}
    />
  );
}
```

- [ ] **Step 7: The page uses it.** In `app/checkin/CheckInScreen.tsx`:

1. Replace `import { RockyCard } from "~/ui/RockyCard";` with `import { TakeCard } from "./TakeCard";`.

2. Replace:

```tsx
      {m.take && (
        <RockyCard
          label={`${COACH_NAME}'s take`}
          rows={[
            { label: "Win", text: m.take.win },
            { label: "Fix", text: m.take.fix },
            { label: "Call", text: m.take.call },
          ]}
        />
      )}
```

with:

```tsx
      {m.take && m.digest && <TakeCard week={m.monday} digest={m.digest} rule={m.take} writable={m.phase === "open"} />}
```

3. If `COACH_NAME` is now unused in the file, remove it from the `~/brand` import.

- [ ] **Step 8: Typecheck.** `npm run typecheck`. Expected: no type errors. Today still passes `children` to `RockyCard` and keeps working.

- [ ] **Step 9: Look.** `npm run dev`, signed in locally as Kameron as F4a's Task 11 did, at 390 × 844 beside `CheckInWeek`:
1. With no key in `.dev.vars`, open `/check-in?now=2026-10-25T18:00:00-05:00` (P4b's dev clock pin). The card reads ROCKY'S TAKE with the WIN, FIX and CALL rows, as before P5b. In DevTools Network there is one `GET /api/ai/status` (answer `{"available":false}`) and no `/api/ai/take`.
2. Turn the AI switch off in Settings and reopen: the same rows, and no AI request at all.
3. **Only if Kameron agrees to a local call on his key** (about a cent): add `ANTHROPIC_API_KEY` to `.dev.vars`, restart `npm run dev`, and reopen the pinned check-in. The card shows three static bars, then one paragraph at 18 / 1.45 in paper on ink, as `CheckInWeek` draws it. Reload: the paragraph shows at once, with no `/api/ai/take` request. Remove the key from `.dev.vars` afterwards if Kameron prefers local dev on the rules.

- [ ] **Step 10: Commit.**

```bash
git add app/checkin/model.ts app/ui/RockyCard.tsx app/checkin/TakeCard.tsx app/checkin/CheckInScreen.tsx tests/unit/checkin/model.test.ts
git commit -m "The check-in's take card shows Rocky's AI take when it's good, and the rule take otherwise"
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
for c in $(curl -s "https://kampduh.com$M" | grep -o '/assets/[A-Za-z0-9_-]*\.js' | sort -u); do n=$(curl -s "https://kampduh.com$c" | grep -c '/api/ai/take'); [ "$n" -gt 0 ] && echo "$c $n"; done
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://kampduh.com/api/ai/take
```

Expected: a manifest path, at least one chunk with a count of 1 or more (the check-in's), and `401`.

- [ ] **Step 5: One real call through the deployed status route.** If the key is set (P5a Task 10 Step 6), Kameron opens `https://kampduh.com/api/ai/status?probe=1` signed in, in his desktop browser. Expected: `{"available":true,"probe":{"ok":true,"reason":null}}`. If the key isn't set yet, say so in the report; nothing in P5b needs it.

- [ ] **Step 6: Report.** One or two sentences to Kameron: Rocky's take is live behind the AI switch (the rule take shows until the key is set), and P5c (Tell Rocky) is next. Mention that his next Sunday check-in will write the first stored take, which he can see with:

```bash
! npx wrangler d1 execute rocky-db --remote --command "select week_start, length(text) as chars, writes from takes; select kind, ok, reason, input_tokens, output_tokens from ai_calls where kind = 'take' order by id desc limit 5"
```

---

## Self-review

- **Spec coverage (rollout step 2):** `takeLines` with every line in the spec's table and the rule take (Task 2); `checkTake` (numbers by value, words, "one" ignored, 1 to 4 sentences, 420 characters, no line breaks, no dashes or emoji) (Tasks 1, 2); `takeHash` (Task 2); the prompt's voice, What Rocky knows and rules (Task 3); `/api/ai/take` with the stored read, 3 writes a week, the check before storing, `ai_calls`, and 401/503/403/429 (Task 4); `useTake`: the AI take only with the switch on, a key, and a matching stored take that passes on the phone, bars for up to 10 seconds, the rule take on a fallback, timeout or failed check, a reload reading the stored take, a pull after a new one (Tasks 2, 5); the card's paragraph at 18 / 1.45 and the rule rows otherwise (Task 6).
- **Testing section items this step owns:** Numbers; `checkTake` (the mock passes; a stray number, five sentences, past 420, an em dash and an emoji fail; a What Rocky knows number fails); `takeLines` (each call kind, a missing waist, the hash changing with the voice and a number); `/api/ai/take` with a fake client (stores and returns, the same hash reads without calling, a new hash rewrites, the fourth write refused, a stray number stores nothing and logs `numbers`); `useTake`'s choice for each case.
