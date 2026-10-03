# Rocky v1: Spec

Status: **draft for approval**, 2026-10-03. Build plans: `docs/superpowers/plans/2026-10-03-m1-foundation.md` through `m6-reminders-integrations.md`.

Rocky is a personal fitness and nutrition coach app for one user (Kameron). Its job is to keep the approved plan in front of Kameron every day, make following it effortless, and catch drift before it turns into quitting.

## Source documents

| Doc | What it holds |
|---|---|
| `docs/plan.md` | The approved fitness and nutrition plan. The rules engine encodes it. |
| `docs/meals.md` | Starter meal library (25 meals). Becomes seed content. |
| `docs/exercises.md` | Every plan exercise mapped to a verified free-exercise-db image. |
| `docs/pre-build-checklist.md` | Every decision made before the build, with the v1 scope table. |
| Mockups | https://claude.ai/artifact/WRiVyTVMD7GoJkGSqkoedQ (approved, Liquid Glass style). The visual reference for every screen. |

Where this spec and a source doc disagree, this spec wins for app behavior and `docs/plan.md` wins for the plan's numbers.

## Product principles

1. **Toggles over pages.** Options live inline where they apply (portion toggle above the recipe, swap sheet over the item, rest toggles in the check-in). No wizards, no settings detours.
2. **Log in the moment.** Meals, sets, and weigh-ins are logged as they happen. There is no "log yesterday" flow. The app nudges at the right time instead.
3. **No math for the user.** Every food amount is a number of grams to put on the scale, in the state it is weighed (raw, cooked). Batch splits, totals, and averages are computed.
4. **Never repetitive.** Meal rotation keeps repeats down. Burnout from repetition is the #1 historical quit trigger.
5. **Straight shooter, encouraging.** Rocky's copy is direct about what slipped and focused on the next right move. Never preachy, never piles on.
6. **No AI inside the app.** Rocky's voice is pre-written copy chosen by rules. Recipe import happens in Claude Code sessions, not in the app.

## Stack and hosting

| Layer | Choice |
|---|---|
| Runtime | Cloudflare Workers, one Worker serving the app, the API, and cron |
| Framework | React Router v8 (framework mode, SSR, the official Cloudflare template), TypeScript |
| Styling | Tailwind CSS 4 with design tokens as CSS variables |
| Database | Cloudflare D1 (SQLite) via Drizzle ORM, SQL migrations applied with wrangler |
| File storage | Cloudflare R2 (meal photos, exercise images, weekly backups) |
| Scheduling | Cron Trigger every 5 minutes for reminders; weekly backup job |
| Notifications | Web Push (VAPID) to the installed PWA via `@block65/webcrypto-web-push` ^2.0.0 (aes128gcm, which Apple requires) |
| Tests | Vitest 4 with two projects: `unit` (Node, pure logic and content) and `workers` (`@cloudflare/vitest-plugin`, real D1 and R2 bindings, loaders and actions called directly) |
| Domain | `kampduh.com` (apex) as a Worker custom domain |
| Deploy | Push to `main` deploys (Cloudflare Workers Builds), or `wrangler deploy` |
| Timezone | `America/Chicago` for every date and schedule. "Today" always means today in this zone |

Cost: **Workers Paid, $5/month, recommended (pending Kameron's OK).** The Free plan caps CPU at 10 ms per request and per cron run; Cloudflare's own guidance puts server-rendered pages at 10 to 20 ms, so Free would fail requests intermittently (error 1102). Paid also raises D1 Time Travel from 7 to 30 days. R2's free tier needs an R2 subscription enabled in the dashboard (card on file), with usage well inside the free allowance.

## Screens

The mockups define the look. This section defines behavior. Navigation is a floating glass tab bar with four tabs: **Today, Plan, Progress, Library**. Meal, Workout, Check-in, and Settings are pushed screens.

### Today (home)

- Header: date, week number ("Week 2"), streak pill.
- **Rings:** calories eaten vs target (pink), protein vs target (cyan), steps vs goal (green). Concentric, Apple Fitness style, with numbers beside.
- **Rocky card:** one message chosen by the message rules (below).
- **Workout card** (training days only): photo of the first exercise, time window, name, exercise and set counts, any "go up in weight today" callouts, buttons **Start workout** and **Plan B**. On rest days: "Rest day" card with the optional session offered on Tue and Thu. Once sets are logged the button reads "Continue workout".
- **Meals list:** today's planned breakfast, lunch, snack, dinner, dessert with thumbnail (photo or placeholder), slot time, name, calories, protein. Tapping opens the meal. Eaten meals show a green check and dim. The next unlogged meal is labeled "Up next".
- **+ Log off-plan** button: opens the off-plan sheet.
- **Minimum viable day card:** protein, steps, no off-plan dessert, plus the weigh-in row (tap to log if missing).
- Weigh-in: if no weigh-in today, a prominent "Log weigh-in" row sits at the top until logged.

### Meal

- Hero photo (placeholder until a photo is added). Glass back button and glass **Swap** button over the hero. "Add photo" control on the placeholder.
- Slot, time, name, chips for calories and protein per portion.
- **Cooking for** segmented control: 1 portion, 2 days, 3 days. Changing it updates every amount in place.
- **Put on the scale** list: ingredient name, state (raw/cooked/as is), grams. Amounts = per-portion grams × portions.
- When 2 or 3 is selected, an **After cooking** card asks for the cooked weight of the batch's main protein. Saving creates a batch: each portion = cooked weight / portions. On the following days, if the planned meal matches an open batch, the Meal screen leads with "From Monday's batch: put 246 g cooked chicken on the scale" and the remaining ingredients.
- Steps (numbered).
- Floating glass action bar: **Ate it** (logs the meal for today's slot with its calories and protein).
- **Swap** opens a glass sheet listing other meals for the same slot that fit today's mode (weekday/weekend), sorted by fit to the calories and protein left today, with a toggle **Just today / Always** (always = replace this meal in future rotation for that slot by resting the original for 4 weeks). Picking one replaces the planned meal.

### Off-plan sheet

Fields: what it was (text), category (meal, snack, dessert, drink), calories estimate, protein estimate, and a **Relaxed meal** toggle (weekend restaurant). Quick-pick presets: "Restaurant meal (relaxed)" ~900 cal / 50 g, "Ranch Water" 100 cal / 0 g. Relaxed meals count toward totals but never break the streak.

### Workout

- Hero: photo of the current exercise (start and end frames alternate every 1.5 s), glass back button, elapsed timer, glass **Swap** button.
- Exercise name, rep range, "N sets to failure" (2 normally, 1 in deload weeks), progress segments for the session.
- **Last time** box with last session's sets for this exercise. "Beat it."
- Set rows: set number, weight (prefilled with last weight, or the increased weight if progression says go up), reps, log button. Logged sets show a green check.
- Rest timer in the floating glass bar after each logged set: 2:30 for presses and rows (compound), 1:30 for isolation. Skip rest button.
- Done exercises collapse into a row with thumbnail, sets, and a progression callout ("Both sets hit 10. Next time 65 lb").
- Up next list with thumbnails and last-time numbers.
- **Swap** sheet: alternatives for the same primary muscle from the curated swap list, with **Just today / Always** toggle. Swapped exercises keep their own history.
- **End workout**: saves the session. A session with at least one logged set counts as done for the day.
- **Plan B** opens the same screen with the home workout.

### Plan

- Phase timeline: 13 week blocks, current week highlighted, deload (week 8), maintenance (week 12), checkpoint (week 13) marked, legend.
- This week's daily targets: calories, protein, steps.
- This week day by day: training focus or rest, optional session on Tue/Thu, weekend mode on Sat/Sun, check-in link on Sunday.
- Tapping a training day shows its exercise list (read only).

### Progress

- Weight card: 7-day average, change since start, chart of daily weigh-ins (dots) and the 7-day average (line) since the phase start.
- Tiles: waist (latest, change), days on plan (count and streak), workouts done vs planned, average steps vs goal.
- Getting stronger: top lifts by weight gained since first logged session, with thumbnails.
- Progress photos card: next scheduled date only (photos stay on the phone in v1).

### Sunday check-in

Available from Sunday 5pm through Monday noon; prompted by notification and a Today card. One scrolling page:

1. **How the week went:** 7-day average and change vs last week, days on plan (of 7), workouts done (of 3, plus optional), average steps vs goal. Waist input (inches).
2. **Rocky's call:** the adjustment rules' outcome in plain words, with any choice as a toggle (example: "Cut 150 calories" or "Add 1,000 steps").
3. **Next week's meals:** meals eaten 3+ times this week are listed with a **Rest** toggle (on by default for 3+). Rested meals stay out of rotation for 2 weeks. "New this week" chips show meals entering rotation. The generated plan for next week is shown compactly; any day's meal can be swapped.
4. **Groceries:** "Grocery list ready, N items" opens the list for next week's planned meals.
5. **Finish check-in** saves everything, applies target changes from Monday, and stores the check-in record.

### Grocery list

Ingredients for the week's planned meals, summed by food across meals and portions, grouped by section (meat and seafood, dairy and eggs, produce, pantry). Amounts in grams with a friendly rounding (to the nearest 50 g above 200 g). Each line has a checkbox (state kept for the week).

### Library

Two segments: **Meals** and **Exercises**.
- Meals: grouped by slot, weekend-only meals labeled, search by name. Shows rested status. Tapping opens the Meal screen in browse mode (no "Ate it" unless today has that slot unlogged).
- Exercises: grouped by primary muscle, photo, name, equipment. Shows which plan day uses it.

### Settings

Reached from the Today header (glass circle button). Contains: enable notifications (with iPhone install instructions when not installed to the Home Screen), reminder toggles and times, the Shortcut setup instructions with the ingest URL and token (token shown masked with a copy button), and sign out.

### Login

Single password field. On success, a session cookie that lasts 400 days. No signup, no password reset (the password is a Worker secret).

### Responsive and theme

- Phone first (390 px design width). At 900 px and up, the tab bar becomes a floating glass sidebar on the left, content centers at max 760 px, and Today uses two columns (rings, Rocky, workout | meals, minimum viable day).
- Follows the OS theme. Dark is the primary, designed palette; light uses Apple's light system colors with the same layout.

## Visual system

| Token | Dark | Light |
|---|---|---|
| `--bg` | `#000000` | `#F2F2F7` |
| `--card` | `#1C1C1E` | `#FFFFFF` |
| `--fill` | `#2C2C2E` | `#E5E5EA` |
| `--separator` | `#38383A` | `#C6C6C8` |
| `--label` | `#FFFFFF` | `#000000` |
| `--label-2` | `#98989F` | `#6C6C70` |
| `--label-3` | `#8E8E93` | `#6C6C70` |
| `--calories` | `#FF375F` | `#D70F45` |
| `--protein` | `#64D2FF` | `#0071A4` |
| `--steps` | `#30D158` | `#248A3D` |
| `--warn` | `#FF9F0A` | `#B25000` |

- Font: `-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif`. Large titles 34/700, section titles 22/700, body 16-17, captions 13. Tabular numbers for all figures.
- Cards: radius 26 (lists, large cards), 20 (tiles), 14 (thumbnails, inputs).
- **Glass** (navigation layer only: tab bar, back buttons, swap buttons, segmented controls, action bars, chips over images): translucent fill, `backdrop-filter: blur(24-28px) saturate(180%)`, 0.5 px light border, inner top highlight, soft drop shadow. Exact recipes live in `app/styles/glass.css`. Primary action: near-white prominent glass with black text.
- Color appears only on data (rings, bars, changes). Chrome stays neutral.
- Touch targets at least 44 px. Text contrast at least 4.5:1.

## Domain rules

All rules live in pure TypeScript modules under `app/domain/` with unit tests. Numbers come from `content/plan.json` so the plan can change without code changes.

### Calendar

- Phase 1 starts Monday 2026-10-05. `weekNumber(date) = floor(daysBetween(start, date) / 7) + 1`.
- Week types: 1 to 7 standard, 8 deload, 9 to 11 standard, 12 maintenance, 13 checkpoint. Week 14 onward: standard until Phase 2 is written into `content/plan.json`.
- Training days: Monday (Chest, Back, Arms), Wednesday (Legs, Shoulders), Friday (Chest, Shoulders, Arms). Optional session offered Tuesday and Thursday. Weekdays are weekday mode (animal-based), Saturday and Sunday weekend mode (meat-first whole foods).
- Relaxed days: 2026-11-26 (Thanksgiving), 2026-12-25 (Christmas). A relaxed day always counts as on plan.

### Daily targets

- Calories: current target (starts 2,400). Maintenance week (12): 2,800. Check-in adjustments change the base target.
- Protein: 180 g.
- Steps: current goal (starts 7,000 in week 1). Ramp: at check-in, if the week's average steps met the goal, next week's goal is +500, capped at 10,000. Otherwise unchanged.
- Sets per exercise: 2, or 1 in a deload week.

### Meal macros

- Each food has kcal and protein per 100 g for a stated state (raw, cooked, as is), sourced from USDA FoodData Central with the `fdcId` recorded. SR Legacy entries are preferred (stable ids, energy always present); Foundation entries only where SR Legacy has none. Values are snapshotted in `content/foods.json`, never looked up live. Foods with no FDC entry (sauces, branded items) use the product label and record `source: "label"`.
- Meal calories and protein per portion = sum over ingredients of `grams / 100 × per100g`, rounded to the nearest 5 kcal and 1 g.
- Scaling for N portions multiplies every ingredient's grams by N (rounded to the nearest gram; amounts under 20 g to the nearest 1 g, otherwise nearest 5 g).
- Batch portion = cooked weight / N, rounded to the nearest 5 g.

### Meal rotation

Generated for Monday to Sunday at check-in (and at first run for the current week). Deterministic given the week start and the meal history, so it is testable.

1. Slots per day: breakfast, lunch, snack, dinner, dessert. Lunch and dinner draw from the `main` pool.
2. Candidates: meals for the slot, mode `weekday` or `any` on Monday to Friday, any mode on Saturday and Sunday. Exclude rested meals.
3. Constraints: no meal on two consecutive days in the same slot pool; any meal at most twice per week; lunch and dinner on the same day differ; meals tagged `ground-beef` at most once per week.
4. Ranking: least recently eaten first (days since last eaten, never-eaten counts as 999), ties broken by a seeded shuffle keyed on the week start.
5. If constraints leave no candidate, relax in this order: the twice-per-week cap, then consecutive days. Never violate rested or ground beef.

### Workout progression

- Each plan exercise has a rep range and an increment: 5 lb for upper body, 10 lb for legs.
- After a session, for each exercise: if every working set reached the top of the rep range, the next session's suggested weight is last weight + increment and the exercise shows "Go up to X lb today". Otherwise the suggestion is the same weight.
- In a deload week the suggestion is the same weight, 1 set.
- History is per exercise. Swapping changes which exercise's history shows.

### Minimum viable day, on plan, streak

- A day is **on plan** if all hold: protein eaten ≥ protein target; steps ≥ step goal; no off-plan entry with category `dessert` that is not marked relaxed. Relaxed days are always on plan.
- Today's status shows live progress. A day's final status is evaluated after midnight.
- **Streak** = consecutive on-plan days ending yesterday, plus today if today is already on plan.
- **Adherence** for a week = on-plan days out of 7. A week is "on plan" when adherence is at least 6 of 7.

### Weight trend

- 7-day average for a date = mean of weigh-ins in the 7 days ending that date. Needs at least 3 weigh-ins, otherwise no value.
- Weekly change = 7-day average on this check-in Sunday minus last check-in Sunday.

### Adjustment rules (check-in)

Evaluated in order; the first match wins. "Loss" is the weekly change, negative is losing.

| Condition | Outcome |
|---|---|
| Fewer than 2 weeks of weigh-in data | "Too early to adjust. Keep going." No change. |
| Week not on plan (adherence < 6/7) | "Numbers stay put. Tighten up the plan first." No change. |
| Lost less than 0.5 lb in each of the last 2 weeks, both on plan | Offer a toggle: cut 150 calories (default) or add 1,000 steps (offered only while the step goal is under 10,000, capped there). Calories never go below 2,000. |
| Lost more than 2 lb in each of the last 2 weeks | Add 150 calories to protect muscle. |
| Otherwise | "On pace. No changes." |

Steps ramp is applied separately after this table.

### Warning signs

- **Missed workout:** on a training day, if no session has a logged set by 2:30pm, the 5pm reminder pushes Plan B. Two missed training days in a row (counting only Mon/Wed/Fri) puts a callout on Today until the next completed session.
- **Meal burnout:** at check-in, meals eaten 3+ times that week get the Rest toggle on by default.

### Rocky messages

Pre-written copy in `content/messages.json`, keyed by situation. The Today card picks the highest-priority situation that applies and rotates between that situation's variants by date so the same line does not repeat on consecutive days. Situations in priority order (a relaxed day wins over everything so holidays never nag):

0. `relaxed-day`: "Holiday. Enjoy it. Back on it tomorrow."
1. `missed-twice`: "Two training days missed. That's the pattern we said we'd catch. Plan B is 25 minutes. Do it tonight."
2. `missed-today`: "No lift yet today. Plan B at home still counts. Get it done."
3. `weigh-in-missing`: "Step on the scale first. One number, five seconds."
4. `training-day-morning`: "Breakfast is in, {protein} g protein down. Lift at noon, then {lunch} right after."
5. `protein-behind` (after 5pm, protein under 60%): "{left} g protein to go. The snack and dinner cover it if you eat both."
6. `steps-behind` (after 5pm, steps under 60%): "{left} steps left. Two 15-minute walks and you're there."
7. `kitchen-closed` (after dessert time): "Dessert's done. Kitchen's closed. See you at breakfast."
8. `on-plan`: "On plan today. {streak} days straight. Keep stacking them."
9. `default`: "One meal at a time. Next up: {nextMeal}."

Each situation gets 3 variants in the content file.

## Reminders

Web push, scheduled by the 5-minute cron in America/Chicago time. Each reminder fires at most once per day (dedupe table) and only if its condition still holds when it fires. All reminders can be toggled in Settings; times are editable.

| Reminder | Default time | Days | Condition |
|---|---|---|---|
| Weigh-in | 7:30am | Every day | No weigh-in today |
| Breakfast | 8:00am | Every day | Breakfast not logged |
| Lift | 11:30am | Mon, Wed, Fri | No session started |
| Lunch | 2:30pm | Every day | Lunch not logged |
| Snack | 3:45pm | Every day | Snack not logged |
| Plan B | 5:00pm | Mon, Wed, Fri | No logged set today |
| Steps | 6:00pm | Every day | Steps under 60% of goal |
| Dinner | 7:00pm | Every day | Dinner not logged |
| Kitchen closes | 8:30pm | Every day | Always (after dessert slot) |
| Check-in | 7:00pm | Sunday | Check-in not done |

Meal slot times (for "Up next" and reminders): breakfast 7:30am, lunch 2:00pm, snack 3:30pm, dinner 6:30pm, dessert 8:00pm.

## Integrations

### Steps from Apple Watch (iOS Shortcut)

- Endpoint: `POST /api/ingest/steps`, header `Authorization: Bearer <INGEST_TOKEN>`, JSON `{ "date": "YYYY-MM-DD", "steps": 1234 }`. Upserts the day's total (the Shortcut always sends the full-day sum, so the last write wins).
- Personal automations at 12pm, 3pm, 6pm, and 9pm run the Shortcut without asking. iOS encrypts Health data while the phone is locked, so a run while locked may fail; several runs a day plus the idempotent upsert make that harmless. The Shortcut uses Find Health Samples (Steps, today, grouped by day) so iPhone and Watch steps are not double counted; verify once against the Health app. Setup instructions live in Settings and in `docs/runbooks/steps-shortcut.md`.

### Web Push

- VAPID keys stored as Worker secrets. The PWA asks for permission from a button tap in Settings (iOS requires a user gesture and Home Screen install).
- Subscriptions stored in D1; a 404 or 410 from the push service deletes the subscription.

### Photos (R2)

- Meal photos: uploaded from the Meal screen, resized in the browser to max 1600 px JPEG, stored at `meals/<mealSlug>/<uuid>.jpg`, served through an authenticated `/media/*` route with long cache headers.
- Exercise images: a setup script copies the free-exercise-db photos for every library exercise to `exercises/<dbId>/0.jpg` and `1.jpg`. Never hotlink GitHub.

### Exercise swap library

`content/exercises.json` holds the 26 plan exercises plus 2 to 3 curated alternatives per primary muscle. Every image is checked by eye before it ships (contact-sheet step in the build plan). Only curated exercises appear in swaps.

## Content and recipe import

Plan content lives as files in the repo and is **bundled into the Worker at build time** (JSON imports and `import.meta.glob`). There is no content sync step: changing content means commit, push, deploy.

| File | Holds |
|---|---|
| `content/plan.json` | Phase dates, week types, starting targets, training templates, slot times, relaxed days, slot calorie ranges |
| `content/foods.json` | Foods with fdcId, data source, state, kcal and protein per 100 g, grocery section |
| `content/meals/*.json` | One file per meal: slug, name, pool, mode, tags, ingredients (food id, grams per portion, note), steps, source |
| `content/exercises.json` | Exercises with free-exercise-db id, swap group, equipment, compound flag, increment |
| `content/messages.json` | Rocky copy by situation |

- The `unit` test project validates every content file (schema, food references, computed macros within slot ranges, ground beef tags, every template exercise exists, every exercise image is listed in `docs/exercises.md`).
- Runtime state about content lives in D1 keyed by slug or id (meal photo, rested-until, exercise overrides). Logs snapshot the meal's name, calories, and protein, so removing a meal file never breaks history.
- **Recipe import** (Claude Code): Kameron sends a recipe. Claude follows `docs/runbooks/add-recipe.md`: map ingredients to foods (adding foods from FDC when missing), convert to grams in the weighed state, scale the portion to the slot's targets (main: ~650 cal, 55 g+ protein; breakfast: ~600 cal, 55 g+; snack: 180 to 280 cal, 20 g+; dessert: under 250 cal), swap processed ingredients and seed oils for whole-food alternatives (noting the swap), set mode (`any` only if it fits the animal-based weekday rules, else `weekend`), write the meal file, run the tests, commit, push (Workers Builds deploys).

## Auth and security

- Single password stored as Worker secret `APP_PASSWORD`. Compared in constant time.
- Login attempts limited to 5 per 15 minutes per IP (D1 table).
- Session: signed cookie (`SESSION_SECRET`), `HttpOnly`, `Secure`, `SameSite=Lax`, max age 400 days.
- Every page and API route requires the session except `/login`, `/api/ingest/*` (bearer token), static assets, the manifest, and the service worker.
- Health data never appears in logs.

## Data model (D1)

| Table | Key columns |
|---|---|
| `meal_state` | slug (pk), photo_key, rested_until |
| `exercise_overrides` | template_id, position, exercise_id (from "Always" swaps) |
| `exercise_swaps` | date, template_id, position, exercise_id (from "Just today" swaps) |
| `planned_meals` | date, slot, meal_slug, swapped |
| `meal_logs` | id, date, slot, meal_slug (null for off-plan), name, category, kcal, protein_g, relaxed, portions, logged_at |
| `batches` | id, meal_slug, portions, cooked_weight_g, portion_g, created_on, portions_left |
| `workout_sessions` | id, date, template_id, started_at, ended_at |
| `set_logs` | id, session_id, exercise_id, set_number, weight_lb, reps, logged_at |
| `weigh_ins` | date (pk), weight_lb, logged_at |
| `waist_logs` | date (pk), inches |
| `steps_daily` | date (pk), steps, updated_at |
| `targets` | effective_from (pk), kcal, protein_g, step_goal |
| `check_ins` | week_start (pk), avg_weight, change, adherence, outcome (json), completed_at |
| `push_subscriptions` | endpoint (pk), p256dh, auth, created_at |
| `reminder_settings` | kind (pk), enabled, time |
| `notifications_sent` | kind, date (pk together) |
| `login_attempts` | ip, attempted_at |
| `grocery_checks` | week_start, food_id |

## Backups

- D1 Time Travel covers point-in-time restore (30 days on Workers Paid, 7 on Free).
- A weekly cron job (Sunday 3am) exports every table to JSON in R2 at `backups/YYYY-MM-DD.json` and keeps the last 12.

## Edge cases

- **No weigh-in for days:** averages use what exists; under 3 weigh-ins in 7 days shows "Not enough weigh-ins".
- **Daylight saving:** all scheduling uses `Intl` with `America/Chicago`, never fixed offsets.
- **Bad signal at the gym:** set logs and meal check-offs are queued in the browser when a request fails and retried on reconnect, with a small "Saving..." indicator. The service worker caches the app shell.
- **Logging past midnight:** a meal logged between midnight and 3am counts for the previous day (late dessert).
- **Plan changes mid-week:** target changes from check-in apply from the next Monday; swaps apply immediately.
- **Missed check-in:** if not done by Monday noon, next week's meal plan is generated automatically with defaults (no rest toggles, no target changes) and Today shows "Check-in skipped".
- **Phase end:** at week 13 the Plan tab shows the checkpoint; week 14+ repeats standard weeks until Phase 2 content lands.
- **Meal file removed but still planned:** the planned slot falls back to a fresh rotation pick for that slot; logs keep their snapshot.

## Out of scope for v1

AI chat, progress photos in the app, strength history and PR charts beyond the Progress list, weight sync from a smart scale, native iOS app, multiple users, water tracking.

## Verification before calling v1 done

- Deployed at `https://kampduh.com`, login persists across days on the iPhone Home Screen app.
- A real web push arrives on Kameron's iPhone from the cron (not just a passing test).
- The Shortcut posts steps from the Apple Watch and the steps ring updates.
- A full day is walked through on the phone: weigh-in, meals checked off, a batch cooked and split, a workout logged with a swap, the Today rings and minimum viable day updating.
- A check-in is completed with test data and generates next week's plan and grocery list.
- The weekly backup file appears in R2.
