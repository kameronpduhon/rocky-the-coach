# Rocky v2, project 3: Nutrition engine

Status: approved design, 2026-10-27. Next step: the N1 implementation plan.

This is project 3 of the five-project rebuild. Foundation (project 1) and Workouts (project 2) are live at kampduh.com.

| # | Project | Ships |
|---|---|---|
| 1 | Foundation | Done |
| 2 | Workouts | Done |
| **3** | **Nutrition engine** (this spec) | Trend weight and burn, gram rescaling, day completeness and the close-out, the meal screens, Library meals (browse mode and usual orders) |
| 4 | Check-in, Plan, Progress, Library | The weekly ritual, the overview screens, and the Library tab |
| 5 | Rocky's AI | Rocky's take, Tell Rocky, describe-a-meal, barcode and label, memory, AI switch |

## Source material

| Source | What it holds |
|---|---|
| Research doc, https://claude.ai/artifact/H8VHSWMYpddc5ShcTbSVhD | "How MacroFactor's algorithm works", "Ideas for Rocky" under Nutrition leaders, and decisions 4 and 5 of "What we decided" |
| Mocks, https://claude.ai/artifact/65WeReuGH5ZageJng9K6nq | Artboards `MealOne`, `MealBatch`, `MealLeftover`, `MealSwap`, `CheckInCall`, `Corner2`, `Corner2Lunch` |
| Option mocks, https://claude.ai/artifact/1yW7smtJTuSnjXQUCjdo9q | The four new decisions. Picked: 1C (close-out sheet), 2A (quiet skip, swap in from the Library), 3A (usual orders first), 4A (the CheckInCall block) |
| `docs/design/system.md` | The Corner design system. Where it and a mock disagree on looks, the mock wins, except the colour rules |
| `docs/superpowers/specs/2026-10-27-foundation-design.md` | The sync layer, named changes, and conventions this project builds on |
| `app/routes/meal.tsx`, `app/server/meals.server.ts`, `app/server/meal-plan.server.ts`, `app/server/checkin.server.ts`, `app/domain/adjustments.ts` | v1 behaviour. Anything this spec does not change keeps working as v1 does |

Where a mock's numbers differ from this spec's math, the math wins. The mocks were drawn before the math was settled. For example, a 100-calorie trim takes rice from 200 to 175 g, not the 185 g that `MealOne` and `CheckInCall` show.

## Decisions this spec rests on

- **An adaptive engine replaces the v1 check-in rules.** It uses MacroFactor's method: estimate the real burn from what was eaten and how the trend weight moved, then set the target from the burn.
    - The v1 rules stay on as guardrails: the 2,000 floor, the steps alternative, the step ramp, and small weekly moves.
- **The engine makes the Sunday call from this project on.** Only the call block of the v1 check-in screen changes. Project 4 rebuilds the rest of the ritual and reuses the block.
- **Rules set every number.** Nothing in this project is AI. Every line explaining a call is written by a rule.
- **The fixed meal plan stays the default day.** Protein is the one number shown.
- **Grams follow the target.** Rice, potato, honey and added fats scale up and down together. Protein foods, fruit and vegetables never change.
- **The engine doesn't blame.** It holds the numbers only when there is too little data to make a call. v1's "tighten up" goes away.
- **The goal pace is 0.5% of trend weight a week.** That is about 1 lb a week now, and it eases off as weight comes down.
- **An unmarked meal is asked about, never assumed.** A close-out sheet asks at bedtime, and again the next morning if nobody answered. A day nobody closes out is left out of the math.
- **Library meals are:**
    - The new Meal screen in browse mode, opened from the v1 Library.
    - Saved "usual orders" in the off-plan sheet.
- **Out of scope:**
    - The check-in ritual beyond the call block: hunger, energy and sleep taps, the stuck-lift card, and the new layout (project 4).
    - The Library tab's new layout (project 4).
    - Describe-a-meal, barcode and label scan, and anything else AI (project 5).
    - Editing a planned meal's grams by hand.
    - Catherine's plan.

## 1. The engine

All of the engine is pure functions in `app/domain/`. It runs on the server for the check-in and on the phone for Today. It stores nothing between weeks: every number is recomputed from the weigh-ins and meal logs each time, from the phase start onward.

### Trend weight (`app/domain/trend.ts`)

- **The trend is an exponentially smoothed average:**
    - On a day with a weigh-in: trend = yesterday's trend + 0.1 × (weigh-in − yesterday's trend).
    - On a day without one, the trend carries over unchanged.
    - It starts at the first weigh-in.
- **The trend replaces v1's 7-day average everywhere weight is read:**
    - Today's "Trend 205.3 lb, down 1.7 since Oct 5" line.
    - The check-in's weight and weekly change.
    - The v1 Progress chart's line.
- **Weekly change** is the trend on this Sunday minus the trend on the previous Sunday.
- **Fewer than 3 weigh-ins in all** shows "Not enough weigh-ins", as v1 does.

### Day completeness (`app/domain/completeness.ts`)

A day has five planned slots: breakfast, lunch, snack, dinner and dessert. A slot is **resolved** when it has a planned log ("Ate it") or a skipped log.

| State | When |
|---|---|
| Complete | Every slot is resolved, and nothing off-plan was logged |
| Has estimates | Every slot is resolved, and at least one off-plan entry was logged. Every off-plan entry is an estimate, usual orders included |
| Partial | At least one slot is unresolved, and something was logged |
| Not tracked | Nothing was logged |

- **The engine reads intake only from Complete and Has estimates days.** These are the **tracked days**.
- **Partial and Not tracked days are left out** of the intake average. The trend still runs through them.
- **A relaxed day follows the same rules.** Its relaxed meals are off-plan entries.
- **An off-plan meal eaten in place of a planned one** leaves that slot unresolved. The close-out sheet then asks about it, and the person un-checks it.

### Burn (`app/domain/energy.ts`)

`energyHistory(input)` returns one entry per Monday-to-Sunday week, from the phase start up to the week under review. Each entry holds:
- `burn`, in kcal a day
- `state`: `settling`, `updating` or `holding`
- `intakeAvg` and `trackedDays`
- the trend at the window's start and end

**Each week's math:**

- **The window** is the 21 days ending on that Sunday.
- **Observed burn** = the average intake over the window's tracked days − 3,500 × (trend at the window's end − trend the day before it starts) / 21.
- **The week updates only when all of these hold:**
    - At least 10 tracked days in the window.
    - At least 4 tracked days in the week itself.
    - At least 8 weigh-ins in the window.
    - The window starts on or after the phase start.
- **If the week updates:**
    - burn = last week's burn + 0.5 × (observed − last week's burn).
    - The change is capped at 250 a week and rounded to the nearest 10.
- **If it does not update**, the week is `holding` and the burn carries over from last week.
- **Before any week updates,** the burn is `plan.maintenanceKcal` (2,800). That is the estimate the plan started with.
- **The state:**
    - The first 4 weeks that update are `settling`. "Steady by week N" names the week the fourth update lands.
    - Weeks that update after those are `updating`.

### The call (`nextTarget` in `app/domain/energy.ts`)

The inputs are:
- this week's energy entry
- the trend weight
- the current base calories and step goal
- the last two weekly changes
- next week's week type
- the average flex calories per day (from rescaling, below)

**The goal deficit** is 0.5% of trend weight a week: 0.005 × trend × 3,500 / 7, which is 2.5 × trend kcal a day. At 205.6 lb that is 514 a day.

**Steps, in order:**

1. **Holding:** the calories stay as they are. The call says why (see the copy table).
2. **Ideal:** burn − goal deficit, rounded to the nearest 50.
3. **Move:** the change toward the ideal is capped at 100 a week while `settling` and 150 after that. The new target is the current one plus that capped change.
4. **Guardrails, applied in order:**
    - **Fast loss:** if the trend fell more than 2 lb in each of the last two weeks, the target never goes down.
    - **No surplus:** the target never goes above the burn, except in a maintenance week.
    - **Floor:** the target never goes below 2,000.
    - **Half portions:** the target never drops flex foods below half (rescaling's 0.5 floor). Any cut past that becomes the steps option, and the steps option becomes Rocky's pick. If the step goal is already 10,000, the target holds at the half-portion level.
5. **The alternative:** when the call is a cut and the step goal is under 10,000, the other pick is "Keep <current>, walk 1,000 more". It keeps calories the same and raises the step goal by 1,000, up to 10,000, as v1 does.
6. **Step ramp:** v1's rule is applied separately. If the week's average steps met the goal, the goal rises 500, up to 10,000.
7. **Maintenance week:** if next week is a maintenance week, the call is "<burn> cal a day next week" with no pick. `resolveTargets` uses the latest check-in's burn for that week instead of `plan.maintenanceKcal`, and falls back to 2,800 when no check-in has a burn yet. The base target is not changed, so the week after maintenance returns to it.

**Stored with each check-in:** `check_ins` gains `burn`, `burn_state`, `intake_avg` and `tracked_days`. `avg_weight` and `change` now hold trend values. The `outcome` JSON holds the call (`kind`, `newKcal`, `newStepGoal`, `pick`, `guardrail`), replacing v1's `Adjustment`.

## 2. Gram rescaling (`app/domain/rescale.ts`)

### Food roles

`foods.json` gains `role`, which is `protein`, `flex` or `fixed`. The content tests require it on every food, and `docs/runbooks/add-recipe.md` asks for it on new foods.

| Role | Foods today | Grams |
|---|---|---|
| `protein` | Chicken breast and thigh, sirloin, ground beef, salmon, cod, shrimp, whole eggs, egg whites, Greek yogurt, cottage cheese, whey | Never change |
| `flex` | Cooked white rice, russet and sweet potato, honey, butter, olive and sesame oil, cheddar, feta, heavy cream, avocado | Scale with the target |
| `fixed` | Fruit, vegetables, milk, salsa, cocktail sauce, coconut aminos | Never change |

### The factor

- **R** is the target the meals were written for: `plan.startingTargets.kcal`, which is 2,400.
- **F** is the average flex calories per planned day. For each of the five slots, take the average flex calories of that slot's pool at recipe grams, then add the five together. It is computed once from the content, and today it is about 750.
- **Factor** = 1 + (target − R) / F, clamped between 0.5 and 1.5. For example, a 2,300 target gives 0.87.
- **The target** used is that date's resolved target, so a maintenance week scales up.

### Scaled meals

`scaledMeal(meal, factor)` returns the meal with:
- Each flex ingredient's grams = recipe grams × factor, rounded as v1 rounds portions: to the nearest 1 g under 20 g, otherwise to the nearest 5 g.
- Protein and fixed ingredients at their recipe grams.
- Calories and protein recomputed from those grams, rounded as v1 rounds them: to the nearest 5 kcal and 1 g.

Every place that shows or logs a planned meal uses `scaledMeal`:
- Today: the poster's scale list and the meal rows.
- The Meal screen, the swap sheet and the close-out sheet.
- `logMeal`'s snapshot.
- Batch math.
- The grocery list.
- The v1 Library rows.

At a 2,400 target the factor is 1 and nothing changes.

### Batches keep their grams

- A batch stores the factor it was cooked at.
- A portion eaten from it is shown and logged at that factor, even after a check-in changes the target between cooking and eating.

### The "Was" line

- **When it shows:**
    - For 7 days after a target change, a flex ingredient whose grams changed shows "Was <grams under the previous target>".
    - The Meal screen's first changed row adds the reason: "<Weekday>'s check-in trimmed <n> cal a day, so rice and honey took the cut." The sentence names the flex foods that changed in that meal, at most two.
    - A raise reads "<Weekday>'s check-in added <n> cal a day, so rice and honey go up."
    - A maintenance week reads "Maintenance week adds <n> cal a day, so rice and honey go up."
- **After 7 days**, the line and the reason disappear.
- **In browse mode**, the line folds into the subline, for example "Raw, was 300".

## 3. Data

### Meal logs

- `meal_logs.category` gains `skipped`. A skipped row has `kcal` 0, `protein_g` 0, `meal_slug` null, `slot` set, and `name` set to the planned meal's name for display.
- **Readers that change:**
    - `countedDay` does not treat a skipped row as a logged meal. Closing out a day by skipping everything does not keep the streak.
    - Today's off-plan list leaves skipped rows out.
    - Rotation's `lastEaten` and the check-in's repeat counts already ignore rows without a `meal_slug`, or with a category other than `planned`.

### Batches

- `batches` gains `client_id` (unique, made on the phone) and `factor` (real, default 1).
- Its sync key becomes `byClientId`, so a batch can be started offline. v1 rows stay keyed `id:<id>`.
- `SYNC_SCHEMA` goes to 3, so every phone takes a full snapshot once.
- The migration regenerates the sync triggers for the table.

### Usual orders

New synced table `usual_orders`, keyed by `client_id`:

| Column | Notes |
|---|---|
| `client_id` | Primary key |
| `name`, `category`, `kcal`, `protein_g`, `relaxed` | As an off-plan entry |
| `uses` | Times logged, for ordering |
| `last_used_at`, `created_at` | ISO times |

The migration seeds v1's two presets in each person database:
- "Restaurant meal": 900 cal, 50 g, relaxed.
- "Ranch Water": 100 cal, drink.

### Check-ins

`check_ins` gains `burn` (integer), `burn_state` (text), `intake_avg` (integer) and `tracked_days` (integer), all nullable for v1 rows.

### Named changes

New and changed mutators in `app/sync/mutators.ts`:

| Mutator | What it does |
|---|---|
| `logMeal { clientId, date, slot, mealSlug }` | Changed: snapshots calories and protein at that date's factor, or at the open batch's factor |
| `skipMeal { clientId, date, slot }` | Adds a skipped row. Refused if the slot is already resolved |
| `closeOutDay { date, eaten: [{ clientId, slot }], skipped: [{ clientId, slot }] }` | Logs and skips in one change. Slots already resolved are left alone. Refused for dates before yesterday |
| `unlogMeal { key }` | Unchanged. It also undoes a skip |
| `swapMeal { date, slot, mealSlug, always }` | v1's `swapPlanned`, moved to the phone. "Always" rests the replaced meal for 4 weeks. Refused if the meal doesn't fit the slot's pool, the day's mode, or is resting |
| `startBatch { clientId, date, slot, mealSlug, portions, cookedWeightG }` | v1's `createBatch` plus the factor. It also sets the same slot on the next `portions − 1` days to this meal (marked swapped), wherever the meal fits that day's mode and the slot isn't resolved |
| `logOffPlan { ..., saveAsUsual }` | Changed: when `saveAsUsual` is set, also writes a usual order |
| `logUsual { clientId, usual, date }` | Logs a usual order's numbers as an off-plan entry and bumps its `uses` and `last_used_at` |
| `removeUsual { key }` | Deletes a usual order |

**Dates:** `notFuture` applies to every one. Meal dates follow v1's rule that a log before 3am counts for the previous day (`mealDate`).

**v1 writers:** the v1 meal screen's actions and the v1 check-in write `client_id`, `factor` and scaled snapshots until N2 removes them, so they keep working through N1.

### Close-out reminder

`DEFAULT_REMINDERS` gains:
- `close-out` at 21:15, every day.
- When: today has an unresolved slot and something was logged.
- Title "Close out today". Body "<n> meals aren't marked. One tap closes out today."
- It opens `/?closeout=today`.

It appears in Settings' reminder list with on/off and time, like the others. The cron skips users without a plan, as it already does.

## 4. Screens

### Today (mocks `Corner2`, `Corner2Lunch`; option 1C)

What changes:

- **Grams and macros** come from `scaledMeal`.
- **A skipped meal** collapses to one line, "<time> <meal> · Skipped", in muted text, like an eaten one. Tapping it undoes, as for eaten.
- **The trend line** uses the trend weight.
- **The close-out sheet:**
    - **When it opens:**
        - When Today opens from the close-out push.
        - The first time Today opens on a day while yesterday has an unresolved slot. This happens once per day per phone, and only while yesterday is not Not tracked.
        - From a quiet "Close out today" link at the end of the meal list. The link shows after the dessert slot's time while a slot is unresolved.
    - **Title:** "Close out <Weekday>" for today, "Close out yesterday" for yesterday.
    - **Rows:**
        - Each unresolved slot shows the meal's name, "<Slot> · <kcal> cal · <protein> g", and a 44 px round check.
        - Every check starts on. Tapping one turns it off, and the row then reads "Skipped" in muted text.
        - Line above the rows: "Tap any you skipped."
    - **The red button:**
        - "Save: both eaten" when two are checked and none skipped.
        - "Save: all 3 eaten" for three or more.
        - "Save: 2 eaten, 1 skipped" when mixed.
        - "Save: all skipped" when none are checked.
        - It runs `closeOutDay` and closes the sheet.
    - **"Not now"** closes it without saving.
    - **Older days:** nothing older than yesterday is ever asked about. Those days stay Partial and out of the math.

### Meal (`/meal/:slug`; mocks `MealOne`, `MealBatch`, `MealLeftover`, `MealSwap`; option 2A)

- **Rebuilt on the phone's copy,** like Today: `clientLoader` with `hydrate = true`, and a server loader that returns nothing personal. The tab bar is hidden. The screen is for today's slot when it opens from Today (`?slot=`), and in browse mode otherwise.
- **Header:** back, and Swap (today's slot only).
- **Photo:**
    - The meal's photo, or "Add a photo".
    - Uploading stays a server request, because the photo goes to R2.
    - Offline, the button reads "Photos need a signal".
- **Headline:** the meal name at 54 px, then "<Slot> · <time> · <kcal> cal · <protein> g protein".
- **Cooking for:** Just today, 2 days and 3 days. Today's slot only, before it is eaten.
- **On the scale:** each ingredient with its state and grams, times the portions, with the "Was" line rule.
- **Batch (2 or 3 days, `MealBatch`):**
    - The section reads "ON THE SCALE, ALL 3".
    - Each subline gives the per-portion amount, for example "Cooked, 175 g a portion".
    - The "After cooking" card asks for the main protein's cooked weight, as v1 does. Save runs `startBatch`, then shows "Each portion <g> cooked" and "<Weekday> and <Weekday> <slot> will say: put <g> of cooked <protein> on the scale."
    - The dock reads "ATE TODAY'S PORTION".
- **From a batch (`MealLeftover`):**
    - When today's slot matches an open batch, the meta line reads "<Weekday> <slot> · portion <n> of <n> from <Weekday>'s batch".
    - The main protein row reads "<Protein>, from the batch", with the subline "Cooked, a third of <g> g" (or "half" for 2 portions).
    - Every row uses the batch's factor.
    - A closing line reads "One portion left for <Weekday>." or "Last portion."
    - The dock reads "ATE IT · <kcal> CAL · <protein> G".
- **Steps:** numbered, as v1.
- **Dock for today's slot:**
    - Unresolved: the red "ATE IT", and a quiet "Skipped it" link under it.
    - Eaten: "Eaten at <time>" with a quiet "Undo".
    - Skipped: "Skipped" with a quiet "Undo".
- **Swap sheet (`MealSwap`):**
    - Choices: "Just today" and "Always". Under them: "Only today changes. Always rests the <meal> for 4 weeks."
    - "Best fit for what's left today first", using v1's fit order on scaled numbers.
    - A meal with at least 10 g less protein than the current one adds "lower protein, add a shake".
    - Picking one runs `swapMeal`, and the screen shows the new meal.
- **Browse mode (from the Library, or any meal not on today's plan):**
    - No Swap, no Cooking for, and no Ate it.
    - The meta line reads "<Pool> · <kcal> cal · <protein> g protein", where the pool is "Breakfast", "Lunch or dinner", "Snack" or "Dessert".
    - **"Have it for…" dock:** shown when today has an unresolved slot in the meal's pool and the meal fits today's mode.
        - The button is an outline "Have it for dinner tonight", or "Have it for <slot> today" for the other slots.
        - A then-line reads "Replaces <planned meal>, just today."
        - It picks the next unresolved slot of the pool whose time hasn't passed, or else the first unresolved one.
        - Tapping it runs `swapMeal` (just today) and turns the screen into today's slot.
    - **A resting meal** shows "Resting to <date>" and no dock.

### Library (v1 screen)

- Only the data changes. Meal rows show scaled calories and protein, and tapping a meal opens the Meal screen in browse mode.
- Exercises are unchanged.
- The new Library layout is project 4.

### Ate something else (option 3A)

The off-plan sheet on Today:

- **Usual orders first:**
    - Sorted by `uses`, then by last used. At most five show, then a quiet "All <n> usuals" link expands the rest.
    - Each row shows the name, "<kcal> cal · <protein> g · <relaxed or category>", and an outline "Log" that runs `logUsual` and closes the sheet.
- **Removing:** a long press on a usual swaps its Log for "Remove", inside the sheet, which runs `removeUsual`. There is no browser dialog.
- **Something new:**
    - What was it, Category, Calories and Protein, as v1.
    - Category stays, though the option mock left it out, because the dessert allowance needs it.
    - The "Relaxed meal (weekend restaurant)" switch, and a new "Save as a usual" switch.
    - The red "Log it" runs `logOffPlan`.

### Check-in call (v1 screen; mock `CheckInCall`; option 4A)

`checkInData` calls the engine in place of `decideAdjustment`. The v1 check-in's call block becomes the `CheckInCall` block. Everything else on the v1 check-in stays.

- **Head:** "THE CALL.".
- **The number:** "<new>" with "cal a day from Monday" over "was <old>". When it holds: "<current>" with "cal a day" over "holds".
- **Under it:** "Protein stays 180 g" and "Steps <goal>".
- **Why:** numbered, rule-written lines (copy below).
- **State note:** for `settling` and `holding` only.
- **Your pick:** radios, with Rocky's pick first and marked "Rocky's pick". The alternative shows only when it exists. The cut's subline names the flex foods that change, for example "Smaller portions of rice, potato and honey."
- **On your scale from Monday:**
    - Each flex food whose recipe grams differ between this week's factor and next week's.
    - The meals in next week's plan that use it.
    - "<old> → <new> g".
    - Closing line: "Chicken, steak, fish and eggs never shrink."
- **Finish check-in** saves the pick. It writes the targets from Monday, the step goal, and the `check_ins` row with the engine's fields.

**Why-line copy:**

| Case | Lines |
|---|---|
| Updating, cut | "You averaged <intake> a day and the trend fell <x> lb." · "That puts your burn near <burn> a day, <lower or higher> than <last week's burn, or "the 2,800 we started with">." · "About <goal> lb a week would mean <ideal>. Early weeks are noisy, so Rocky moves 100 at a time." (after settling: "Rocky moves up to 150 a week.") |
| Updating, on pace | The first two lines, then "You're on pace, so the number holds." |
| Updating, raise | The first two lines, then "You're losing faster than <goal> lb a week, so Rocky adds <n>." |
| Holding, few tracked days | "Only <n> days this week were tracked in full, so Rocky can't read your burn yet." · "Burn stays at <burn> from last Sunday." |
| Holding, first two weeks | "Two weeks of weigh-ins come first. Burn starts at 2,800." |
| Fast-loss guardrail | Adds "You lost more than 2 lb two weeks running, so Rocky won't cut." |
| Floor | Adds "2,000 is the floor." |
| Half portions | Adds "Rice and potato are at half portions, so the rest comes from steps." |
| Maintenance next week | "<burn> cal a day next week. Maintenance week: you eat at your burn." |

**State note:**
- Settling: "Burn estimate is still settling. Steady by week <n>."
- Holding: "Burn estimate is holding. Close out each night and it updates next Sunday."

## 5. Errors and edge cases

| Situation | Behaviour |
|---|---|
| Offline | Every new change saves on the phone and is sent later, as Foundation does. Only a photo upload needs a signal |
| The server refuses a change | The Foundation notice names it, for example "Meal didn't save. That slot is already marked." |
| History from before the close-out shipped | v1 days with all five slots logged count as tracked. Other days are left out. If fewer than 10 days are tracked, the first call holds |
| Weigh-ins stop for a week | The trend carries. The week has under 8 weigh-ins in its window, so it holds |
| A check-in lands between cooking a batch and eating it | The leftovers keep the batch's grams and numbers |
| A batch's later day is a weekend-only mismatch, or that slot is already eaten | That day is left as planned. The batch still counts its portions |
| Flex foods hit half portions | The cut becomes the steps option. At 10,000 steps the calories hold |
| A meal has no flex food (shrimp cocktail) | Its grams never change. The factor's math already counts that |
| A meal file is removed but still planned | v1's fallback pick, unchanged |
| The check-in is skipped | v1's default: no target change, and next week's plan is generated. The engine's history still covers that week at the next check-in |
| Catherine has no plan | Every screen here redirects to Today, as Foundation does. The close-out reminder skips her |
| Two phones | Rows carry phone-made IDs. The close-out sheet only offers slots that are still unresolved on that phone's copy, and `closeOutDay` skips slots already resolved on the server |

## 6. Rollout

Each step deploys on its own, and the app works fully after each one.

1. **N1: data, rules and named changes.** Nothing on screen changes, because the target is still 2,400 and the factor is 1.
    - **Migration:**
        - `batches` gets `client_id` and `factor`, with the new key.
        - `usual_orders` is created and seeded.
        - `check_ins` gets its new columns.
        - Sync triggers are regenerated, and `SYNC_SCHEMA` goes to 3.
    - **Content:** `role` on every food.
    - **Domain:** `trend`, `completeness`, `energy`, `rescale`.
    - **Mutators:** the new ones above. `logMeal` and the v1 writers snapshot scaled numbers.
    - **Readers:** every reader that shows a planned meal switches to `scaledMeal`.
    - Kameron runs both remote migrations.
2. **N2: the meal screens and the close-out.**
    - The rebuilt Meal screen, with the swap sheet, batch, leftover and browse mode.
    - The v1 Library opens browse mode.
    - The close-out sheet and reminder.
    - Skipped rows on Today.
    - Usual orders in the off-plan sheet.
    - The v1 meal route's actions and its offline-queue use are removed.
    - This ships before the engine's call so that close-outs start building tracked days first.
3. **N3: the engine makes the call.**
    - The trend replaces the 7-day average on Today, the check-in and Progress.
    - The check-in's call block, from the engine.
    - `decideAdjustment` and `app/domain/adjustments.ts` are removed. The v1 check-in's "days on plan" count stays as a display, but no longer decides anything.
    - Maintenance week uses the burn.
    - The first Sunday after N3 deploys makes the first engine call.

## Testing

**Unit:**
- **Trend:** a steady series, gaps, the first weigh-in, and the weekly change.
- **Completeness:** each of the four states. A skipped slot resolves. An off-plan entry makes Has estimates. A relaxed day.
- **Burn:**
    - A worked example checked by hand: intake 2,400, trend down 1.0 lb over 21 days, prior 2,800, gives observed 2,567 and burn 2,680.
    - Holding for each data threshold.
    - The 250 cap.
    - Settling turning into updating after the fourth update.
- **`nextTarget`:**
    - Ideal and rounding.
    - The 100 and 150 caps.
    - Each guardrail: fast loss, no surplus, the floor, and half portions turning into steps (and holding at 10,000 steps).
    - The steps alternative, the step ramp, and maintenance week.
- **Rescale:**
    - The factor at 2,400, 2,300, 2,000 and the maintenance burn.
    - The 0.5 and 1.5 clamps.
    - Rounding under and over 20 g.
    - Protein and fixed foods never change.
    - Every meal file at 2,400 matches v1's numbers.
    - The "Was" line's 7-day window and reason copy.
- **Every new mutator** against the in-memory store:
    - `closeOutDay` leaves resolved slots alone and refuses old dates.
    - `startBatch` plans the following days and skips mismatched ones.
    - `logMeal` uses the batch's factor.
    - `logUsual` bumps `uses`.
- **Close-out copy:** the red button's label for each mix of eaten and skipped.
- **The Meal screen's view model:**
    - Today's slot, browse mode and its dock slot pick, a resting meal, a batch day, and a leftover day.

**Workers (real D1):**
- **The migration:**
    - Batches keep every row and resolve under the new key.
    - Usual orders are seeded in both person databases.
    - The triggers log writes to `batches` and `usual_orders`.
- **Each new mutator** applies cleanly through push.
- **`checkInData`:**
    - Returns the engine's call from a seeded history.
    - Finishing writes the targets and the new `check_ins` fields.
- **Groceries:** the v1 grocery list sums scaled grams.

**Process:** one full-suite run before each PR.

**On the wire (Kameron's iPhone):**
- **The close-out push:** leave dinner and dessert unmarked. The 9:15pm push opens the close-out sheet. Un-check dessert and save. Confirm in D1: dinner planned, dessert skipped.
- **The morning sheet:** leave one day unanswered. The next morning's first open shows "Close out yesterday" once, and not again that day.
- **Offline batch:** in airplane mode, start a 3-day batch at lunch. Reconnect. Confirm the batch and the next two lunches reach D1, and that Thursday's lunch shows the cooked portion.
- **The first engine call:** on the first Sunday after N3, work out the call by hand from D1's rows, using the formulas above, and compare it with the screen. After finishing, Monday's meals show the new grams with the "Was" line.
