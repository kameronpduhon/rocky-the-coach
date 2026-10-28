# Rocky v2, project 4: Check-in, Plan, Progress, Library

Status: approved design, 2026-10-28. Next step: the P4a implementation plan.

This is project 4 of the five-project rebuild. Foundation, Workouts and the Nutrition engine are live at kampduh.com, and N3 (the engine makes the call) lands before this project starts.

| # | Project | Ships |
|---|---|---|
| 1 | Foundation | Done |
| 2 | Workouts | Done |
| 3 | Nutrition engine | Done once N3 merges |
| **4** | **Check-in, Plan, Progress, Library** (this spec) | The one-page Sunday check-in, Groceries, Plan, Progress with every lift's history, the Library tab, and the switch to SPA mode |
| 5 | Rocky's AI | Rocky's take written by the AI, Tell Rocky, describe-a-meal, barcode and label, memory, AI switch |

## Source material

| Source | What it holds |
|---|---|
| Mocks, https://claude.ai/artifact/65WeReuGH5ZageJng9K6nq | Artboards `CheckInWeek`, `CheckInCall`, `CheckInNext`, `Plan`, `Progress`, `LibraryMeals`, `LibraryExercises` |
| Option board, https://claude.ai/artifact/Ke3qgxSC3uQFwGKCJpsKSU | Seven open questions drawn in the real look. Picked: A in every band (1 one page, 2 rule-written take, 3 stuck-lift card, 4 rests only, 5 groceries by aisle, 6 lifts by body part, 7 a full lift page). Band 9 lists where the mocks and the real data disagree |
| Research doc, https://claude.ai/artifact/H8VHSWMYpddc5ShcTbSVhD | "Check-ins and voice" (one win, one fix, the plan; the digest), and the rule-level upgrades (taps, stall callouts) |
| `docs/design/system.md` | The Corner design system. Where it and a mock disagree on looks, the mock wins, except the colour rules |
| `docs/superpowers/specs/2026-10-27-foundation-design.md` | The sync layer, named changes, and the note that SPA mode comes in this project |
| `docs/superpowers/specs/2026-10-27-workouts-design.md`, `docs/superpowers/specs/2026-10-27-nutrition-design.md` | Progression, the feel tap, the engine, the `CheckInCall` block and its why-line copy |
| `app/routes/{check-in,plan,progress,library,groceries,settings,app-layout,login,logout,media,meal}.tsx`, `app/routes/api.*.ts`, `app/server/*` | v1 behaviour, and every server loader and action this project removes |

Where a mock's numbers differ from real data, real data and this spec's math win. The mocks were drawn before the content and the engine were settled. For example:
- Rice is 175 g at 2,300, not the mock's 185.
- The lift is "Seated dumbbell shoulder press", not "Shoulder press", and "Lying leg curl", not "Leg curl".
- A real grocery week has about 37 items, not 24.
- The plan has 21 lifts and the library 49 exercises, not 22.

`Rocky` in the copy below is `COACH_NAME` and the app's name is `APP_NAME`, both from `app/brand.ts`.

## Decisions this spec rests on

- **The check-in is one scrolling page** in the mock's order: the week, the call, next week. "Finish check-in" stays docked the whole way down, under "New numbers start Monday morning."
- **Rocky's take is rule-written until project 5,** and whenever the AI is off or offline. It sits in the dark Rocky card as three lines labelled Win, Fix and Call, built from the week's real numbers. It is a pure `ruleTake(digest)`. Project 5 hands the same `digest` to the AI and replaces only the text.
- **A stuck lift gets its own ink-outlined card** below the brass MOVED UP card, with two choices: "Hold 45, chase 8, 8" (Rocky's pick) and "Drop to 40, build back".
    - **Stuck** means the same top weight and no more total reps across 3 sessions in a row of that lift. Deload weeks are ignored: they neither count nor break the run.
    - **Drop back** is about 10% lighter, rounded to the lift's increment (45 lb becomes 40), for the next session only. Normal progression then runs from there. A small new synced table holds the one-session override.
- **No meal swaps on the check-in.** It shows "Meals you ate 3 times or more" with rest switches, and a "Back from rest" chip line. Swaps happen on Today and the Meal screen.
- **Meal rest defaults:** eaten 4 or more times last week rests 2 weeks; eaten 3 times stays in. The switch flips either way.
- **Hunger, energy and sleep taps are stored on `check_ins`.** Only "Hunger: High" two Sundays running changes anything: a planned cut becomes the steps option, through a `hungry` flag into `nextTarget`. Energy and sleep are recorded and shown, and drive nothing.
- **Groceries are grouped by aisle,** with check circles and an "n of m" header.
- **"All lifts" on Progress groups lifts by body part,** with each one's best set. A tap opens that lift's page: best sets, set history, swaps.
- **A Library exercise row opens the same lift page.**
- **Plan, Progress and Library meals are built as the mocks,** with real data.
- **Progress photos stay v1:** a reminder date only. Photos stay on the phone.
- **Catherine (no plan):** Library works for her. Check-in, Plan, Progress and Groceries redirect to Today, as Foundation does.
- **Conventions, settled:**
    - Every screen here is loaderless. It reads the phone's copy through a pure `app/<screen>/model.ts`, as `app/meal/model.ts` does.
    - Every write is a named mutator. Finishing the check-in is one `finishCheckIn`. Waist and grocery checks become mutators.
    - Server-only needs move to Worker endpoints in `workers/app.ts`, ahead of the app handler.
    - SPA mode (`ssr: false`) is the last rollout step, once no route has a server loader or action.
- **The `CheckInCall` block is N3's.** This project places it on the new page and feeds it from the phone's copy. It does not redraw it.
- **Out of scope:**
    - Anything AI (project 5). The take's text is the only part project 5 swaps.
    - Photo storage. Catherine's plan.
    - Editing a past week's check-in. Viewing old check-ins.
    - Dark mode.

## Calls made in this spec

Product gaps the decisions did not cover. Each is the option most consistent with them; flag any to change.

1. **Finishing can be redone until Monday.** As in v1, a finished check-in can be changed until the new week starts (Monday 3am, `mealDate`'s rule). The finished page shows the saved choices with a quiet "Change my answers" link. Running `finishCheckIn` again for the same week replaces that week's `check_ins` row, targets, rests and lift plans; slots already eaten, skipped or swapped stay. After Monday 3am the page is read-only.
2. **The server recomputes the call.** `finishCheckIn` carries only the person's choices (pick, taps, rests, lift plans). Every number is worked out again from the synced rows, so a stale phone can't set a target. Where the two copies differ, the server's numbers win and show after the next pull.
3. **Waist saves on its own** through `logWaist`, dated the Sunday of the week under review, as soon as the field is committed. It is not part of `finishCheckIn`.
4. **The taps start empty and are optional.** Tapping the chosen one clears it. Choices made on the page (taps, pick, switches, lift plans) live only in the page until Finish.
5. **Stuck, exactly:**
    - Take the lift's last three sessions with logged sets, skipping deload weeks.
    - It is stuck when all three have the same top weight, and the second and third each total no more reps than the first.
    - The third session must fall in the week under review.
    - Lifts that moved up this week, and body-weight lifts, are never stuck.
    - "Chase" repeats the best set's reps from this week's session once per set: "chase 8, 8".
6. **Drop weight:**
    - 90% of the top weight, rounded to the nearest increment.
    - At least one increment below the top, and never below one increment.
    - The override holds until that lift's next logged session on or after next Monday, however many weeks that takes.
    - The gym's last-time line explains it in plain ink, not brass, because a drop is not progression.
7. **Hungry only moves Rocky's pick.** It applies when the call is a cut and the steps option exists (steps under 10,000). At 10,000 steps the cut stands. A new why-line says so.
8. **"Back from rest next week:"** names meals that were resting at some point in the week under review and are back in rotation by next Monday. The line is hidden when there are none.
9. **Next week's meals are written at Finish.** They are regenerated with the chosen rests, keeping any slot already eaten, skipped or swapped. This matters when the check-in is finished on Monday morning.
10. **Before the window opens** (Monday noon to Sunday 5pm), `/check-in` shows the week so far: the poster, chart and numbers. The take, taps, call and next week are hidden, and the dock shows only "Opens Sunday at 5pm." Plan's Sunday row always links to it.
11. **Copy the mocks don't give:**
    - The poster's second line when weight rose, held or has no trend.
    - The Lifts cell's subline.
    - Plan's rows for a missed workout, a relaxed day and a finished check-in.
    - The Plan targets' sublines.
    - The Progress pace line.
12. **Plan's future days open a day sheet:** the lift list, with v1's "Move to another day" or "Train this day". A past missed workout opens the workout screen to log it.
13. **The Jan 1 goal (195 to 198) moves into `plan.json`** as `goal`, so Progress can read it.
    - Pace comes from the last 4 weeks of trend.
    - The line reads "On pace.", "Ahead of pace." or "Slower than pace." Never "behind".
14. **Progress keeps a way to fix a weigh-in:**
    - A quiet "Fix a weigh-in" link opens v1's weigh-in sheet, restyled.
    - v1's "recent workouts, tap to fix" list goes. Each session row on a lift page opens that day's workout instead.
15. **Progress numbers:**
    - STRONGER shows the top 4 lifts by pounds gained since the phase start.
    - "Protein a day" averages tracked days.
    - The streak line changes if there has ever been a double miss.
16. **"All lifts" counts** the lifts in the plan's gym and extra workouts, after always-swaps, plus any other exercise with sets since the phase start. That is 21 today.
17. **The 9 content muscle groups fold into the mock's 5 body parts** through a `BODY_PART` map:
    - Chest.
    - Back.
    - Shoulders: shoulder press, side delts, rear delts.
    - Arms: biceps, triceps.
    - Legs: quads, hamstrings.
18. **The lift page lives at `/lift/:id`** and works for Catherine. With no history it says so.
19. **Library details:**
    - Chest is open by default, and the other body parts are collapsed. The "Swaps:" line expands its rows.
    - Lunch and dinner shows 3 meals, then "Show all 8". Every list is alphabetical.
    - "Saved off-plan" expands to the usual orders, each with a Log that runs `logUsual` for today. Removing a usual stays in Today's sheet.
    - Without a plan, meals show recipe grams, and exercises have no "in plan" split.
20. **Groceries:**
    - The check-in's preview link carries the chosen calories (`kcal=`), so the list is at next week's grams before Finish.
    - A checked circle is ink, not red.
    - Rice keeps a "Cooked weight" subline.
21. **SPA serving:**
    - The Worker runs first for every request. It does the https redirect, answers `/api/*` and `/media/*`, and hands everything else to the static assets with the single-page fallback.
    - API paths phones already call keep their paths.
    - A `*.data` request from an old cached build gets a 404, and the root error boundary offers "Reload".
22. **SPA mode splits into two steps.** P4e moves every server need to Worker endpoints while SSR is still on. P4f flips `ssr: false`. Each step deploys and works on its own.

## 1. The check-in's rules

All pure, in `app/domain/` and `app/checkin/`. The phone runs them for the page, and the server runs the same functions inside `finishCheckIn`.

### The call over the phone's copy (`app/checkin/engine.ts`)

- `weekCall(rows, monday, { hungry })` returns N3's `Call` for the week under review, plus what the `CheckInCall` block shows:
    - the `EnergyWeek`
    - the why-lines
    - "On your scale from Monday"
- It reads `weigh_ins`, `meal_logs`, `targets`, `steps_daily` and `check_ins` through the `Rows` reader that Today and the meal screen use.
- If N3 wires the engine through Drizzle on the server, P4a lifts that wiring into this pure function. It keeps the same inputs and outputs, and N3's tests move with it.
- `rows` is the phone's store on the page. Inside a mutator, it is a snapshot of the `Tx` scans of those five tables.

### Hungry (`nextTarget` in `app/domain/energy.ts`)

- **`CallInput` gains `hungry: boolean`.** It is true when this check-in's hunger tap is High and the previous week's `check_ins.hunger` is `high`. A skipped check-in last week breaks the run.
- **When `hungry` and the call is a cut** (`kind: "cut"`, or the half-portions guardrail) and the steps option exists:
    - `pick` becomes `"steps"`.
    - The steps option becomes Rocky's pick, and the calorie cut becomes the alternative.
    - Nothing else in the call changes.
- **New why-line**, added after the others: "You were hungry two Sundays running, so Rocky picks steps over less food."
- **When `hungry` and the step goal is already 10,000:** the cut stands, and no line is added.
- **Hold, on-pace, raise and maintenance calls** ignore `hungry`.

### Stuck lifts (`app/domain/stalls.ts`)

`stuckLifts(sessions, weekStart, weekEnd)` takes, per exercise, its sessions with logged sets in date order. Each session has a date, its sets, and whether it fell in a deload week. It returns:

```
{ exercise, top: number, lastSets: LoggedSet[], chase: number[], drop: number }
```

The rule is call 5 above:
- `chase` is this week's best set's reps, repeated once per set for next week (`setsFor`).
- `drop` is `dropWeight(top, increment)`:
    - `max(increment, min(top − increment, round(top × 0.9 / increment) × increment))`.
    - For example, 45 lb with a 5 lb increment gives 40, and 15 lb gives 10.

### Drop back (`app/domain/progression.ts`)

- **`withDrop(suggestion, drop, lastSessionDate)`:**
    - When a `lift_drops` row exists for the exercise and no session of it has been logged on or after the row's `from_date`, the suggestion is `{ weight: drop.weight_lb, goUp: false }`.
    - Otherwise the suggestion passes through unchanged.
- **Every reader of `nextSuggestion` applies it:** Today's training model and the workout model. After the first session at the dropped weight, `nextSuggestion` runs on that session as usual.
- **The gym's last-time line for a dropped lift** is in plain ink, not the brass callout: "<Last Wednesday: 45 × 8, 7>. Dropped to 40 at Sunday's check-in. Build back from here."

### Meal repeats and rests (`app/checkin/meals.ts`)

- **Repeats** are planned logs (`category = "planned"`, with a slug) in the week under review, counted per meal. Meals eaten 3 or more times are listed, most first, then by name.
- **The rest switch** starts on for a count of 4 or more, and off for 3.
- **A rest** sets `meal_state.rested_until` to next Monday + 13 days, which is two full weeks, as v1 does.
- **Back from rest:** meals whose `rested_until` falls on or after this Monday and before next Monday.
- **Next week's plan, as the page previews it:** `previewWeek` with this week's `lastEaten`, the meals already resting next Monday, and the switches that are on. The grocery count reads this preview.

### The digest (`app/checkin/digest.ts`)

`buildDigest(rows, monday, choices)` gathers every number the week page shows, in one object. `ruleTake` reads it now; project 5 sends it to the AI. Every number the take prints comes from here, which is the guardrail project 5 checks against.

```ts
interface CheckInDigest {
  week: { monday: ISODate; sunday: ISODate; number: number; weeksToCheckpoint: number };
  weight: { trend: number | null; change: number | null; sinceStart: number | null; firstDate: ISODate | null; firstWeight: number | null };
  days: { counted: number; full: number; tracked: number };
  protein: { avg: number | null; target: number; lowDay: { date: ISODate; grams: number } | null };
  steps: { avg: number; goal: number; lowDay: { date: ISODate; steps: number } | null };
  intake: { avg: number | null };
  lifts: {
    planned: number; plannedDone: number; extras: ISODate[]; missed: ISODate[];
    movedUp: { exercise: string; name: string; from: number; to: number }[];
    stuck: { exercise: string; name: string; top: number; lastSets: LoggedSet[]; chase: number[]; drop: number }[];
    nextWeekDeload: boolean;
  };
  waist: { now: number | null; was: number | null; wasDate: ISODate | null };
  desserts: { offPlan: number; allowance: number };
  feel: { hunger: "low" | "fine" | "high" | null; energy: "low" | "fine" | "high" | null; sleep: "poor" | "fine" | "great" | null; hungryTwice: boolean };
  call: Call & { state: BurnState; burn: number; steadyBy: number | null; trackedDays: number; currentKcal: number };
  meals: { repeats: { slug: string; name: string; count: number; rest: boolean }[]; backFromRest: string[] };
}
```

- **Averages:**
    - `protein.avg` is over tracked days.
    - `steps.avg` is the 7-day sum over 7, as v1 does.
    - Both low days pick from days that have data.
- **`days.full`** uses `fullDay` from `app/domain/habits.ts`.
- **`lifts.movedUp`** is the workout model's moved-up rule, applied to each lift's latest session in the week.

### Rocky's take (`app/checkin/take.ts`)

`ruleTake(digest)` returns `{ win, fix, call }`. Each line takes the first case that applies. Numbers print as the screens print them: thousands with commas, weight to 0.1 lb.

**Win:**

| Case | Line |
|---|---|
| 7 of 7 counted, and protein avg within 5 g of target or over | "Seven of seven days counted, and protein averaged 178 g against 180." |
| 2 or more lifts moved up | "Three lifts moved up. Pec deck goes to 135 lb." (the first in the moved-up list) |
| Every planned workout done | "All 3 workouts done." |
| Steps avg at or over goal | "Steps averaged 8,620, over the 8,500 goal." |
| Waist down since the previous measurement | "Waist is down 0.25 in since Oct 18." |
| Trend down this week | "Trend down 0.4 lb this week." |
| Otherwise | "5 of 7 days counted." |

**Fix:**

| Case | Line |
|---|---|
| Steps avg under goal | "Steps averaged 8,120, short of 8,500. Saturday was the low day at 5,900." |
| Under 4 days tracked in full | "Only 3 days were closed out in full. Close out each night so the burn can update." |
| Protein avg more than 10 g under target | "Protein averaged 165 g against 180. Thursday was the low day at 120 g." |
| A planned workout missed | "Friday's workout was missed. Get the next one in." (two or more: "2 workouts were missed. Get the next one in.") |
| A stuck lift | "Seated dumbbell shoulder press is stuck at 45 lb. Pick a plan for it below." |
| Off-plan desserts over the allowance | "3 off-plan desserts against the 2 allowed." |
| Otherwise | "Nothing to fix. Run it back." |

**Call** (Rocky's pick, not the radio the person has chosen):

The lead is "Trend down 0.3 lb.", "Trend up 0.2 lb." or "Trend flat." (under 0.05). It is left out when there is no trend.

| Call | Line after the lead |
|---|---|
| Cut, pick calories | "Burn is near 2,580, so calories go to 2,300 from Monday." |
| Cut, pick steps (half portions) | "Food is at half portions, so Rocky picks 9,500 steps over less food." |
| Cut, pick steps (hungry) | "You were hungry two Sundays running, so Rocky picks 9,500 steps over less food." |
| On pace while settling | "The burn estimate settles by week 5, so 2,300 holds one more week." |
| On pace | "Right on pace, so 2,300 holds." |
| Raise | "Faster than 1 lb a week, so calories go up to 2,450." |
| Hold, few tracked days | "Only 3 days were tracked in full, so 2,400 holds one more week." |
| Hold, first two weeks | "Two weeks of weigh-ins come first, so 2,400 holds." |
| Hold, fast-loss guardrail | "You lost over 2 lb two weeks running, so 2,400 holds." |
| Hold, floor | "2,000 is the floor, so it holds." |
| Maintenance next week | "Maintenance week next: 2,600 a day, your burn." |

## 2. Data

### Migration (P4a)

Two files at the next free numbers after N3's (`0010` and `0011` if N3 adds none), in the N1 pattern:

- **`<n>_checkin_data.sql`** (drizzle-kit):
    - `check_ins` gains `hunger`, `energy` and `sleep`, all nullable text. v1 rows keep null.
    - The new table `lift_drops`:

| Column | Notes |
|---|---|
| `exercise_id` | Primary key. One override per lift; a later drop replaces it |
| `weight_lb` | Real. The weight for the next session |
| `from_date` | The Monday it starts |
| `created_at` | ISO time |

- **`<n>_checkin_sync.sql`**: triggers for `lift_drops`, generated with `scripts/gen-sync-triggers.ts`. `check_ins` keeps its triggers, since adding columns doesn't touch them.

Kameron runs both remote migrations.

### Synced tables

- `app/sync/tables.ts` gains `{ name: "lift_drops", ...cols("exercise_id") }`.
- `waist_logs`, `grocery_checks`, `check_ins`, `targets`, `meal_state` and `planned_meals` already sync.
- **`SYNC_SCHEMA` stays at 3.** No row key changes, and the new table starts empty, so no phone needs a fresh snapshot. A phone holding an older copy receives `lift_drops` rows as deltas.

### Content

- **`plan.json` gains `goal`:** `{ "date": "2027-01-01", "low": 195, "high": 198 }`. `PlanSchema` requires it, and Plan and Progress read the checkpoint date from it.
- **`app/content/index.ts` gains `BODY_PART`,** the map from the 9 groups to the 5 body parts (call 17). Lists use the order Chest, Back, Shoulders, Arms, Legs.

### Where the week's plan is made

Today's layout loader runs `ensureWeekPlan` now. That loader goes in P4e, so the plan is made in three places:

- **Pull:** `/api/sync/pull` runs `ensureWeekPlan` for this week (by `mealDate`) before reading, for a user with a plan. This lands in P4a, beside the layout loader's call.
- **Cron:** the 5-minute cron does the same for each user with a plan, so Monday's plan exists before anyone opens the app. This lands in P4a.
- **Finish:** `finishCheckIn` writes next week's plan.

A skipped check-in leaves next week to pull and cron, with v1's defaults.

### Named changes

New mutators in `app/sync/mutators.ts`:

| Mutator | What it does |
|---|---|
| `finishCheckIn { week, at, pick, hunger, energy, sleep, rest, lifts }` | The whole Finish in one change (below). `pick` is `calories` or `steps`. `rest` lists slugs to rest. `lifts` is `[{ exercise, plan: "hold" \| "drop" }]` |
| `logWaist { date, inches }` | Puts `waist_logs` for that date. Inches 20 to 60, kept to two decimals. Refused for a future date |
| `checkGrocery { week, food, checked }` | Puts or deletes `grocery_checks` (`week_start`, `food_id`). Refused for a food not in `foods.json` or a week that isn't a Monday |

Labels for refusal notices: "Check-in", "Waist", "Grocery check". `moveWorkout`, `editWeighIn`, `deleteWeighIn` and `logUsual` already exist and are reused.

**`finishCheckIn`, in order:**

1. **Checks:**
    - `at` passes the workout time bounds: 5 minutes ahead, 2 days behind.
    - `week` must be the week `checkInWindow(at)` names. Otherwise: "That week's check-in has closed."
    - No `check_ins` row may exist for `week`. Otherwise: "That check-in is already finished."
2. **The call:** `weekCall` runs on the scanned rows. `hungry` comes from the args and last week's row. The args never carry a number.
3. **Targets:** puts `targets` effective `week + 7`:
    - `pick` is `steps` and the call has a steps option: today's calories and the steps option's goal.
    - Otherwise: the call's calories and step goal.
    - Protein stays as it is.
    - A maintenance call keeps the base calories and takes the ramped step goal, as N1 says.
4. **The `check_ins` row:**
    - `avg_weight` and `change` hold trend values. `adherence` is the full-day count.
    - `burn`, `burn_state`, `intake_avg` and `tracked_days` come from the engine.
    - `hunger`, `energy` and `sleep` come from the args. `completed_at` is `at`.
    - `outcome` is JSON: `{ call, pick, rest, lifts }`. The finished page reads its saved state from it.
5. **Rests:** for each slug in `rest` that is in the library, puts `meal_state.rested_until` = `week + 20`, keeping `photo_key`.
6. **Drops:** for each `lifts` entry with `plan: "drop"` whose exercise is stuck by the scanned rows, puts `lift_drops` with that lift's `drop` weight and `from_date` = `week + 7`. Other entries are ignored.
7. **Next week's meals:**
    - `generateWeek` for `week + 7`, with `lastEaten` from the scanned logs and the rested set after step 5.
    - It replaces that week's `planned_meals` rows.
    - It keeps any row whose slot already has a planned or skipped log, or that is marked swapped.

### v1 writers until they go

The v1 check-in action keeps working through P4a. It still calls N3's server path, so P4a only adds columns it doesn't write. It is removed in P4b.

## 3. Screens

### Shared kit (`app/ui/`)

| Piece | Job |
|---|---|
| `StatGrid` | The ruled grid of label, big number and subline: the check-in's 2 × 2, Plan's targets row (3), and Progress's body pair and showing-up row |
| `TrendChart` | Dots for weigh-ins, the trend line, an end dot. Optional dashed marker and goal band. Used by the check-in and Progress |
| `Sparkline` | Top weight per session, last point in ink. Used by All lifts |
| `LinkCard` | 1.5 px ink outline card with an icon, title, subline and chevron. Used for groceries on Plan and the check-in |
| `TapGrid` | Label plus three choices, ink when chosen, tap again to clear. Used for How did it feel? |
| `RockyCard` | Gains a `rows` form: bold Semi Condensed label (WIN, FIX, CALL) and a paper line per row |
| `ChoicePair` | The system's choice pair with a subline. Used by the stuck card |

### Check-in (`/check-in`; mocks `CheckInWeek`, `CheckInCall`, `CheckInNext`; options 1A, 2A, 3A, 4A)

- **Loaderless,** model in `app/checkin/model.ts`. The tab bar is hidden.
- **Which week:** the window's week (`checkInWindow(now)`). Otherwise the current week so far (call 10).
- **One page:** in `GymFrame`, with the dock always showing.

**The week:**

- **Header:**
    - The back icon button goes to Today.
    - "SUNDAY CHECK-IN · NOV 1" (that week's Sunday).
- **Poster:**
    - First line: "Week 4."
    - Second line:
        - "Down 0.3." or "Up 0.2." (the weekly trend change).
        - "Steady." under 0.05.
        - "No trend yet." under 3 weigh-ins.
    - Meta: "Oct 26 to Nov 1 · 9 weeks to the Jan 1 checkpoint". The meta says "1 week to the Jan 1 checkpoint" in week 12 and "Checkpoint week" in week 13.
- **Chart:** `TrendChart` from the phase start to Sunday, with a dashed marker at this Monday. Labels under it: "Oct 5 · 207.0" (first weigh-in), "This week", and "Trend 205.3" in bold ink.
- **Numbers (`StatGrid`, 2 × 2):**

| Label | Number | Subline |
|---|---|---|
| Days that counted | "7 of 7" | "6 fully on plan" |
| Lifts | "4 sessions" ("1 session") | "3 planned, plus Tuesday's extra" · "plus 2 extras" · "All 3 planned" · "2 of 3 planned, Friday missed" · "1 of 3 planned, 2 missed" |
| Steps, daily average | "8,120" | "goal 8,500" |
| Waist, inches | A field, prefilled with this week's entry | "was 35.5" (the entry before it; hidden when none) |

The waist field commits on blur or Done and runs `logWaist` for that Sunday. Before the window opens, the cell shows the latest entry read-only, with "last measured Oct 25".

- **Rocky's take:** `RockyCard` labelled "ROCKY'S TAKE", with the three rows from `ruleTake`:
    - WIN
    - FIX
    - CALL
- **How did it feel?** Section head "HOW DID IT FEEL?", with three `TapGrid` rows:
    - Hunger: Low, Fine, High
    - Energy: Low, Fine, High
    - Sleep: Poor, Fine, Great

  Under them: "Two hungry weeks in a row and Rocky picks extra steps over cutting food." The call below reacts to the hunger tap as it changes.

**The call:**

- **N3's `CheckInCall` block,** unchanged:
    - THE CALL.
    - the number
    - Protein and Steps
    - Why
    - the state note
    - Your pick
    - On your scale from Monday
- **It is fed by `weekCall`** with the live `hungry` flag. The hungry why-line joins Why when it applies.

**Next week:**

- **Head:** "NEXT WEEK." (Anton 44 with the 2 px rule).
- **Lifts:**
    - **MOVED UP card (brass):**
        - Tag "MOVED UP" and "3 lifts this week" ("1 lift this week").
        - Rows like "Pec deck · 130 → 135 lb".
        - Hidden when nothing moved up.
    - **Stuck card:** one per stuck lift, ink outline.
        - Title "Seated dumbbell shoulder press is stuck".
        - Line "45 × 8, 7 three sessions running."
        - `ChoicePair`:
            - "Hold 45, chase 8, 8", subline "Rocky's pick". Starts selected.
            - "Drop to 40, build back".
    - **Nothing moved up and nothing stuck:** "No lift moved up this week. Same weights, beat the reps."
    - **Next week is the deload:** the moved-up card and stuck cards give way to "Next week is the deload: one set a lift at the same weights."
- **Meals you ate 3 times or more:**
    - **Rows:** the meal name, a switch, and the subline "4 times · rests 2 weeks" or "3 times · staying in". The subline follows the switch.
    - **No repeats:** "No meal came up 3 times this week."
    - **Back from rest:** "Back from rest next week:" followed by ink-outlined chips, one per meal.
    - **Closing line:** "Swap any meal on Today or its meal screen."
- **Groceries:** `LinkCard` "Grocery list is ready", with the subline "37 items for Nov 2 to 8".
    - The count is the preview week's foods.
    - It opens `/groceries?week=<next Monday>&from=check-in&kcal=<picked calories>&rest=<slug>...`.

**Dock:**

| State | Dock |
|---|---|
| Window open, not finished | "New numbers start Monday morning." and red "FINISH CHECK-IN". Tapping runs `finishCheckIn` and the page turns finished in the same frame |
| Finished | "Done. New numbers start Monday morning." and red "BACK TO TODAY". The page shows the saved call, taps, switches and lift plans from `check_ins`. Until Monday 3am a quiet "Change my answers" link reopens the choices and the dock returns to "FINISH CHECK-IN" |
| Before the window | "Opens Sunday at 5pm." and no button |

### Groceries (`/groceries`; option 5A)

- **Loaderless,** model in `app/groceries/model.ts`. The tab bar is hidden.
- **Which week:**
    - `?week=` (a Monday), or this week.
    - The meals are that week's 35 `planned_meals` rows when they exist.
    - Otherwise, for a future week, the preview from `?rest=` (rests) and `?kcal=` (grams), built as the check-in builds it.
- **Grams:**
    - A planned week uses the factor of that week's target.
    - A preview uses `factorFor(kcal)`.
    - Totals use v1's `buildGroceryList` and `friendlyGrams`.
- **Header:**
    - The back icon button goes to Plan, or to the check-in with `from=check-in`.
    - "WEEK OF NOV 2".
- **Title:** "Groceries.", then "12 of 37" as a big number, with "in the cart · at 2,300 cal".
- **Preview note** (future week, not yet planned): "Built from next week's meals as the check-in has them. It updates when you finish."
- **Sections in aisle order:** Meat and seafood, Dairy and eggs, Produce, Pantry. Each has an Anton head and a "3 of 7" note.
- **Rows:**
    - A 44 px check circle (ink with a paper check when on), then the food name.
    - A subline when there is one:
        - "About 24 eggs" (v1's `each`).
        - "Cooked weight" for foods whose state is cooked.
    - The grams on the right, as "1,400 g".
- **Checking:** a tap runs `checkGrocery`. A checked row stays in place, muted.
- **Empty:** "No meals planned for this week yet."

### Plan (`/plan`; mock `Plan`)

- **Loaderless,** model in `app/plan/model.ts`. The tab bar shows.
- **Poster:** "Week 4 / of 13.", meta "Oct 26 to Nov 1 · Phase 1 ends Jan 1".
- **Phase strip:**

| Week | Cell |
|---|---|
| Done | Ink fill |
| This week | 2.5 px red outline, red number (live state) |
| Ahead | `border` outline |
| Deload | Hatched |
| Maintenance | `well` tint |
| Checkpoint | 2 px ink outline with the flag |

Legend: "Wk 8 deload, Nov 23", "Wk 12 maintenance, Dec 21", "Wk 13 checkpoint, Jan 1". Each date is that week's Monday, and the checkpoint's is `goal.date`.

- **Targets (`StatGrid`, 3 across):**

| Label | Number | Subline |
|---|---|---|
| Calories | This week's target | "from the check-in" when a check-in set it · "maintenance week" · "starting target" |
| Protein | "180 g" | "every day" |
| Steps | The goal | "up 500" (vs the previous targets row) · "same as last week" · "starting goal" |

- **THE WEEK:** one row per day, Monday first. Each has the weekday in Semi Condensed, a title and a subline.

| Day | Title · subline | Tap |
|---|---|---|
| Past workout, done | "Chest, back, arms" · "Done · 2 lifts moved up" (or "Done"), ink check | That day's workout (Done screen) |
| Past workout, not logged | Title · "Not logged · tap to log it" | `/workout?date=` |
| Past rest day | "Rest" · "Arms and back extra, skipped", or "Arms and back extra · Done" with a check | The extra's day, when done |
| Today, workout | Raised row, 2 px red rule above, red weekday: "Legs, shoulders" · "Today · noon · 6 lifts" (+ ", edited" when the day's lifts differ from the template; "Today · done · 2 lifts moved up" once finished) | `/workout` |
| Future workout | Title · "Noon · 6 lifts · tap to change" | Day sheet |
| Future rest day with the extra | "Rest" · "Optional: arms and back extra, 30 min" | Day sheet |
| Weekend day | "Rest · weekend meals" · the weekend-only mains planned that day ("Steak salad, chicken fajita bowl"), or "Restaurant meal fits, protein first" | None |
| Relaxed day | "Relaxed day" · "Counts no matter what" | None |
| Sunday | "Rest · weekend meals" · "Check-in opens at 5pm" · "Check-in is open" · "Check-in done" | `/check-in` |

- **Day sheet:** the workout's lifts with sets and reps, then v1's `MoveSheet` actions:
    - "Move to another day" from a workout day.
    - "Train this day" from a rest day.

  Both run `moveWorkout`.
- **Groceries:** `LinkCard` "This week's groceries", subline "34 of 37 checked off".

### Progress (`/progress`; mock `Progress`)

- **Loaderless,** model in `app/progress/model.ts`. The tab bar shows.
- **Poster:**
    - "Down 1.7." (trend now minus the phase's first weigh-in; "Up 0.4." when up).
    - Second line: "On pace.", "Ahead of pace." or "Slower than pace.".
        - The projection is the trend now plus the average weekly trend change over the last 4 weeks, times the weeks to `goal.date`.
        - On pace means it lands in the goal range. Under the range is ahead, and over it is slower.
    - Meta: "Trend 205.3 lb · Jan 1 goal 195 to 198".
    - Under 3 weigh-ins: "Progress. / No trend yet." and the meta "The trend needs 3 weigh-ins."
- **WEIGHT:**
    - Section head with a joined choice: 4W, PHASE (default), ALL.
    - `TrendChart`, with the goal band on PHASE.
    - Labels: "Oct 5 · 207.0", "Today 205.3" (bold), "Jan 1 · 195 to 198".
    - Note: "Dots are daily weigh-ins, the line is the trend. At this pace you land near 197 on Jan 1. Waist matters more during a recomp."
    - Then the quiet link "Fix a weigh-in". It opens a sheet listing the last 10 weigh-ins, each editable or deletable through `editWeighIn` and `deleteWeighIn`.
- **Body (`StatGrid`, 2 across):**
    - **Waist:** "35.5 in", with "down 0.25 since Oct 11" (vs the first entry), or "Measure at the check-in" when there are no entries.
    - **Photos:** "Nov 8", with "next set, front side back" (v1's `nextPhotoDate`). On the day itself: "Today", with "front, side, back. They stay on your phone."
- **STRONGER:**
    - The 4 lifts with the most pounds gained, from their first session top weight since the phase start to their latest.
    - Each row: name, muted "250 →", then "280".
    - Hidden until a lift has gained.
    - Then the quiet link "All 21 lifts, best sets and history" to `/progress/lifts`.
- **SHOWING UP (`StatGrid`, 3 across):**
    - "24 of 24" with "days counted". Today joins once it counts.
    - "11 of 10" with "workouts, plus extras". Without extras the label is just "workouts".
    - "176 g" with "protein a day".
    - Then: "Never missed twice in a row. That's the streak that matters." when there has been no double miss since the phase start. Otherwise: "18 days since the last double miss. Never miss twice."

### All lifts (`/progress/lifts`; option 6A)

- **Loaderless,** model in `app/lifts/model.ts`. The tab bar is hidden.
- **Header:** back to Progress, "PROGRESS".
- **Title:** "All 21 lifts.", with "Best set, and gain since Oct 5".
- **Body parts:** one section each, as Anton heads with a count.
- **Rows:**
    - The name, with the subline "Best 55 × 9 · Mon". Days are Mon, Wed, Fri and Extra, or "Swap" for lifts outside the plan.
    - A `Sparkline` of the top weight in the last 4 sessions.
    - The gain, "+10" or "0".
    - Body-weight lifts show reps: "Best 8 reps" and "+2".
- **A tap** opens `/lift/<id>?from=progress`.

### Lift page (`/lift/:id`; options 6A after a tap, 7A)

- **Loaderless,** in `app/lifts/model.ts`. The tab bar is hidden.
- **Header:**
    - Back to Library or All lifts, from `?from=`.
    - The header reads "LIBRARY · CHEST" or "ALL LIFTS · CHEST".
- **Title:** "Pec deck."
- **Meta:** "Machine · Monday · 8 to 12 reps".
    - The day names list each plan workout that uses the lift, with the extra as "the extra".
    - The reps are the first such workout's range.
    - A lift outside the plan reads "Cable · Swap for chest".
- **Photos:** Start and Finish, from `exerciseImage(ex, 0)` and `exerciseImage(ex, 1)`.
- **Best set:**
    - The heaviest weight, then the most reps at it: "130 × 12 lb".
    - The brass "GO UP" tag when the next session's suggestion goes up.
    - Opposite it: "up 10 lb since Oct 5".
- **Chart:** top weight per session, dated under the line.
- **HISTORY:**
    - Every session newest first: "OCT 26 · 130 × 12, 12" (`setsText`), with "next 135" on the newest when it goes up.
    - A session that earned a move carries the "GO UP" tag.
    - A tap opens that day's workout (`/workout?date=`), where its sets can be fixed.
- **SWAPS:** "8 for chest", listing the other exercises of the same body part ("<name>", "<equipment>"). Each opens its own lift page.
- **No history:** "No sets logged yet." in place of the best set, chart and history.

### Library (`/library`; mocks `LibraryMeals`, `LibraryExercises`; option 7A)

- **Loaderless,** model in `app/library/model.ts`. The tab bar shows, and Catherine can use it.
- **Title:** "Library."
- **Tabs:** a joined choice, "Meals · 25" and "Exercises · 49". `?tab=exercises` is kept.
- **Search:** a field reading "Search meals" or "Search exercises". It filters by name, and opens every section with a match.

**Meals:**

- **Grams:** each row shows calories and protein at today's factor ("525 cal · 58 g"), or recipe grams without a plan.
- **BREAKFAST 4:** all shown.
- **LUNCH AND DINNER 8:** the any-day mains. The first 3 show, then "Show all 8".
- **Collapsed sections,** each expanding in place:
    - "SNACKS 5 ›"
    - "DESSERTS 5 ›"
    - "WEEKEND ONLY 3 ›" (the weekend mains)
- **Rows:**
    - Tags: "RESTING TO NOV 8" in an ink outline. A ground-beef meal adds "· ground beef, once a week" to its subline.
    - A tap opens `/meal/<slug>?from=library` (N2's browse mode).
    - The mock's "NEW NEXT WEEK" tag is dropped.
- **SAVED OFF-PLAN:** "Your usual orders, one tap to log", with the count and a chevron. It expands to the usual orders, sorted as the off-plan sheet sorts them. Each row has an outline "Log", which runs `logUsual` for today.

**Exercises:**

- **Sections by body part.** Chest is open and the rest collapsed, each with its count.
- **Head note:** "4 in plan · 8 swaps".
- **In-plan rows:**
    - A 48 px thumbnail (`exerciseImage(ex, 0)`).
    - The name, with the subline "Dumbbells · Monday".
    - The best set on the right ("55 × 9" over "best set"), or nothing with no history.
- **Swaps line:** "Swaps: barbell bench, Smith bench, Smith incline press" (lowercased names). A tap expands the swap rows.
- **Rows** open `/lift/<id>?from=library`.
- **Without a plan:** every exercise is a plain row in its body part.

## 4. SPA mode

### Worker endpoints (P4e)

`workers/app.ts` routes these before the React Router handler, and from P4f before the static assets. Handlers live in `workers/api/*.ts`.

**Auth:**
- `authenticate` and `runAsUser` wrap each signed-in endpoint, as the root middleware does now.
- Signed out gets a 401 JSON response, never a redirect.
- `/api/ingest/steps` stays public with its bearer token.

| Endpoint | Replaces | Contract |
|---|---|---|
| `GET /api/me` | app-layout loader | `{ userId, name, hasPlan }`, 401 when signed out |
| `POST /api/login` | login action | JSON `{ name, password }`. 204 with the session cookie, 401 `{ error: "That name and password don't match." }`, 429 `{ error: "Too many tries. Wait 15 minutes." }` |
| `POST /api/logout` | logout action | Clears the cookie, 204 |
| `GET /api/sync/pull`, `POST /api/sync/push` | resource routes | Unchanged. Pull also ensures this week's plan (from P4a) |
| `POST /api/vitals`, `POST /api/push/subscribe`, `POST` and `DELETE /api/rest`, `POST /api/ingest/steps` | resource routes | Unchanged |
| `GET /api/settings` | settings loader | `{ otherName, ingestUrl, ingestToken, vapidPublicKey }` |
| `POST /api/push/test`, `POST /api/backup` | settings actions | `{ pushed }`, `{ backup }` |
| `POST /api/meals/:slug/photo` | meal action | Multipart `photo`. `{ ok }` or `{ error }` |
| `GET /media/*` | media loader | Unchanged headers |

### The app on the phone (P4e and P4f)

- **The layout:**
    - A `clientLoader` fetches `/api/me`. A 401 navigates to `/login`.
    - Offline, it falls back to the copy saved in `localStorage`, as today.
    - The plan-only redirect (Plan, Progress, All lifts, Workout, Meal, Check-in, Groceries) moves here from the server middleware.
- **Login:**
    - Same screen and copy.
    - The form posts to `/api/login` with `fetch`, shows the error inline, and on success does a full load of `/` so the sync client starts for the new person.
- **Settings:**
    - Reads `/api/settings` in a `clientLoader`. The ingest URL is built from `location.origin`.
    - Offline, the steps section reads "Needs a signal to show your token."
    - Sign out posts to `/api/logout`, then does a full load of `/login`.
- **Meal photo upload** posts to the new endpoint. Offline it still reads "Photos need a signal".
- **The root `middleware` and every `*.server.ts` import** leave the route modules.

### The flip (P4f)

- **Config:** `react-router.config.ts` sets `ssr: false`. The build writes `build/client/index.html`.
- **`wrangler.jsonc`:**
    - `assets` with the client build directory, `binding: "ASSETS"`, `not_found_handling: "single-page-application"` and `run_worker_first: true`.
    - The Worker's fetch: the https redirect, then `/api/*` and `/media/*`, then a 404 for `*.data`, then `env.ASSETS.fetch(request)`.
    - `virtual:react-router/server-build` leaves `workers/app.ts`, and the Cloudflare Vite plugin no longer builds an SSR environment.
- **Service worker:** precaches `index.html` with the assets, versioned by build. A cold open with no signal loads the shell, and the store paints from IndexedDB.
- **Root error boundary:** adds a "Reload" link for a failed route load (an old build's `*.data` fetch).
- **Cleanup:** the v1 components and the v1 palette remap that no screen uses are deleted.

## 5. Errors and edge cases

| Situation | Behaviour |
|---|---|
| Offline on Sunday | The whole check-in works from the phone's copy. Finish saves on the phone and is sent later, as Foundation does |
| Finished offline, synced after the window closed | Accepted: the window is judged by the phone's `at`, which may be up to 2 days old |
| The server's call differs from the phone's (a weigh-in arrived from another phone) | The server's numbers are saved. After the pull, the finished page shows them |
| Two phones finish the same week | The second is refused: "Check-in didn't save. That check-in is already finished." |
| The check-in is skipped | Nothing is written. Targets carry over. Pull and cron make next week's plan with the existing rests. The hunger run breaks. The engine's history still covers the week at the next check-in |
| Finished on Monday morning after breakfast was logged | Next week's plan is regenerated around the eaten and swapped slots (call 9) |
| A stuck lift falls in a deload week | Deload sessions are skipped when finding the run of 3 |
| A body-weight lift stalls | Never shown as stuck |
| A dropped lift is swapped out or not done next week | The override waits for that lift's next session, and is harmless meanwhile |
| A lift is stuck again after a drop | The rule runs on the sessions at the dropped weight like any others |
| Next week is the deload | Nothing moves up. The Lifts block says so, and no stuck card shows |
| Hungry two Sundays running, steps already 10,000 | The cut stands as the engine made it |
| No weigh-ins, or under 3 | Posters read "No trend yet.". The engine holds, as N1 says |
| Nothing eaten 3 times | "No meal came up 3 times this week." |
| A meal file is removed but rested or planned | v1's fallback, unchanged. A rested slug not in the library is skipped by `finishCheckIn` |
| Groceries for a week with no plan and no preview params | A past or current week generates from the rotation, as v1 does. A future one previews with v1's default rests |
| Catherine opens Check-in, Plan, Progress, All lifts or Groceries | Redirect to Today, from the layout. Library and the lift page work |
| Signed out (cookie expired) after P4f | `/api/me` and sync return 401. The layout sends the person to Login. The pending queue is kept for the same person, as Foundation says |
| A phone on the SSR build after P4f | Its first `*.data` fetch gets a 404. The error boundary offers Reload, and the new service worker takes over |
| The server refuses any new change | The Foundation notice names it, for example "Grocery check didn't save. That food isn't in the list." |

## 6. Rollout

Each step deploys on its own, and the app works fully after each one. P4a waits for N3 to merge.

1. **P4a: data, rules and named changes.** Nothing on screen changes.
    - **Migration:**
        - `check_ins` gets `hunger`, `energy` and `sleep`.
        - `lift_drops` is created with its triggers, and the registry gains it.
        - `SYNC_SCHEMA` stays at 3.
        - Kameron runs both remote migrations.
    - **Content:** `goal` in `plan.json`, and `BODY_PART`.
    - **Domain:**
        - `stalls` and `dropWeight`.
        - `withDrop`, applied in Today's and the workout model's suggestions, with the gym's drop line.
        - `hungry` in `nextTarget`.
        - `weekCall` over rows, `buildDigest` and `ruleTake`.
    - **Mutators:** `finishCheckIn`, `logWaist`, `checkGrocery`.
    - **Week plan:** pull and the 5-minute cron run `ensureWeekPlan`.
2. **P4b: the check-in.**
    - The one-page check-in on the store, with the take, taps, call, stuck cards, rests and `finishCheckIn`.
    - The groceries link carries `rest` and `kcal`. The v1 groceries route reads `rest` until P4c. `kcal` takes effect when Groceries is rebuilt.
    - Removed:
        - the v1 check-in loader and action, and `DaySheet`
        - `checkInData` and `completeCheckIn`
    - `checkInDone` stays for the reminders.
3. **P4c: Plan and Groceries.**
    - Both on the store. Grocery checks run `checkGrocery`.
    - Removed:
        - the plan and groceries loaders and actions
        - `groceries.server.ts`
        - next-week swaps (`encodeSwap`, `parseSwaps`, `swaps` in `previewWeek`), whose last reader was v1 groceries
4. **P4d: Progress, All lifts, the lift page, Library.**
    - The four screens on the store, and the two new routes (`progress/lifts`, `lift/:id`).
    - The progress and library loaders and actions are removed, with `progress.server.ts`.
5. **P4e: Worker endpoints.** SSR is still on.
    - Every endpoint in section 4, and the layout, login, logout, settings and meal photo moved onto them.
    - The API resource routes, `media.tsx`, `login`'s action, `logout.tsx` and the layout loader are removed.
    - After this step no route module exports a `loader` or `action`.
6. **P4f: SPA mode.**
    - `ssr: false`, the assets config, the Worker's fetch order, the precached shell, and the error boundary's Reload.
    - The v1 component and palette cleanup.

Only P4a carries a migration.

## Testing

**Unit:**
- **`stuckLifts`:**
    - Three equal sessions.
    - Reps falling, and reps rising (not stuck).
    - A deload session inside the run (skipped).
    - The third session outside the week (not shown).
    - A lift that moved up, and a body-weight lift.
    - `chase` for one and two sets per lift.
- **`dropWeight`:** 45 → 40, 15 → 10, 10 → 5, 5 → 5.
- **`withDrop`:** applies before the next session, is spent after it, and ignores sessions before `from_date`.
- **`nextTarget` with `hungry`:**
    - A cut turns to steps.
    - Half portions with hungry.
    - At 10,000 steps the cut stands.
    - Hold, on-pace, raise and maintenance are untouched.
    - The why-line appears.
- **`weekCall` over rows:** a seeded history gives the same call as N3's worked example.
- **`buildDigest`:** each field, from a seeded week. This includes the low days, the extras and misses, and `hungryTwice` across a skipped week.
- **`ruleTake`:**
    - One test per row of the Win, Fix and Call tables.
    - Every number in the output appears in the digest.
- **The check-in model:**
    - The window's week, before the window, and finished (read from `outcome`).
    - The poster lines and the Lifts subline.
    - Rest defaults at 3 and 4, and back from rest.
    - The grocery count from the preview.
- **Mutators against the in-memory store:**
    - `finishCheckIn` writes targets, the row, rests, drops and next week.
    - It keeps resolved and swapped slots.
    - It ignores a drop for a lift that isn't stuck.
    - It refuses a closed window, a second finish and an out-of-bounds `at`.
    - A steps pick with no steps option falls back to calories.
    - `logWaist` and `checkGrocery`.
- **The groceries model:** a planned week, a preview with `rest` and `kcal`, the counts, and "Cooked weight".
- **The Plan model:** every row in the THE WEEK table, the strip cells, and the target sublines.
- **The Progress model:** the pace lines with a fixed trend, STRONGER's order, the showing-up numbers, and the streak line.
- **The lifts model:** best set, gain, sparkline points, grouping by `BODY_PART`, the 21-lift count, and the meta line's days.
- **The library model:** counts, sections, the resting tag, search, and Catherine's plain lists.

**Workers (real D1):**
- **The migration:** the new columns are null on old rows. `lift_drops` exists, and its triggers log puts and deletes.
- **`finishCheckIn` through push,** against a seeded week in both person databases:
    - It writes `targets`, `check_ins` with the taps and the engine fields, `meal_state`, `lift_drops` and 35 `planned_meals`.
    - Extra fields in the args, such as a `kcal`, are dropped by the schema. The saved numbers match the rows.
- **Pull and cron** create this week's plan for a user with a plan and skip Catherine.
- **P4e endpoints:**
    - `/api/me` is 401 signed out and 200 signed in.
    - Login: right password, wrong password, lockout.
    - Logout clears the cookie.
    - `/api/settings` returns each person's own token.
    - Photo upload writes R2.
    - `/media/*` serves it.
    - Isolation holds: each endpoint reads only the signed-in person's database.
- **P4f:** the Worker's fetch hands non-API paths to a stub `ASSETS` binding, 404s `*.data`, and redirects http.

**Process:** one full-suite run before each PR.

**On the wire (kampduh.com, after each deploy):**
- **Find a route's chunk:** take the module URL from the shipped manifest with `curl -s https://kampduh.com/login | grep -o '/assets/<route>-[A-Za-z0-9_-]*\.js'`, then `curl` it and grep for strings that only the new build has:
    - **P4b**, the check-in chunk: `FINISH CHECK-IN`, `Back from rest next week`, `chase`. Also `Change my answers`.
    - **P4c**, the plan chunk: `THE WEEK`, `checked off`. The groceries chunk: `in the cart`.
    - **P4d**, the progress chunk: `lifts, best sets and history`. The library chunk: `SAVED OFF-PLAN`. A `lift` route chunk exists.
- **P4a:** Kameron's `wrangler d1 execute <db> --remote --command "PRAGMA table_info(check_ins)"` lists `hunger` for both person databases. `lift_drops` exists.
- **P4e:**
    - `curl -s -o /dev/null -w '%{http_code}' https://kampduh.com/api/me` prints 401.
    - One wrong-password `POST /api/login` returns 401 with "That name and password don't match."
- **P4f:**
    - `curl -s https://kampduh.com/progress` returns 200 with the shell and no loader data: `loaderData` doesn't appear.
    - `curl -s -o /dev/null -w '%{http_code}' https://kampduh.com/plan.data` prints 404.
    - `curl -sI http://kampduh.com/` shows a 301 to https.
    - `/api/me` still prints 401.
