# P4b: The One-Page Check-in Implementation Plan

> **For agentic workers:** implement this plan task-by-task with the `executing-plans` skill. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Starts from N3's and P4a's merged result.** Cut the build branch from `main` after `v2/p4a-checkin-data` has merged (P4a itself starts from N3). This plan builds on N3's `app/checkin/call.ts` (`callView`, `scaleChanges`, `changedFoods`, `CallPick`, `CallView`) and `app/checkin/CallBlock.tsx`, and on P4a's `weekCall`, `buildDigest`, `ruleTake`, `previewNextWeek`, `groceryCount`, the fixture `tests/unit/checkin/fixture.ts`, and the `finishCheckIn` and `logWaist` named changes. **No migration.**

**Goal:** The Sunday check-in becomes one scrolling page on the phone's copy, in the mock's order:
- **The week:** the poster, the trend chart, the 2 × 2 numbers with the waist field, Rocky's take (Win, Fix, Call), and the three taps.
- **The call:** N3's block, fed by `weekCall` with the live hunger tap.
- **Next week:** the brass MOVED UP card, an ink-outlined card per stuck lift with Hold or Drop, the rest switches for meals eaten 3 times or more, "Back from rest next week:", and the grocery link carrying `kcal` and `rest`.
- **The dock:** "FINISH CHECK-IN" runs `finishCheckIn`, and the page turns finished in the same frame. Until Monday 3am, "Change my answers" reopens it. Before the window, the dock says "Opens Sunday at 5pm."
- **v1 goes:** the check-in loader and action, `DaySheet`, `checkInData` and `completeCheckIn`.

**Architecture:**
- **Loaderless,** like Today and the meal screen. `app/checkin/model.ts` builds everything from the store, as `app/meal/model.ts` does, and the route only holds the page's choices until Finish.
- **The page's choices** (taps, pick, rest switches, lift plans) live in React state. Only the waist saves on its own, through `logWaist`. Finish carries the choices; `finishCheckIn` works every number out again.
- **A finished week reads its saved state** from `check_ins`: the taps from their columns, and the pick, rests, lift plans and call from `outcome`.
- **Shared kit in `app/ui/`:** `StatGrid`, `TrendChart`, `LinkCard`, `TapGrid`, `ChoicePair`, and `RockyCard`'s `rows` form. P4c and P4d reuse them as written here.

**Tech Stack:** React Router 8.4 (framework mode, SSR on, this route loaderless), the F2 sync layer, Tailwind 4 with the Corner tokens, Vitest 4 (unit project for pure modules, workers project for D1).

**Spec:** `docs/superpowers/specs/2026-10-28-checkin-plan-progress-library-design.md` (section 3 "Shared kit" and "Check-in", section 5, rollout step 2, Testing). **P4a plan:** `docs/superpowers/plans/2026-10-28-p4a-checkin-data.md`. **N3 plan:** `docs/superpowers/plans/2026-10-28-n3-engine-call.md`. **Build branch:** `v2/p4b-checkin-page`, from `main` after P4a merges. This plan is committed on `v2/p4-checkin-plan-progress-library`.

**Mocks:**
- Artboards `CheckInWeek`, `CheckInCall` and `CheckInNext` on https://claude.ai/artifact/65WeReuGH5ZageJng9K6nq.
- The option board https://claude.ai/artifact/Ke3qgxSC3uQFwGKCJpsKSU. Picked: 1A (one page), 2A (rule-written take with WIN, FIX, CALL rows), 3A (the stuck card), 4A (rests only, no swaps).
- **Design system:** `docs/design/system.md`. Where it and a mock disagree on looks, the mock wins, except the colour rules. Where a mock's numbers differ from real data, real data wins (week 3's take, for example, is the rules' text, not the mock's prose).

## Calls made in this plan (flag them in the PR)

- **"was 35.75" sits inside the waist field,** at its right, as `CheckInWeek` draws it. The spec's table calls it a subline. Before the window the cell shows the latest entry read-only with "last measured Oct 25" in the same place.
- **The poster's second line when the trend exists but last Sunday's doesn't** reads "Trend 205.3." (the spec gives "Down", "Up", "Steady." and "No trend yet.").
- **The Lifts cell before the window** counts only past days as missed, and reads "1 of 3 planned" when none are missed yet.
- **A finished page is read-only** through a disabled `fieldset` around the taps, the call's radios, the stuck cards and the rest switches. The grocery link still works.
- **The finished page shows the saved call** (`outcome.call`), so it shows what Finish wrote even if a weigh-in arrives later. An N3-era row has no `call` in its outcome; then the call is worked out again, as N3 did.
- **"Change my answers"** is a quiet link under the red button in the dock.
- **The page's choices belong to one week.** If the window opens or closes while the page is open, choices made for the other week are dropped.
- **After Finish, the grocery count reads next week's written plan,** not the preview.
- **The rest switch is the system's 50 × 30 `Toggle`;** the mock draws 56 × 32. **Section heads on this page** use `SectionHead` (Anton 28); the mock draws 26. **"NEXT WEEK."** is Anton 44 with the 2 px rule, as the mock and spec say.
- **The choice pair is 52 px tall,** as `CheckInNext` draws it. The system says 64 with a subline.
- **The labels under the chart** ("Oct 5 · 205.9", "This week", "Trend 205.1") are the check-in's own row, not a `TrendChart` prop, so Progress can label its chart its own way.
- **One new token, `brass-rule` #E3D3AE,** for the dividers inside the MOVED UP card, measured from `CheckInNext`. It is added to `docs/design/system.md`.
- **A dev-only clock pin.** Under `npm run dev`, `/check-in?now=2026-10-25T18:00:00-05:00` pins the page's clock, so the Sunday window can be looked at any day. `import.meta.env.DEV` compiles it away in production. Finish isn't tried while pinned: the phone judges `at` against its real clock and refuses it.
- **Button labels are sentence case in the code** and uppercased by the button class, as every screen does. The wire check greps without case.
- **Kept on the server until P4c:** `mealRepeats` and `rotationMeals` in `checkin.server.ts` (v1 groceries reads them). `checkInDone` and `checkInWindow` stay for the reminders and Today's server reads.

---

## Conventions

- Everything from the earlier plans applies:
    - No em dashes in code, copy, comments, commits or docs.
    - No `Co-Authored-By` lines, no emojis.
    - One commit per task, staged by path. Never `git commit -a`.
    - Commit messages are a plain sentence describing the behaviour, as in `git log`.
    - Look with `npm run dev`, never `npm run build`.
    - No full-suite runs inside tasks. During a task, run only the files its steps name, plus `npm run typecheck` where a step says so. One `npm run typecheck && npm test` in Task 5, before the PR.
    - Token colours only. Red only for the primary action and live state.
    - Kameron reviews and merges. The build session does not merge.
- **Names come from `app/brand.ts`.** Copy that names the coach uses `COACH_NAME`, and tests build those strings with it.
- `app/checkin/*` and `app/ui/*` must not import `cloudflare:workers` or any `*.server.ts`.
- **Kit components are presentational, and the repo has no DOM test environment.** They are checked by a token test, `npm run typecheck`, and by eye in Task 4. Every rule and every string the page shows comes from `app/checkin/model.ts`, which is tested first.
- **Kit contracts other steps use** (P4c's Plan and Groceries, P4d's Progress, All lifts and Library). The props match how the P4c and P4d plans call them, so those plans find these as they expect. P4d replaces `TrendChart` with a superset (goal band, pace line, `yScale`), so the check-in's call `<TrendChart points label marker />` keeps compiling, and it moves `tests/unit/weight-chart.test.ts` to `tests/unit/ui/trend-chart.test.ts`: this plan creates no file at that path.

```ts
// app/ui/StatGrid.tsx
export interface Stat { label?: string; value: ReactNode; sub?: ReactNode; labelFor?: string }
export function StatGrid(props: { label: string; cells: Stat[]; columns: 2 | 3; ruled?: boolean }): JSX.Element;
// app/ui/TrendChart.tsx
export interface TrendPoint { date: ISODate; weight: number | null; trend: number | null }
export function TrendChart(props: { points: TrendPoint[]; label: string; marker?: ISODate | null }): JSX.Element;
// app/ui/LinkCard.tsx (icon is a name in app/components/ui.tsx's PATHS; this plan adds "cart")
export function LinkCard(props: { to: string; icon: string; title: string; sub: string }): JSX.Element;
// app/ui/TapGrid.tsx
export interface TapRow { label: string; choices: { value: string; label: string }[]; value: string | null; onPick: (value: string | null) => void }
export function TapGrid(props: { rows: TapRow[] }): JSX.Element;
// app/ui/ChoicePair.tsx
export interface PairOption<T extends string> { value: T; title: string; sub?: string }
export function ChoicePair<T extends string>(props: { label: string; options: [PairOption<T>, PairOption<T>]; value: T; onPick: (value: T) => void }): JSX.Element;
// app/ui/RockyCard.tsx: `rows` replaces the body when given
export function RockyCard(props: { label: string; children?: ReactNode; rows?: { label: string; text: string }[] }): JSX.Element;
```

- Unit test dates use Chicago daylight time (`-05:00`) and stay before November 1, 2026.

## Files

| File | Responsibility |
|---|---|
| `app/styles/tokens.css`, `app/app.css`, `docs/design/system.md` | The `brass-rule` token |
| `app/ui/StatGrid.tsx`, `app/ui/LinkCard.tsx`, `app/ui/TapGrid.tsx`, `app/ui/ChoicePair.tsx`, `app/ui/TrendChart.tsx` (new) | Shared kit |
| `app/ui/RockyCard.tsx` | The `rows` form |
| `app/components/ui.tsx` | The `cart` icon |
| `app/checkin/model.ts` (new) | `buildCheckIn`: phase, poster, chart, numbers, take, call, next week, dock, Finish's args |
| `app/checkin/WaistField.tsx`, `app/checkin/NextWeek.tsx`, `app/checkin/CheckInScreen.tsx` (new) | The page |
| `app/routes/check-in.tsx` | Full rewrite: no loader or action |
| `app/server/checkin.server.ts` | `checkInData`, `completeCheckIn` and their types removed |
| `tests/workers/checkin-engine.test.ts` | Deleted (P4a's `tests/unit/checkin/engine.test.ts` covers N3's example) |
| `tests/workers/checkin.test.ts` | Only the window test stays |
| `tests/workers/checkin-route.test.ts` → `tests/workers/groceries-route.test.ts` | The check-in route tests go; the groceries ones stay |

---

### Task 1: The shared kit

**Files:**
- Modify: `app/styles/tokens.css`, `app/app.css`, `docs/design/system.md`, `app/components/ui.tsx`, `app/ui/RockyCard.tsx`
- Create: `app/ui/StatGrid.tsx`, `app/ui/LinkCard.tsx`, `app/ui/TapGrid.tsx`, `app/ui/ChoicePair.tsx`, `app/ui/TrendChart.tsx`
- Test: `tests/unit/tokens.test.ts`

- [ ] **Step 1: Write the failing test.** In `tests/unit/tokens.test.ts`, add inside `describe("Corner revised tokens")`:

```ts
  it("has a rule for rows inside the brass card, and ink reads on brass", () => {
    expect(hex("brass-rule")).toBe("#e3d3ae");
    expect(contrast("ink", "brass-fill")).toBeGreaterThanOrEqual(4.5);
  });
```

- [ ] **Step 2: Run it to make sure it fails.**

```bash
npx vitest run --project unit tests/unit/tokens.test.ts
```

Expected: FAIL, "--brass-rule is not declared".

- [ ] **Step 3: The token.**

1. In `app/styles/tokens.css`, add after `--brass-fill: #f8f1e1;`:

```css
  /* Row dividers inside the brass MOVED UP card. Never text. */
  --brass-rule: #e3d3ae;
```

2. In `app/app.css`, add after `--color-brass-fill: var(--brass-fill);`:

```css
  --color-brass-rule: var(--brass-rule);
```

3. In `docs/design/system.md`, add a row to the colour table after the `brass-border` / `brass-fill` row:

```md
| `brass-rule` | #E3D3AE | 1 px dividers between rows inside a brass card (the check-in's MOVED UP card) |
```

- [ ] **Step 4: Run the test.** Same command as Step 2. Expected: PASS.

- [ ] **Step 5: `StatGrid`.** Create `app/ui/StatGrid.tsx`:

```tsx
import type { ReactNode } from "react";

export interface Stat {
  /** Left out for a cell under a section head that already names it. */
  label?: string;
  value: ReactNode;
  sub?: ReactNode;
  /** When the value is a field, the label names it. */
  labelFor?: string;
}

/**
 * The ruled grid of label, big number and subline: the check-in's 2 × 2, Plan's targets, Progress's pairs and row.
 * `ruled` draws the 2 px ink rule on top, for a grid with no section head over it.
 */
export function StatGrid({ label, cells, columns, ruled = true }: { label: string; cells: Stat[]; columns: 2 | 3; ruled?: boolean }) {
  return (
    <section aria-label={label} className={`grid ${ruled ? "border-t-2 border-t-ink" : ""}`} style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
      {cells.map((c, i) => {
        const col = i % columns;
        const last = col === columns - 1;
        return (
          <div key={i} className={`flex min-w-0 flex-col gap-0.5 border-b border-b-rule pb-3.5 pt-3 ${col === 0 ? "pr-3" : last ? "pl-3.5" : "px-3"} ${last ? "" : "border-r border-r-rule"}`}>
            {c.label &&
              (c.labelFor ? (
                <label htmlFor={c.labelFor} className="text-[14px] font-semibold text-ink-3">
                  {c.label}
                </label>
              ) : (
                <span className="text-[14px] font-semibold text-ink-3">{c.label}</span>
              ))}
            <div className="tabular font-num text-[32px] font-bold leading-[1.05]">{c.value}</div>
            {c.sub && <span className="text-[14px] text-ink-3">{c.sub}</span>}
          </div>
        );
      })}
    </section>
  );
}
```

- [ ] **Step 6: The cart icon and `LinkCard`.** In `app/components/ui.tsx`, add this entry to `PATHS`, after `camera` (the path is the mock's):

```tsx
  cart: (
    <>
      <path d="M3 4h2l2.4 11h11l2-8H6.3" />
      <circle cx="9" cy="19.5" r="1.5" />
      <circle cx="17" cy="19.5" r="1.5" />
    </>
  ),
```

Then create `app/ui/LinkCard.tsx`:

```tsx
import { Link } from "react-router";
import { Icon } from "~/components/ui";

/** A 1.5 px ink outline card that goes somewhere: an icon, a title, a subline and a chevron. Groceries on Plan and the check-in. */
export function LinkCard({ to, icon, title, sub }: { to: string; icon: string; title: string; sub: string }) {
  return (
    <Link to={to} className="flex min-h-16 items-center gap-3 rounded-[6px] border-[1.5px] border-ink px-3.5 text-ink no-underline">
      <span aria-hidden="true" className="flex-none">
        <Icon name={icon} size={22} strokeWidth={2} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[17px] font-bold">{title}</span>
        <span className="text-[14px] text-ink-3">{sub}</span>
      </span>
      <span aria-hidden="true" className="flex-none text-ink-3">
        <Icon name="chevron" size={16} strokeWidth={2.4} />
      </span>
    </Link>
  );
}
```

- [ ] **Step 7: `TapGrid`.** Create `app/ui/TapGrid.tsx`:

```tsx
export interface TapRow {
  label: string;
  choices: { value: string; label: string }[];
  value: string | null;
  onPick: (value: string | null) => void;
}

/** A label and three choices per row. The chosen one is ink; tapping it again clears it. */
export function TapGrid({ rows }: { rows: TapRow[] }) {
  return (
    <div className="flex flex-col gap-2">
      {rows.map((r) => (
        <div key={r.label} role="group" aria-label={r.label} className="grid grid-cols-[70px_repeat(3,minmax(0,1fr))] items-center gap-2">
          <span className="text-[16px] font-semibold">{r.label}</span>
          {r.choices.map((c) => {
            const on = c.value === r.value;
            return (
              <button
                key={c.value}
                type="button"
                aria-pressed={on}
                onClick={() => r.onPick(on ? null : c.value)}
                className={`h-11 rounded-[6px] border-[1.5px] font-num text-[15px] font-bold ${on ? "border-ink bg-ink text-paper" : "border-border text-ink"}`}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 8: `ChoicePair`.** Create `app/ui/ChoicePair.tsx`:

```tsx
export interface PairOption<T extends string> {
  value: T;
  title: string;
  sub?: string;
}

/** The system's choice pair: two side by side, the picked one ink with paper text. */
export function ChoicePair<T extends string>({ label, options, value, onPick }: { label: string; options: [PairOption<T>, PairOption<T>]; value: T; onPick: (value: T) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-2 gap-2">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onPick(o.value)}
            className={`flex min-h-[52px] flex-col items-center justify-center rounded-[6px] px-2 py-1.5 text-center font-num text-[15px] font-bold leading-[1.2] ${on ? "border-2 border-ink bg-ink text-paper" : "border-[1.5px] border-border text-ink"}`}
          >
            {o.title}
            {o.sub && <span className={`text-[13px] font-semibold ${on ? "text-on-ink-2" : "text-ink-3"}`}>{o.sub}</span>}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 9: `RockyCard` rows.** Replace `app/ui/RockyCard.tsx` with:

```tsx
import type { ReactNode } from "react";
import { COACH_NAME } from "~/brand";

/** The dark card in Rocky's voice. With `rows`, each row is a bold label (WIN, FIX, CALL) and a line. */
export function RockyCard({ label, children, rows }: { label: string; children?: ReactNode; rows?: { label: string; text: string }[] }) {
  return (
    <section aria-label={COACH_NAME} className="flex flex-col gap-2 rounded-[6px] bg-ink px-[18px] pb-5 pt-[18px] text-paper">
      <h2 className="font-num text-[14px] font-bold uppercase tracking-[0.06em] text-coral">{label}</h2>
      {rows ? (
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

Today's callers pass `children` and keep working.

- [ ] **Step 10: `TrendChart`.** Create `app/ui/TrendChart.tsx`. P4d replaces this file with a superset that adds Progress's goal band and pace line, keeping these three props:

```tsx
import { useEffect, useRef, useState } from "react";
import { daysBetween } from "~/domain/dates";
import type { ISODate } from "~/domain/types";

export interface TrendPoint {
  date: ISODate;
  weight: number | null;
  trend: number | null;
}

const H = 110;
const TOP = 6;
const PLOT_H = 94;

/** Dots for weigh-ins, the trend line and its end dot, and an optional dashed marker at a date (the check-in's Monday). */
export function TrendChart({ points, label, marker = null }: { points: TrendPoint[]; label: string; marker?: ISODate | null }) {
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
  const values = points.flatMap((p) => [p.weight, p.trend]).filter((v): v is number => v !== null);
  if (points.length < 2 || values.length < 2) return <p className="py-6 text-[15px] text-ink-3">Weigh in a few days to see your trend.</p>;
  const first = points[0].date;
  const span = Math.max(1, daysBetween(first, points.at(-1)!.date));
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const x = (d: ISODate) => 4 + (daysBetween(first, d) / span) * (W - 8);
  const y = (v: number) => TOP + ((hi - v) / (hi - lo || 1)) * PLOT_H;
  const line = points.filter((p) => p.trend !== null);
  const end = line.at(-1);
  return (
    <div ref={ref}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label={label}>
        <line x1="0" x2={W} y1={H - 4} y2={H - 4} stroke="var(--rule)" />
        {marker && <line x1={x(marker)} x2={x(marker)} y1={TOP - 2} y2={H - 4} stroke="var(--underline)" strokeDasharray="3 4" />}
        {points.map((p) => (p.weight !== null ? <circle key={p.date} cx={x(p.date)} cy={y(p.weight)} r="3" fill="var(--border)" /> : null))}
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
        {end && <circle cx={x(end.date)} cy={y(end.trend!)} r="5" fill="var(--ink)" />}
      </svg>
    </div>
  );
}
```

- [ ] **Step 11: Typecheck.**

```bash
npm run typecheck
```

Expected: no type errors.

- [ ] **Step 12: Commit.**

```bash
git add app/styles/tokens.css app/app.css docs/design/system.md tests/unit/tokens.test.ts app/components/ui.tsx app/ui/StatGrid.tsx app/ui/LinkCard.tsx app/ui/TapGrid.tsx app/ui/ChoicePair.tsx app/ui/RockyCard.tsx app/ui/TrendChart.tsx
git commit -m "Shared kit: the stat grid, link card, tap grid, choice pair, trend chart, and Rocky's card in rows"
```

---

### Task 2: The check-in model

Everything the page shows, from the store. Its tests run on P4a's `weekThree()` fixture: Sunday Oct 25, week 3, whose numbers P4a's digest test works out (trend 205.1 and down 0.4, 7 of 7 counted with 4 full, 7,443 steps against 7,000, incline press and pec deck moved up, the shoulder press stuck at 45, the bowl eaten 4 times and the thighs 3).

**Files:**
- Create: `app/checkin/model.ts`
- Test: `tests/unit/checkin/model.test.ts`

- [ ] **Step 1: Write the failing tests.** Create `tests/unit/checkin/model.test.ts`:

```ts
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
```

- [ ] **Step 2: Run them to make sure they fail.**

```bash
npx vitest run --project unit tests/unit/checkin/model.test.ts
```

Expected: FAIL, "Cannot find module '~/checkin/model'".

- [ ] **Step 3: Implement.** Create `app/checkin/model.ts`:

```ts
// Everything the Sunday check-in shows, from the phone's copy (spec section 3, "Check-in"). Pure: the page and the unit
// tests run it. The page holds the choices until Finish; finishCheckIn works every number out again.
import { plan } from "~/content";
import { factorFor } from "~/content/scaled";
import { checkInWindow } from "~/domain/checkin";
import { addDays, mealDate, weekStart, weekday } from "~/domain/dates";
import type { Call } from "~/domain/energy";
import { MIN_TREND_WEIGH_INS, roundLb, trendSeries } from "~/domain/trend";
import type { ISODate } from "~/domain/types";
import type { Row } from "~/sync/tables";
import type { Rows } from "~/today/slots";
import type { TrendPoint } from "~/ui/TrendChart";
import { setsText } from "~/workout/model";
import { callView, changedFoods, scaleChanges, type CallPick, type CallView, type ScaleChange } from "./call";
import { buildDigest, type CheckInChoices, type CheckInDigest, type Level, type SleepLevel } from "./digest";
import { weekCall, weighIns } from "./engine";
import { groceryCount, previewNextWeek } from "./meals";
import { ruleTake, type Take } from "./take";

export type LiftPlan = "hold" | "drop";
export type Phase = "early" | "open" | "finished";

export interface PageChoices extends CheckInChoices {
  /** The Monday these choices are for. Choices for another week are dropped. */
  week: ISODate;
  pick: CallPick | null;
  lifts: Record<string, LiftPlan>;
}

export interface StatView {
  value: string;
  sub: string;
}

export interface StuckCard {
  exercise: string;
  title: string;
  line: string;
  hold: string;
  drop: string;
  plan: LiftPlan;
}

export interface NextWeekView {
  deload: boolean;
  movedUp: { name: string; change: string }[];
  movedUpNote: string;
  stuck: StuckCard[];
  repeats: { slug: string; name: string; rest: boolean; sub: string }[];
  backFromRest: string[];
  groceries: { title: string; sub: string; href: string };
}

/** finishCheckIn's args, less `at`, which the page stamps when Finish is tapped. */
export interface FinishArgs {
  week: ISODate;
  pick: CallPick;
  hunger: Level | null;
  energy: Level | null;
  sleep: SleepLevel | null;
  rest: string[];
  lifts: { exercise: string; plan: LiftPlan }[];
}

export interface CheckInModel {
  monday: ISODate;
  sunday: ISODate;
  phase: Phase;
  /** Finished, and not reopened: the choices show but can't change. */
  readOnly: boolean;
  header: string;
  poster: [string, string];
  meta: string;
  chart: { points: TrendPoint[]; marker: ISODate; left: string | null; right: string | null; label: string };
  stats: { days: StatView; lifts: StatView; steps: StatView };
  waist: { value: number | null; note: string | null; editable: boolean };
  /** The choices in effect: what the page holds, else the saved ones, else the defaults. */
  choices: PageChoices;
  take: Take | null;
  call: { view: CallView; changes: ScaleChange[]; choice: CallPick } | null;
  next: NextWeekView | null;
  dock: { note: string; action: "finish" | "today" | null; change: boolean };
  /** What Finish sends, while it can be tapped. */
  finish: FinishArgs | null;
}

const DAY_NAME = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const num = (n: number) => n.toLocaleString("en-US");
/** Inches, at most two decimals: "35.75", "35.5". */
const inches = (n: number) => String(Math.round(n * 100) / 100);

function monthDay(d: ISODate): string {
  const [, m, day] = d.split("-").map(Number);
  return `${MONTH_SHORT[m - 1]} ${day}`;
}

/** "Oct 19 to 25", or "Oct 26 to Nov 1" across a month. */
function range(from: ISODate, to: ISODate): string {
  return from.slice(0, 7) === to.slice(0, 7) ? `${monthDay(from)} to ${Number(to.slice(8))}` : `${monthDay(from)} to ${monthDay(to)}`;
}

function trendLine(trend: number | null, change: number | null): string {
  if (trend === null) return "No trend yet.";
  if (change === null) return `Trend ${trend.toFixed(1)}.`;
  if (Math.abs(change) < 0.05) return "Steady.";
  return `${change < 0 ? "Down" : "Up"} ${Math.abs(change).toFixed(1)}.`;
}

function checkpointLine(weeks: number): string | null {
  const day = monthDay(plan.goal.date);
  if (weeks > 1) return `${weeks} weeks to the ${day} checkpoint`;
  if (weeks === 1) return `1 week to the ${day} checkpoint`;
  if (weeks === 0) return "Checkpoint week";
  return null;
}

/** "3 planned, plus Tuesday's extra", "All 3 planned", "2 of 3 planned, Friday missed", "1 of 3 planned, 2 missed". */
function liftsSub(l: CheckInDigest["lifts"]): string {
  const extras = l.extras.length === 0 ? null : l.extras.length === 1 ? `${DAY_NAME[weekday(l.extras[0])]}'s extra` : `${l.extras.length} extras`;
  if (l.plannedDone === l.planned) return extras ? `${l.planned} planned, plus ${extras}` : `All ${l.planned} planned`;
  const missed = l.missed.length === 0 ? "" : l.missed.length === 1 ? `, ${DAY_NAME[weekday(l.missed[0])]} missed` : `, ${l.missed.length} missed`;
  return `${l.plannedDone} of ${l.planned} planned${missed}${extras ? `, plus ${extras}` : ""}`;
}

/** Weigh-ins and the trend for each day from the phase start, the line starting with the third weigh-in. */
function chartPoints(rows: Rows, end: ISODate): TrendPoint[] {
  const weights = weighIns(rows, end);
  const byDate = new Map(weights.map((w) => [w.date, w.weight]));
  const series = trendSeries(weights, end);
  let seen = weights.filter((w) => w.date < plan.phaseStart).length;
  const out: TrendPoint[] = [];
  for (let d = plan.phaseStart; d <= end; d = addDays(d, 1)) {
    if (byDate.has(d)) seen++;
    const t = series.get(d);
    out.push({ date: d, weight: byDate.get(d) ?? null, trend: seen >= MIN_TREND_WEIGH_INS && t !== undefined ? roundLb(t) : null });
  }
  return out;
}

const asLevel = (v: unknown): Level | null => (v === "low" || v === "fine" || v === "high" ? v : null);
const asSleep = (v: unknown): SleepLevel | null => (v === "poor" || v === "fine" || v === "great" ? v : null);

/** A finished week's choices and call, from its row. N3-era rows have a pick and no call; v1 rows have neither. */
function savedCheckIn(row: Row, week: ISODate): { choices: PageChoices; call: Call | null } {
  let o: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(String(row.outcome ?? "{}"));
    if (parsed && typeof parsed === "object") o = parsed as Record<string, unknown>;
  } catch {
    // A row from before the outcome was JSON: nothing saved to show.
  }
  const lifts: Record<string, LiftPlan> = {};
  if (Array.isArray(o.lifts)) {
    for (const l of o.lifts as { exercise?: unknown; plan?: unknown }[]) if (typeof l?.exercise === "string" && (l.plan === "hold" || l.plan === "drop")) lifts[l.exercise] = l.plan;
  }
  const call = o.call && typeof o.call === "object" && "kind" in o.call ? (o.call as Call) : null;
  return {
    call,
    choices: {
      week,
      hunger: asLevel(row.hunger),
      energy: asLevel(row.energy),
      sleep: asSleep(row.sleep),
      pick: o.pick === "calories" || o.pick === "steps" ? o.pick : null,
      rest: Array.isArray(o.rest) ? (o.rest as unknown[]).filter((s): s is string => typeof s === "string") : null,
      lifts,
    },
  };
}

/**
 * The check-in at `now`. In the window (Sunday 5pm to Monday noon) it is the week under review; otherwise the week so
 * far. `choices` are the page's, or null for the saved or default ones. `editing` is "Change my answers".
 */
export function buildCheckIn(rows: Rows, now: Date, choices: PageChoices | null, editing = false): CheckInModel {
  const today = mealDate(now);
  const window = checkInWindow(now);
  const monday = window ?? weekStart(today);
  const sunday = addDays(monday, 6);
  const next = addDays(monday, 7);
  const row = window ? (rows("check_ins").find((r) => r.week_start === monday) ?? null) : null;
  const kept = row ? savedCheckIn(row, monday) : null;
  const phase: Phase = window === null ? "early" : row ? "finished" : "open";
  // A finished check-in can be changed until the new week starts at Monday 3am, mealDate's rule.
  const canChange = phase === "finished" && today < next;
  const readOnly = phase === "finished" && !(canChange && editing);
  const own = !readOnly && choices?.week === monday ? choices : null;
  const base: PageChoices = own ?? kept?.choices ?? { week: monday, hunger: null, energy: null, sleep: null, pick: null, rest: null, lifts: {} };

  const early = phase === "early";
  const digest = buildDigest(rows, monday, base, early ? today : next);
  const l = digest.lifts;
  const rest = digest.meals.repeats.filter((r) => r.rest).map((r) => r.slug);
  const lifts: Record<string, LiftPlan> = Object.fromEntries(l.stuck.map((s) => [s.exercise, base.lifts[s.exercise] ?? "hold"]));
  const sessions = l.plannedDone + l.extras.length;
  const end = early && today < sunday ? today : sunday;
  const waists = rows("waist_logs")
    .map((r) => ({ date: r.date as ISODate, inches: Number(r.inches) }))
    .filter((w) => w.date <= end)
    .sort((a, b) => a.date.localeCompare(b.date));
  const latest = waists.at(-1) ?? null;
  const { trend, change, firstDate, firstWeight } = digest.weight;

  const shared = {
    monday,
    sunday,
    phase,
    readOnly,
    header: `SUNDAY CHECK-IN · ${monthDay(sunday).toUpperCase()}`,
    poster: [`Week ${digest.week.number}.`, trendLine(trend, change)] as [string, string],
    meta: [range(monday, sunday), checkpointLine(digest.week.weeksToCheckpoint)].filter(Boolean).join(" · "),
    chart: {
      points: chartPoints(rows, end),
      marker: monday,
      left: firstDate !== null && firstWeight !== null ? `${monthDay(firstDate)} · ${firstWeight.toFixed(1)}` : null,
      right: trend !== null ? `Trend ${trend.toFixed(1)}` : null,
      label: `Weight since ${monthDay(plan.phaseStart)}: daily weigh-ins as dots and the trend as a line${trend !== null ? `, now ${trend.toFixed(1)} pounds` : ""}.`,
    },
    stats: {
      days: { value: `${digest.days.counted} of ${digest.days.total}`, sub: `${digest.days.full} fully on plan` },
      lifts: { value: `${sessions} ${sessions === 1 ? "session" : "sessions"}`, sub: liftsSub(l) },
      steps: { value: num(digest.steps.avg), sub: `goal ${num(digest.steps.goal)}` },
    },
    waist: early
      ? { value: latest?.inches ?? null, note: latest ? `last measured ${monthDay(latest.date)}` : null, editable: false }
      : { value: digest.waist.now, note: digest.waist.was !== null ? `was ${inches(digest.waist.was)}` : null, editable: !readOnly },
  };

  if (early) {
    return { ...shared, choices: { ...base, rest, lifts }, take: null, call: null, next: null, dock: { note: "Opens Sunday at 5pm.", action: null, change: false }, finish: null };
  }

  const wc = weekCall(rows, monday, { hungry: digest.feel.hungryTwice });
  // A finished page shows what Finish saved; an open one, the call as the rows have it now.
  const call: Call = (readOnly ? kept?.call : null) ?? wc.call;
  const pick: CallPick = (base.pick ?? call.pick) === "steps" && call.steps ? "steps" : "calories";
  const plannedNext = rows("planned_meals").filter((r) => (r.date as string) >= next && (r.date as string) <= addDays(next, 6));
  const slugs = readOnly && plannedNext.length > 0 ? plannedNext.map((r) => r.meal_slug as string) : previewNextWeek(rows, monday, rest).map((p) => p.slug);
  // The grams start from this week's target as eaten and end at what the pick brings on Monday, as N3's page did.
  const nowFactor = factorFor(wc.thisWeekKcal);
  const view = callView({ ...wc, call }, pick, changedFoods(scaleChanges(slugs, nowFactor, factorFor(call.calories.kcal))));
  const changes = scaleChanges(slugs, nowFactor, factorFor(view.kcal));
  const take = ruleTake(readOnly && kept?.call ? { ...digest, call: { ...digest.call, ...kept.call } } : digest);

  const query = new URLSearchParams({ week: next, from: "check-in", kcal: String(view.kcal) });
  if (rest.length === 0) query.append("rest", "");
  for (const slug of rest) query.append("rest", slug);

  return {
    ...shared,
    choices: { ...base, pick, rest, lifts },
    take,
    call: { view, changes, choice: pick },
    next: {
      deload: l.nextWeekDeload,
      movedUp: l.movedUp.map((m) => ({ name: m.name, change: `${m.from} → ${m.to} lb` })),
      movedUpNote: `${l.movedUp.length} ${l.movedUp.length === 1 ? "lift" : "lifts"} this week`,
      stuck: l.stuck.map((s) => ({
        exercise: s.exercise,
        title: `${s.name} is stuck`,
        line: `${setsText(s.lastSets)} three sessions running.`,
        hold: `Hold ${s.top}, chase ${s.chase.join(", ")}`,
        drop: `Drop to ${s.drop}, build back`,
        plan: lifts[s.exercise],
      })),
      repeats: digest.meals.repeats.map((r) => ({ slug: r.slug, name: r.name, rest: r.rest, sub: `${r.count} times · ${r.rest ? "rests 2 weeks" : "staying in"}` })),
      backFromRest: digest.meals.backFromRest,
      groceries: { title: "Grocery list is ready", sub: `${groceryCount(slugs)} items for ${range(next, addDays(next, 6))}`, href: `/groceries?${query}` },
    },
    dock: readOnly ? { note: "Done. New numbers start Monday morning.", action: "today", change: canChange } : { note: "New numbers start Monday morning.", action: "finish", change: false },
    finish: readOnly ? null : { week: monday, pick, hunger: base.hunger, energy: base.energy, sleep: base.sleep, rest, lifts: l.stuck.map((s) => ({ exercise: s.exercise, plan: lifts[s.exercise] })) },
  };
}
```

- [ ] **Step 4: Run the tests and typecheck.** Same command as Step 2, then `npm run typecheck`. Expected: PASS, all 9, no type errors.

If "follows the choices" fails on the grocery link, check `URLSearchParams`: an empty `rest` must still be in the link as `rest=`, so v1 groceries reads "no rests" rather than its defaults.

- [ ] **Step 5: Commit.**

```bash
git add app/checkin/model.ts tests/unit/checkin/model.test.ts
git commit -m "The check-in model: the week, the take, the call, next week and the dock, from the phone's copy"
```

---

### Task 3: The page, and v1's check-in goes

**Files:**
- Create: `app/checkin/WaistField.tsx`, `app/checkin/NextWeek.tsx`, `app/checkin/CheckInScreen.tsx`
- Modify: `app/routes/check-in.tsx` (full rewrite), `app/server/checkin.server.ts`
- Delete: `tests/workers/checkin-engine.test.ts`
- Modify: `tests/workers/checkin.test.ts`
- Move: `tests/workers/checkin-route.test.ts` to `tests/workers/groceries-route.test.ts`

- [ ] **Step 1: The waist field.** Create `app/checkin/WaistField.tsx`:

```tsx
import { useEffect, useState } from "react";

/** The waist cell's field. It saves on blur or Done, and only a changed number from 20 to 60. "was 35.75" sits inside, as the mock draws it. */
export function WaistField({ id, value, note, editable, onCommit }: { id: string; value: number | null; note: string | null; editable: boolean; onCommit: (inches: number) => void }) {
  const shown = value === null ? "" : String(value);
  const [text, setText] = useState(shown);
  useEffect(() => setText(shown), [shown]);
  const commit = () => {
    const v = Number(text);
    if (text.trim() === "" || !Number.isFinite(v) || v < 20 || v > 60 || v === value) return setText(shown);
    onCommit(v);
  };
  return (
    <div
      className={`flex h-11 items-center gap-1.5 rounded-[6px] ${editable ? "border-[1.5px] border-ink bg-field px-2.5 has-[:focus]:outline-[2.5px] has-[:focus]:outline-offset-2 has-[:focus]:outline-red has-[:focus]:outline-solid" : ""}`}
    >
      <input
        id={id}
        inputMode="decimal"
        enterKeyHint="done"
        value={text}
        readOnly={!editable}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        className="tabular w-full min-w-0 flex-1 bg-transparent font-num text-[24px] font-bold text-ink outline-none"
      />
      {note && <span className="whitespace-nowrap font-sans text-[14px] font-normal text-ink-3">{note}</span>}
    </div>
  );
}
```

- [ ] **Step 2: Next week.** Create `app/checkin/NextWeek.tsx`:

```tsx
import { COACH_NAME } from "~/brand";
import { Toggle } from "~/components/Toggle";
import { ChoicePair } from "~/ui/ChoicePair";
import { LinkCard } from "~/ui/LinkCard";
import type { LiftPlan, NextWeekView } from "./model";

/** Next week (mock CheckInNext, options 3A and 4A): lifts, the meals to rest, and groceries. */
export function NextWeek({ n, onRest, onLift }: { n: NextWeekView; onRest: (slug: string, on: boolean) => void; onLift: (exercise: string, plan: LiftPlan) => void }) {
  return (
    <section aria-labelledby="next-week" className="flex flex-col gap-6">
      <h2 id="next-week" className="border-b-2 border-ink pb-2 font-display text-[44px] uppercase leading-[0.95]">
        Next week.
      </h2>

      <section aria-labelledby="next-lifts" className="flex flex-col gap-3">
        <h3 id="next-lifts" className="text-[18px] font-bold">
          Lifts
        </h3>
        {n.deload ? (
          <p className="text-[16px] leading-[1.45] text-ink-2">Next week is the deload: one set a lift at the same weights.</p>
        ) : (
          <>
            {n.movedUp.length > 0 && (
              <div className="rounded-[6px] border-[1.5px] border-brass-border bg-brass-fill px-3.5 pb-1.5 pt-1">
                <p className="mb-1 mt-2 flex items-center gap-2 font-num text-[16px] font-bold">
                  <span className="rounded-[3px] bg-brass-tag px-[7px] py-[3px] text-[13px] uppercase tracking-[0.06em] text-brass-on">Moved up</span>
                  {n.movedUpNote}
                </p>
                <ul>
                  {n.movedUp.map((m, i) => (
                    <li key={m.name} className={`flex min-h-10 items-center justify-between gap-2.5 ${i < n.movedUp.length - 1 ? "border-b border-brass-rule" : ""}`}>
                      <span className="text-[16px]">{m.name}</span>
                      <span className="tabular whitespace-nowrap font-num text-[18px] font-bold">{m.change}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {n.stuck.map((s) => (
              <div key={s.exercise} className="flex flex-col gap-2.5 rounded-[6px] border-[1.5px] border-ink p-3.5">
                <p className="flex flex-col gap-0.5">
                  <span className="text-[17px] font-bold">{s.title}</span>
                  <span className="text-[15px] leading-[1.4] text-ink-2">{s.line}</span>
                </p>
                <ChoicePair
                  label={`${s.title}: next week's plan`}
                  value={s.plan}
                  onPick={(plan) => onLift(s.exercise, plan)}
                  options={[
                    { value: "hold", title: s.hold, sub: `${COACH_NAME}'s pick` },
                    { value: "drop", title: s.drop },
                  ]}
                />
              </div>
            ))}
            {n.movedUp.length === 0 && n.stuck.length === 0 && <p className="text-[16px] leading-[1.45] text-ink-2">No lift moved up this week. Same weights, beat the reps.</p>}
          </>
        )}
      </section>

      <section aria-labelledby="next-meals" className="flex flex-col">
        <h3 id="next-meals" className="mb-1 text-[18px] font-bold">
          Meals you ate 3 times or more
        </h3>
        {n.repeats.length === 0 ? (
          <p className="text-[16px] leading-[1.45] text-ink-2">No meal came up 3 times this week.</p>
        ) : (
          <ul className="border-t-2 border-ink">
            {n.repeats.map((r) => (
              <li key={r.slug} className="flex min-h-[60px] items-center gap-3 border-b border-rule">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-[16px] font-semibold">{r.name}</span>
                  <span className="text-[14px] text-ink-3">{r.sub}</span>
                </span>
                <Toggle on={r.rest} label={`Rest ${r.name}`} onChange={(on) => onRest(r.slug, on)} />
              </li>
            ))}
          </ul>
        )}
        {n.backFromRest.length > 0 && (
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <span className="text-[15px] text-ink-3">Back from rest next week:</span>
            {n.backFromRest.map((name) => (
              <span key={name} className="flex h-8 items-center rounded-[6px] border-[1.5px] border-ink px-2.5 text-[14px] font-semibold">
                {name}
              </span>
            ))}
          </div>
        )}
        <p className="mt-2.5 text-[15px] text-ink-3">Swap any meal on Today or its meal screen.</p>
      </section>

      <LinkCard to={n.groceries.href} icon="cart" title={n.groceries.title} sub={n.groceries.sub} />
    </section>
  );
}
```

- [ ] **Step 3: The page.** Create `app/checkin/CheckInScreen.tsx`:

```tsx
import { Link } from "react-router";
import { COACH_NAME } from "~/brand";
import { btn } from "~/ui/button";
import { Dock, GymFrame, HeaderIcon } from "~/ui/GymFrame";
import { RockyCard } from "~/ui/RockyCard";
import { SectionHead } from "~/ui/SectionHead";
import { StatGrid } from "~/ui/StatGrid";
import { TapGrid } from "~/ui/TapGrid";
import { TrendChart } from "~/ui/TrendChart";
import { CallBlock } from "./CallBlock";
import type { Level, SleepLevel } from "./digest";
import type { CheckInModel, PageChoices } from "./model";
import { NextWeek } from "./NextWeek";
import { WaistField } from "./WaistField";

const LEVELS = [
  { value: "low", label: "Low" },
  { value: "fine", label: "Fine" },
  { value: "high", label: "High" },
];
const SLEEP = [
  { value: "poor", label: "Poor" },
  { value: "fine", label: "Fine" },
  { value: "great", label: "Great" },
];

/** The one-page Sunday check-in (option 1A): the week, the call, next week, with the dock always showing. */
export function CheckInScreen({
  m,
  onChoose,
  onWaist,
  onFinish,
  onReopen,
}: {
  m: CheckInModel;
  onChoose: (change: Partial<PageChoices>) => void;
  onWaist: (inches: number) => void;
  onFinish: () => void;
  onReopen: () => void;
}) {
  const dock = (
    <Dock>
      <p className="text-center text-[15px] text-ink-3">{m.dock.note}</p>
      {m.dock.action === "finish" && (
        <button type="button" onClick={onFinish} className={`${btn.primary} h-[60px] text-[20px]`}>
          Finish check-in
        </button>
      )}
      {m.dock.action === "today" && (
        <Link to="/" className={`${btn.primary} h-[60px] text-[20px]`}>
          Back to Today
        </Link>
      )}
      {m.dock.change && (
        <button type="button" onClick={onReopen} className={`${btn.quiet} self-center`}>
          Change my answers
        </button>
      )}
    </Dock>
  );

  return (
    <GymFrame
      gap="gap-6"
      header={
        <>
          <HeaderIcon to="/" label="Back to Today" icon="back" />
          <span className="whitespace-nowrap font-num text-[16px] font-bold tracking-[0.02em]">{m.header}</span>
        </>
      }
      dock={dock}
    >
      <section className="flex flex-col gap-2">
        <h1 className="font-display text-[64px] uppercase leading-[0.92]">
          {m.poster.map((line) => (
            <span key={line} className="block">
              {line}
            </span>
          ))}
        </h1>
        <p className="font-num text-[18px] font-semibold text-ink-3">{m.meta}</p>
      </section>

      <section aria-label="Weight trend" className="flex flex-col gap-1.5">
        <TrendChart points={m.chart.points} label={m.chart.label} marker={m.chart.marker} />
        <p className="tabular flex justify-between gap-2 font-num text-[14px] font-semibold text-ink-3">
          <span>{m.chart.left}</span>
          <span>This week</span>
          <span className="font-bold text-ink">{m.chart.right}</span>
        </p>
      </section>

      <StatGrid
        label="The week in numbers"
        columns={2}
        cells={[
          { label: "Days that counted", ...m.stats.days },
          { label: "Lifts", ...m.stats.lifts },
          { label: "Steps, daily average", ...m.stats.steps },
          { label: "Waist, inches", labelFor: "waist", value: <WaistField id="waist" value={m.waist.value} note={m.waist.note} editable={m.waist.editable} onCommit={onWaist} /> },
        ]}
      />

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

      {m.call && (
        // Disabled once finished: every choice below shows as saved until "Change my answers".
        <fieldset disabled={m.readOnly} className="m-0 flex min-w-0 flex-col gap-6 border-0 p-0">
          <section aria-labelledby="feel" className="flex flex-col gap-2.5">
            <SectionHead id="feel">How did it feel?</SectionHead>
            <TapGrid
              rows={[
                { label: "Hunger", choices: LEVELS, value: m.choices.hunger, onPick: (v) => onChoose({ hunger: v as Level | null }) },
                { label: "Energy", choices: LEVELS, value: m.choices.energy, onPick: (v) => onChoose({ energy: v as Level | null }) },
                { label: "Sleep", choices: SLEEP, value: m.choices.sleep, onPick: (v) => onChoose({ sleep: v as SleepLevel | null }) },
              ]}
            />
            <p className="text-[14px] text-ink-3">Two hungry weeks in a row and {COACH_NAME} picks extra steps over cutting food.</p>
          </section>

          <CallBlock view={m.call.view} choice={m.call.choice} onChoice={(pick) => onChoose({ pick })} changes={m.call.changes} />

          {m.next && (
            <NextWeek
              n={m.next}
              onRest={(slug, on) => onChoose({ rest: on ? [...(m.choices.rest ?? []), slug] : (m.choices.rest ?? []).filter((s) => s !== slug) })}
              onLift={(exercise, plan) => onChoose({ lifts: { ...m.choices.lifts, [exercise]: plan } })}
            />
          )}
        </fieldset>
      )}
    </GymFrame>
  );
}
```

- [ ] **Step 4: The route.** Replace `app/routes/check-in.tsx` with:

```tsx
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { pageTitle } from "~/brand";
import { CheckInScreen } from "~/checkin/CheckInScreen";
import { buildCheckIn, type PageChoices } from "~/checkin/model";
import { useNow } from "~/lib/use-now";
import { useMutate, useStoreVersion, useSyncClient, useSyncStatus } from "~/sync/react";

export const handle = { hideTabBar: true };

export function meta() {
  return [{ title: pageTitle("Sunday check-in") }];
}

/** No loader: the check-in reads the phone's copy, so Sunday works with no signal. Finish is one named change. */
export default function CheckIn() {
  const client = useSyncClient();
  const ready = useSyncStatus()?.ready ?? false;
  const version = useStoreVersion();
  const mutate = useMutate();
  const [search] = useSearchParams();
  const minute = Math.floor(useNow(30_000).getTime() / 60_000);
  // Dev only: ?now=2026-10-25T18:00:00-05:00 pins the page's clock, so the Sunday window can be looked at any day.
  const pinned = import.meta.env.DEV ? search.get("now") : null;
  const at = pinned && !Number.isNaN(Date.parse(pinned)) ? Date.parse(pinned) : minute * 60_000;
  // The page's choices until Finish. Only the waist saves before it.
  const [choices, setChoices] = useState<PageChoices | null>(null);
  const [editing, setEditing] = useState(false);
  const model = useMemo(
    () => (client && ready ? buildCheckIn((t) => client.store.rows(t), new Date(at), choices, editing) : null),
    [client, ready, version, at, choices, editing],
  );
  // The server and the first paint have no store yet. It loads from the phone in a few milliseconds.
  if (!model) return <main aria-busy="true" className="min-h-dvh" />;

  const finish = async () => {
    if (!model.finish) return;
    if (await mutate("finishCheckIn", { ...model.finish, at: new Date().toISOString() })) {
      setChoices(null);
      setEditing(false);
    }
  };

  return (
    <CheckInScreen
      m={model}
      onChoose={(change) => setChoices({ ...model.choices, ...change })}
      onWaist={(inches) => void mutate("logWaist", { date: model.sunday, inches })}
      onFinish={() => void finish()}
      onReopen={() => {
        setChoices(null);
        setEditing(true);
      }}
    />
  );
}
```

`Finish` lands on the phone's store before `mutate` resolves, so the next render reads the new `check_ins` row and the page turns finished in the same frame. A refusal shows through the Foundation notice ("Check-in didn't save. ..."), and the choices stay for another try.

- [ ] **Step 5: The server keeps only what others read.** Replace `app/server/checkin.server.ts` with:

```ts
import { and, between, eq, sql } from "drizzle-orm";
import { meals } from "~/content";
import type { Db } from "~/db/client";
import { checkIns, mealLogs } from "~/db/schema";
import { addDays } from "~/domain/dates";
import type { RotationMeal } from "~/domain/rotation";
import type { ISODate } from "~/domain/types";

// The check-in runs on the phone (app/checkin/*) and saves through finishCheckIn. What stays here serves the
// reminders and Today's server reads (checkInDone, checkInWindow), and v1 groceries until P4c (mealRepeats, rotationMeals).
export { checkInWindow } from "~/domain/checkin";

export async function checkInDone(db: Db, monday: ISODate): Promise<boolean> {
  return (await db.select().from(checkIns).where(eq(checkIns.weekStart, monday)).get()) !== undefined;
}

export function rotationMeals(): RotationMeal[] {
  return [...meals.values()].map((m) => ({ slug: m.slug, pool: m.pool, mode: m.mode, tags: m.tags }));
}

/** Planned meals eaten this week, and the ones eaten 3 or more times, for v1 groceries' default rests. */
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
```

- [ ] **Step 6: The v1 tests go with it.**

```bash
git rm tests/workers/checkin-engine.test.ts
git mv tests/workers/checkin-route.test.ts tests/workers/groceries-route.test.ts
```

Replace `tests/workers/checkin.test.ts` with:

```ts
import { describe, expect, it } from "vitest";
import { checkInWindow } from "~/server/checkin.server";
import { chicago } from "./helpers";

describe("check-in window", () => {
  it("opens Sunday at 5pm and closes Monday at noon", () => {
    expect(checkInWindow(chicago("2026-10-18", "16:59"))).toBeNull();
    expect(checkInWindow(chicago("2026-10-18", "17:00"))).toBe("2026-10-12");
    expect(checkInWindow(chicago("2026-10-19", "11:59"))).toBe("2026-10-12");
    expect(checkInWindow(chicago("2026-10-19", "12:00"))).toBeNull();
  });
});
```

Replace `tests/workers/groceries-route.test.ts` with:

```ts
import { between } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { plannedMeals } from "~/db/schema";
import { action as groceryAction, loader as groceryLoader } from "~/routes/groceries";
import { db, post, routeArgs } from "./helpers";

describe("groceries route", () => {
  it("builds the list for a week and checks items off", async () => {
    const data = await groceryLoader(routeArgs(new Request("http://localhost/groceries?week=2026-10-19")));
    expect(data.groups.length).toBeGreaterThan(0);
    const first = data.groups[0].items[0];
    await groceryAction(routeArgs(post("http://localhost/groceries", { week: "2026-10-19", food: first.foodId, checked: "true" })));
    const again = await groceryLoader(routeArgs(new Request("http://localhost/groceries?week=2026-10-19")));
    expect(again.checked).toContain(first.foodId);
  });

  it("previews a future week without writing its plan", async () => {
    const data = await groceryLoader(routeArgs(new Request("http://localhost/groceries?week=2027-03-01&rest=&from=check-in")));
    expect(data.planned).toBe(false);
    expect(data.count).toBeGreaterThan(0);
    expect(data.back).toBe("/check-in");
    expect(await db().select().from(plannedMeals).where(between(plannedMeals.date, "2027-03-01", "2027-03-07")).all()).toHaveLength(0);
  });
});
```

- [ ] **Step 7: Confirm nothing else reads what went.**

```bash
rg -n "checkInData|completeCheckIn|CheckInData|CallOutcome|DaySheet" app tests
```

Expected: no matches. If something in `app/` shows, it read the v1 path: move it to the store, or tell Kameron.

- [ ] **Step 8: Typecheck and run the affected tests.**

```bash
npm run typecheck
npx vitest run --project unit tests/unit/checkin
npx vitest run --project workers tests/workers/checkin.test.ts tests/workers/groceries-route.test.ts tests/workers/day.test.ts tests/workers/reminders.test.ts tests/workers/no-plan.test.ts
```

Expected: no type errors, all PASS.

- [ ] **Step 9: Commit.**

```bash
git add app/checkin/WaistField.tsx app/checkin/NextWeek.tsx app/checkin/CheckInScreen.tsx app/routes/check-in.tsx app/server/checkin.server.ts tests/workers/checkin.test.ts tests/workers/groceries-route.test.ts
git commit -m "The Sunday check-in is one page on the phone's copy; the v1 check-in loader and action go"
```

Step 6's `git rm` and `git mv` already staged the deletion and the move.

---

### Task 4: Look at it against the mocks

- [ ] **Step 1: Sign in locally** with a temporary password, as N3's Task 10 did. Save the hash, swap it, and put it back in Step 7:

```bash
npx wrangler d1 execute rocky-core --local --command "select password_hash from users where name_key = 'kameron'"
npx tsx -e 'import("./app/server/password.ts").then(async (m) => console.log(await m.hashPassword("local-look-check")))'
npx wrangler d1 execute rocky-core --local --command "update users set password_hash = '<hash printed above>' where name_key = 'kameron'"
```

- [ ] **Step 2: Load week three locally.** This resets Kameron's local person tables to P4a's fixture. Step 7 puts the demo data back.

```bash
LOOK=$(mktemp -d -t p4b-look)
cat > "$LOOK/seed.mts" <<'TS'
// Dev only: prints SQL that resets the local person tables to the check-in fixture's week three.
const { weekThree } = await import(`${process.cwd()}/tests/unit/checkin/fixture.ts`);
const q = (v: unknown) => (v === null || v === undefined ? "NULL" : typeof v === "number" ? String(v) : `'${String(v).replaceAll("'", "''")}'`);
const tables = ["meal_state", "planned_meals", "meal_logs", "batches", "workout_sessions", "set_logs", "exercise_checks", "exercise_overrides", "exercise_swaps", "weigh_ins", "waist_logs", "steps_daily", "targets", "check_ins", "grocery_checks", "lift_drops"];
const out = tables.map((t) => `DELETE FROM ${t};`);
for (const [table, rows] of Object.entries(weekThree() as Record<string, Record<string, unknown>[]>)) {
  for (const r of rows) out.push(`INSERT INTO ${table} (${Object.keys(r).join(", ")}) VALUES (${Object.values(r).map(q).join(", ")});`);
}
console.log(out.join("\n"));
TS
npx tsx --tsconfig tsconfig.cloudflare.json "$LOOK/seed.mts" > "$LOOK/seed.sql"
npx wrangler d1 execute rocky-db --local --file "$LOOK/seed.sql"
```

In the browser, clear the site's IndexedDB (DevTools, Application, Storage, Clear site data) so the phone's copy takes a fresh snapshot.

- [ ] **Step 3: Compare at 390 × 844,** with `npm run dev` running, side by side with `CheckInWeek`, `CheckInCall` and `CheckInNext` and options 1A to 4A. Open `/check-in?now=2026-10-25T18:00:00-05:00`. Don't tap Finish while pinned.
1. **Header and poster:** the 44 px back square and "SUNDAY CHECK-IN · OCT 25"; "WEEK 3. / DOWN 0.4." in Anton 64; "Oct 19 to 25 · 10 weeks to the Jan 1 checkpoint".
2. **Chart:** grey dots, the ink trend line and end dot, the dashed marker at Monday, and "Oct 5 · 205.9", "This week", "Trend 205.1" (bold ink) under it.
3. **Numbers:** the 2 px ink rule above, 1 px dividers, "7 of 7 / 4 fully on plan", "3 sessions / 2 of 3 planned, Friday missed, plus Tuesday's extra", "7,443 / goal 7,000", and the waist field reading 35.5 with "was 35.75" inside. Change it to 35.4 and tap away: it saves (it is in `waist_logs` after the next sync).
4. **Rocky's take (2A):** the ink card, coral "ROCKY'S TAKE", and WIN, FIX, CALL in `on-ink-2` with paper lines.
5. **How did it feel?:** three rows of Low/Fine/High (Poor/Fine/Great); a tap fills ink, a second tap clears it.
6. **The call:** N3's block, unchanged. Tap the walking pick: the number holds at 2,400 and the grocery link's `kcal` follows.
7. **Next week (3A, 4A):** "NEXT WEEK." in Anton 44; the brass MOVED UP card with "2 lifts this week" and two rows divided in `brass-rule`; the ink-outlined stuck card for the shoulder press with "Hold 45, chase 8, 8 / Rocky's pick" filled ink and "Drop to 40, build back"; the two meal rows with switches and their sublines following the switch; the "Back from rest next week:" chip; the closing line; the grocery card.
8. **Dock:** the 2 px ink rule, "New numbers start Monday morning.", and the 60 px red "FINISH CHECK-IN", always showing while scrolling.
9. **Before the window:** open `/check-in?now=2026-10-28T10:00:00-05:00`. Only the poster, chart and numbers; the waist reads "last measured Oct 25"; the dock reads "Opens Sunday at 5pm." with no button.
10. **Finished:** mark week three finished and look at the read-only page:

```bash
npx wrangler d1 execute rocky-db --local --command "insert into check_ins (week_start, avg_weight, change, adherence, outcome, completed_at, hunger) values ('2026-10-19', 205.1, -0.4, 4, '{\"pick\":\"steps\",\"rest\":[],\"lifts\":[{\"exercise\":\"seated-dumbbell-shoulder-press\",\"plan\":\"drop\"}]}', '2026-10-25T23:00:00.000Z', 'fine')"
```

Open `/check-in?now=2026-10-25T21:00:00-05:00`: Fine is filled for Hunger, the walking pick is chosen, both switches are off, Drop is chosen, and nothing can be tapped except the grocery card. The dock reads "Done. New numbers start Monday morning.", red "BACK TO TODAY", and the quiet "Change my answers", which re-enables everything and brings back "FINISH CHECK-IN".
11. Red appears only on the dock's button and the focus ring. Tab through the page: the red focus ring shows on every control, the waist field included.
12. Run F3's contrast snippet on the page. Expected: `all text passes`.

- [ ] **Step 4: Offline.** In DevTools, go offline and reload `/check-in?now=2026-10-25T18:00:00-05:00`. The whole page opens from the phone's copy.

- [ ] **Step 5: Screenshots for the PR,** saved to the session scratchpad: the week, the call with the walking pick, next week, the finished dock, and before the window.

- [ ] **Step 6: Commit any fixes** from this task, staged by path, with a message naming what was fixed.

- [ ] **Step 7: Put the local data back.**

```bash
npm run seed:demo
npx wrangler d1 execute rocky-core --local --command "update users set password_hash = '<saved hash>' where name_key = 'kameron'"
rm -r "$LOOK"
```

---

### Task 5: Full suite and the PR

- [ ] **Step 1: Run the whole suite once.**

```bash
npm run typecheck && npm test
```

Expected: all green. Fix only the failing files, then re-run those files only.

- [ ] **Step 2: Push and open the PR. Do not merge.**

```bash
git push -u origin v2/p4b-checkin-page
gh pr create --base main --title "Rocky v2 P4b: the one-page check-in" --body-file - <<'MD'
Project 4, rollout step P4b (`docs/superpowers/specs/2026-10-28-checkin-plan-progress-library-design.md`). Plan: `docs/superpowers/plans/2026-10-28-p4b-checkin-page.md`.

- The Sunday check-in is one page on the phone's copy (options 1A to 4A): the week with the trend chart and the waist field, Rocky's rule-written take (Win, Fix, Call), the three taps, N3's call fed by the live hunger tap, and next week with the MOVED UP card, a card per stuck lift (Hold or Drop), the rest switches, "Back from rest next week:" and the grocery link carrying `kcal` and `rest`.
- "Finish check-in" runs `finishCheckIn`, and the page turns finished at once. "Change my answers" reopens it until Monday 3am. Before the window, the dock reads "Opens Sunday at 5pm."
- The waist saves on its own through `logWaist`.
- Shared kit for P4c and P4d: `StatGrid`, `TrendChart`, `LinkCard`, `TapGrid`, `ChoicePair`, and `RockyCard`'s rows. One new token, `brass-rule`.
- Removed: the v1 check-in loader and action, `DaySheet`, `checkInData`, `completeCheckIn`, and their tests. `checkInDone` stays for the reminders.

No migrations.

The calls made: see the top of the plan.

Screenshots: <attach Task 4's>
MD
```

End the body with the attribution lines the build session's harness gives for PR bodies, if any. Cloudflare does not build branches, so the PR has no build check.

- [ ] **Step 3: Report back and wait.** Kameron reviews and merges. Pushing `main` deploys through Workers Builds.

---

### Task 6: Verify on the wire

- [ ] **Step 1: The build landed.** After the merge, confirm the Workers Builds check on the merge commit is green. It can sit "queued"; a normal build takes about a minute.

```bash
gh api repos/kameronpduhon/rocky-the-coach/commits/$(git rev-parse origin/main)/check-runs --jq '.check_runs[] | "\(.name) \(.status) \(.conclusion)"'
```

- [ ] **Step 2: The new check-in is live.** Find the check-in route's chunk through the manifest linked from the login page, and grep it and its imports. Button labels are uppercased by CSS, so the grep ignores case:

```bash
BASE=https://kampduh.com
MANIFEST=$(curl -s $BASE/login | grep -o '/assets/manifest-[A-Za-z0-9_-]*\.js' | head -1)
curl -s "$BASE$MANIFEST" | grep -o '"routes/check-in":{[^}]*' | grep -o '/assets/[A-Za-z0-9_.-]*\.js' | sort -u | while read -r f; do curl -s "$BASE$f"; done \
  | grep -oiE "Finish check-in|Back from rest next week|chase|Change my answers|About 10 minutes, all on one page" | sort | uniq -c
```

Expected: "Finish check-in", "Back from rest next week", "chase" and "Change my answers" each at least once, and no "About 10 minutes, all on one page" (v1's copy). If the new strings are missing, the deploy hasn't landed: check Step 1 again, and if it is stuck, Kameron runs `npm run deploy`.

---

## Self-review

- **Spec coverage (rollout step 2):** the one-page check-in on the store with the take, taps, call, stuck cards, rests and `finishCheckIn` (Tasks 2, 3); the grocery link with `rest` and `kcal` (Task 2); the shared kit the check-in uses (Task 1); removed: the v1 loader and action, `DaySheet`, `checkInData`, `completeCheckIn` (Task 3); `checkInDone` stays (Task 3, Step 5). Testing section, "The check-in model": the window's week, before the window, finished from `outcome`, the poster lines and the Lifts subline, rest defaults at 3 and 4 and back from rest, the grocery count from the preview (Task 2).
- **Names match P4a and the spec:** `finishCheckIn { week, at, pick, hunger, energy, sleep, rest, lifts }` (the page's `FinishArgs` plus `at`), `logWaist { date, inches }`, the window from `checkInWindow`, Monday 3am from `mealDate`.
