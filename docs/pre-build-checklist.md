# Rocky the Coach: Pre-Build Checklist

Everything we need to settle before writing any code, in the order to do it. Each step feeds the next one.

**Owner key:** **K** = Kameron, **C** = Claude, **K+C** = together in a session.

| # | Step | Owner | Output |
|---|------|-------|--------|
| 1 | Brain-dump your plan | K | Raw notes |
| 2 | Baseline numbers | K | Starting stats |
| 3 | Fill the gaps in the plan | K+C | `docs/plan.md` (approved) |
| 4 | Decide what v1 of the app does | K+C | Locked feature list |
| 5 | Data sources and integrations | K+C | Integration choices |
| 6 | Tech stack and hosting | K+C | Stack + domain decision |
| 7 | Look and feel | K+C | Approved wireframes |
| 8 | Spec and build plan | C (K approves) | `docs/spec.md` + build plan |
| 9 | Accounts and access | K | Everything the build needs on day one |

---

## Step 1: Brain-dump your plan (K)

Get it out of your head in any format. Messy is fine. Paste it in chat or drop it in `docs/my-plan-raw.md`.

- [x] **Goal:** what success looks like and by when
- [x] **Training:** what you plan to do and how often
- [x] **Nutrition:** what you plan to eat, and what you are cutting out
- [x] **Rules you have already decided** (anything non-negotiable)
- [x] **Your schedule:** work hours, when you would train, when you eat

---

## Step 2: Baseline numbers (K)

Targets come from these, so they need to be real numbers, not guesses.

- [x] Age, height, current weight
- [ ] Waist measurement (at the belly button)
- [x] Body fat estimate, if you have one (not required)
- [ ] Starting photos: front, side, back. Keep them private, **never in this repo**
- [x] Job type: desk, on your feet, or mixed
- [x] Current average daily steps (check your phone's Health app)
- [x] What a typical day of eating looks like right now, honestly
- [x] Typical bedtime and wake time
- [x] Injuries, pain, medical conditions, or medications that affect training or appetite
- [x] Equipment: gym membership, home gear, or both
- [x] Trackers you own: Apple Watch, smart scale, anything else

If anything on the medical line applies, get a doctor's OK on the calorie target and training intensity before we lock them in.

---

## Step 3: Fill the gaps in the plan (K+C)

These are the questions most plans leave open. We only go through the ones your Step 1 notes do not already answer.

### Goal and timeline

- [x] One **primary** goal: lose fat, build muscle, recomp, performance, or general health
- [x] Target number and date (example: 190 lb by March 1)
- [x] Rate sanity check (sustainable fat loss is roughly 0.5 to 1% of bodyweight per week)
- [x] Phases (example: 12-week cut, 2-week maintenance break, reassess)
- [x] Non-scale goals: lifts, waist size, energy, how clothes fit

### Training

- [x] Days per week, and which days
- [x] Split: full body, upper/lower, push/pull/legs, or something else
- [x] Exercises, sets, reps, and rest for each day
- [x] **Progression rule:** exactly when you add weight or reps
- [x] Cardio: type, how often, how long
- [x] Daily step target
- [x] Deload and rest-day rules
- [x] **Plan B workout:** a 20-minute version for bad days, travel, or no gym

### Nutrition

- [x] Calorie target (we estimate from Step 2, then correct it from your real weight trend after 2 to 3 weeks)
- [x] Protein target first, then the fat and carb split
- [x] **Tracking approach** (biggest decision here, it shapes the whole app):
  - Strict: log every food and gram
  - Fixed menu: rotate set meals, just check them off
  - Hybrid: fixed menu, only log what is off-plan
- [x] Meals per day and timing
- [x] Go-to meals list: breakfasts, lunches, dinners, snacks. The more fixed this is, the easier the app is to follow
- [x] Grocery list and meal-prep day
- [x] Eating out: rules, plus go-to orders at the places you actually go
- [x] Alcohol rules
- [x] Planned flexibility: free-meal policy (how often, how big)
- [x] Water target
- [x] Supplements (protein powder, creatine, etc.)

### Recovery

- [x] Sleep target and a bedtime
- [x] What a rest day looks like

### The "old ways" (most important section for this app)

The app's main job is stopping drift, so we need specifics, not "I fall off sometimes."

- [x] What are the old ways, exactly? (late-night snacking, skipping the gym after work, weekends, fast food on the drive home, one bad meal turning into a bad week...)
- [x] When do they happen? Time of day, day of week, stress, travel, social events
- [x] What made you fall off before? What worked before, even briefly?
- [x] Early warning signs (example: skipping one log, then two)
- [x] **If-then rule for each trigger.** Example: "If it's after 9pm and I want to snack, then I drink water and go to bed."
- [x] **Minimum viable day:** the smallest set of actions that still counts as "on plan" on your worst day
- [x] **Miss rule:** what happens after a missed workout or off-plan meal (example: never miss twice in a row)
- [x] **Coach tone:** how Rocky talks to you when you slip. Drill sergeant, straight shooter, or encouraging

### Tracking and check-ins

- [x] Daily log: which of weight, workout done, meals hit, steps, water, sleep. Target: under 2 minutes a day
- [x] Weekly check-in: which day, what gets reviewed (average weight vs last week, adherence %, waist; photos every 2 to 4 weeks)
- [x] **Adjustment rules decided now**, so you never renegotiate mid-week. Example: if the weekly average has not moved in 2 weeks and adherence is above 90%, drop 150 calories or add 2,000 steps

**Output:** C writes `docs/plan.md` as the single source of truth. K approves it. This becomes the app's starting data.

---

## Step 4: Decide what v1 of the app does (K+C)

Mark each one **v1**, **later**, or **never**. Rule of thumb: v1 is the smallest thing you will actually open every day.

| Feature | What it means |
|---------|---------------|
| Today screen | Home screen: today's workout, meals, targets, and checklist |
| Plan calendar | This week, plus the full phase timeline and where you are in it |
| Workout logging | Sets, reps, weight, with last session's numbers shown to beat |
| Food logging | Depends on the tracking approach from Step 3 |
| Weigh-in + trend chart | Daily weight shown as a 7-day average so daily swings do not mess with your head |
| Streaks and adherence score | Visible proof you are on track |
| Weekly check-in flow | Guided review that applies the adjustment rules |
| Reminders and nudges | Workout time, meal times, bedtime, logging (no water tracking, not needed) |
| If-then prompts | Your trigger rules pushed at trigger times (example: 8:45pm "Kitchen's closed.") |
| Progress | Photos, measurements, lift PRs |
| AI coach chat ("Rocky") | Ask questions, get pushback, weekly review written for you. Costs per message |
| Grocery list | Generated from the meal plan |
| Health sync | Steps and weight pulled in automatically |

### v1 scope (locked 2026-10-03)

| v1 | Later |
|---|---|
| Today screen: workout, meals, snack, dessert, steps, minimum viable day checklist | AI Rocky chat |
| Meals: recipe view, portion toggle, scale amounts, check-off, quick off-plan log | Progress photos in the app |
| Meal library with swaps | Strength history and PR charts |
| Workouts: live set logging, numbers to beat, add-weight flag, Plan B | |
| Exercise library with swaps | |
| Weigh-in: 7-day trend, waist | |
| Steps: automatic from Apple Watch via iOS Shortcut | |
| Reminders: meal nudges, training-day nudge, kitchen closes | |
| Sunday check-in: review, adjustment rules, pick meals, grocery list, rest old meals | |
| Streaks: days on plan, relaxed meals do not break them | |

Rocky's voice in v1 comes from pre-written messages in the straight shooter + encouraging tone.

**Requirements already captured** (from Step 3 answers):

- **Toggles over pages.** Options live as inline toggles right where they apply, not as separate steps or screens. Example: the 1 portion vs 2 to 3 days toggle sits just above the recipe and instantly updates every amount.
- **Scale amounts, no math.** Every meal shows each ingredient as "put X g on the scale." The app handles raw vs cooked conversions.
- **Cook for 1 or a batch.** Toggle between 1 portion and 2 to 3 days' worth, and every ingredient's gram amount updates in place.
- **Batch prep math.** For 2 to 3 day prep: weigh the cooked batch once, the app splits it into per-meal gram portions.
- **Swap anything.** Any meal or exercise on the plan has a swap button that opens its library inline. Meals: same slot (breakfast, lunch, snack...), filtered by weekday or weekend mode, sorted by how well each fits the calories and protein left today. Exercises: same muscle group (handy when a machine is taken). A toggle on the swap sets "just today" or "always use this instead." Swapped exercises keep their own progress history.
- **Images for every exercise and meal.** Exercises: start and end photos from free-exercise-db, verified to match. Meals: placeholder until Kameron adds their own photo from the meal screen.
- **Recipe import, through Claude Code (no AI in the app).** Kameron sends a recipe (screenshot, caption, or link) in a Claude Code session. Claude converts it to scale amounts, calculates calories and protein from USDA data, fits the portion to the plan's meal targets, flags rule breakers (processed food, seed oils) with swaps, tags weekday or weekend, and adds it. So the meal library lives as files in this repo with a sync command that pushes them to production, plus a written runbook (or project skill) so every recipe is added the same way.
- **No prep schedule.** Cooking happens whenever food is needed. The app never assumes set prep days.
- **Meal library with rotation.** The app picks meals so nothing repeats too often (the anti-burnout rule).
- **Log in the moment.** Meals, sets, and weigh-ins are logged as they happen, never reconstructed the next day. Meal-time nudges if something has not been checked off.
- **Warning-sign watch.** A missed training day gets a same-day nudge toward the Plan B home workout.
- **Weekday vs weekend modes.** Animal-based meals on weekdays, meat-first whole foods on weekends.
- **Relaxed restaurant meals.** 1 to 2 per weekend, logged quickly or just marked as relaxed, without breaking a streak.

---

## Step 5: Data sources and integrations (K+C)

- [x] **Exercise images:** free-exercise-db (github.com/yuhonas/free-exercise-db). Public domain (Unlicense), 800+ exercises with photos. Every plan exercise mapped and checked by eye: `docs/exercises.md`.
- [x] **Meal images:** **Decided: placeholders, replaced by your own photos.** Snap a photo the first time you cook a meal and it becomes that meal's picture. Needs photo storage (Cloudflare R2).
- [x] **Food data**, based on the tracking approach (leaning: USDA FoodData Central for ingredient numbers, including raw and cooked values, feeding your own meal library):
  - Your own saved meals only (free, simplest)
  - USDA FoodData Central (free API, generic foods)
  - Open Food Facts (free, barcode scanning)
  - Keep using MyFitnessPal or Cronometer for food and only track adherence here (MyFitnessPal has no public API, so no sync)
- [x] **Apple Health:** a website cannot read Apple Health directly. Workaround is an iOS Shortcut automation that sends steps and weight to the app once a day. **Decided: v1, automatic steps via Shortcut**
- [x] **Notification channel:** **Decided: web push** (free). Weight is entered by hand each morning; the scale does not sync to Apple Health.
  - Web push: free, works on iPhone once the app is added to the home screen (iOS 16.4+)
  - Email: free, easy to ignore
  - Text (Twilio): hardest to ignore, small monthly cost
- [x] **AI coach:** only if it made v1. Needs an Anthropic API key and a monthly spending cap. **Decided: later, not v1**

---

## Step 6: Tech stack and hosting (K+C)

`kampduh.com` is on Cloudflare. The stack is open (it does not have to be Laravel). Cloudflare's own hosting (Workers) runs JavaScript/TypeScript, not PHP, so the choice comes down to two setups. Either way, the site lives at your domain and Cloudflare handles the DNS and SSL.

| | A. Fully on Cloudflare | B. Laravel app, Cloudflare in front |
|---|---|---|
| What | TypeScript full-stack app on Cloudflare Workers, D1 database (SQLite), Cron Triggers for reminders | Laravel + Livewire + Flux + Postgres, hosted on Laravel Cloud. Cloudflare points the domain at it |
| Cost | Likely $0 on the free tier for one user | Small monthly hosting bill |
| Pros | Everything in one place, next to the domain you already own. Scheduled reminders, web push, and AI calls all run there | Your usual stack. Auth and scheduling come built in |
| Cons | Auth and some plumbing built by hand (small job for a single-user app) | Two dashboards, two bills |

**Decided: A, fully on Cloudflare** (2026-10-03). With Laravel off the table as a requirement, a one-person app fits Cloudflare's free tier comfortably and keeps everything in one place. The exact framework (React Router, SvelteKit, etc.) is a build detail C settles in the spec.

Other decisions:

- [x] **Address:** `rocky.kampduh.com` or the root `kampduh.com`? (Is the root used for anything else?) **Decided: `kampduh.com`** (root, nothing else uses it).
- [x] **Installable app (PWA):** home-screen icon, full-screen, push notifications. Recommended, since this lives on your phone **Decided: yes** (required for web push on iPhone).
- [x] **Login:** just you. Single account, no signup page, long-lived session so you are never logging in at the gym **Decided.**
- [x] **Backups:** this is months of personal health data, so automated database backups from day one D1 Time Travel restores to any point in the last 30 days, plus a scheduled export.
- [x] **Local dev:** if A, runs from this repo with Cloudflare's local dev server (no extra setup). If B, move the repo to `~/Herd/rocky-the-coach` so Herd serves it at `rocky-the-coach.test`, with local Postgres DB `rocky_the_coach` **Decided: A.**

---

## Step 7: Look and feel (K+C)

- [x] Phone-first? **Decided: phone first, desktop must work too** (Sunday check-in, occasional use)
- [x] Vibe: **Decided: clean, Apple Liquid Glass.** Quality bar: Apple Fitness and Bevel. System font (SF Pro on Apple devices). Navigation and controls are floating glass (tab bar, buttons, toggles); content sits on solid dark cards. No orange as the main color: chrome stays neutral, color is only for data (calories pink, protein cyan, steps green).
- [x] Wireframes of the main screens: **Today**, **Week/Plan**, **Progress**, **Weekly Check-in**. C mocks these before any code
  - 6 phone screens (Today, Meal, Workout, Plan, Progress, Sunday check-in): https://claude.ai/artifact/WRiVyTVMD7GoJkGSqkoedQ. Liquid Glass style, **approved 2026-10-03**.
- [x] Keep the "Rocky" name? **Decided: yes.** Icon: K generates it with AI from C's suggested prompts

---

## Step 8: Spec and build plan (C writes, K approves)

- [x] `docs/plan.md`: your fitness and nutrition plan (from Step 3)
- [x] `docs/spec.md`: v1 features, screens, data model, reminder schedule, edge cases (missed days, travel, plan phase changes)
- [x] Build plan broken into sessions, test-first: six milestones in `docs/superpowers/plans/` (M1 foundation and deploy, M2 domain rules, M3 Today and meals, M4 workouts, M5 plan/progress/check-in, M6 reminders, integrations, launch)
- [x] Seed data: your plan loaded into the app on day one, so it opens already set up (starter content written out in M1 Task 6, macros checked against USDA)

---

## Step 9: Accounts and access (K)

- [x] Cloudflare: confirm access to `kampduh.com` DNS
- [x] Hosting: nothing extra if Step 6 lands on Cloudflare. Laravel Cloud account only if it lands on B (Cloudflare chosen, nothing extra needed.)
- [x] GitHub: `kameronpduhon/rocky-the-coach` exists and is connected
- [x] Anthropic API key with a spend limit (not needed: AI coach is not v1)
- [x] Twilio account (only if text reminders are v1) (not needed: web push chosen)
- [x] iPhone on iOS 16.4 or later (for web push; a real push arrived 2026-10-03)

---

## Ready to build when

- [x] `docs/plan.md` approved
- [x] v1 feature list locked
- [x] Stack, hosting, and address decided
- [x] Wireframes approved
- [x] `docs/spec.md` and build plan written
- [x] Step 9 accounts ready

**Next action:** v1 shipped 2026-10-03. Build the steps Shortcut (Settings, Steps from Apple Watch) before Monday 2026-10-05, and log the starting waist and photos above.
