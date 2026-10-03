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

- [ ] **Goal:** what success looks like and by when
- [ ] **Training:** what you plan to do and how often
- [ ] **Nutrition:** what you plan to eat, and what you are cutting out
- [ ] **Rules you have already decided** (anything non-negotiable)
- [ ] **Your schedule:** work hours, when you would train, when you eat

---

## Step 2: Baseline numbers (K)

Targets come from these, so they need to be real numbers, not guesses.

- [ ] Age, height, current weight
- [ ] Waist measurement (at the belly button)
- [ ] Body fat estimate, if you have one (not required)
- [ ] Starting photos: front, side, back. Keep them private, **never in this repo**
- [ ] Job type: desk, on your feet, or mixed
- [ ] Current average daily steps (check your phone's Health app)
- [ ] What a typical day of eating looks like right now, honestly
- [ ] Typical bedtime and wake time
- [ ] Injuries, pain, medical conditions, or medications that affect training or appetite
- [ ] Equipment: gym membership, home gear, or both
- [ ] Trackers you own: Apple Watch, smart scale, anything else

If anything on the medical line applies, get a doctor's OK on the calorie target and training intensity before we lock them in.

---

## Step 3: Fill the gaps in the plan (K+C)

These are the questions most plans leave open. We only go through the ones your Step 1 notes do not already answer.

### Goal and timeline

- [ ] One **primary** goal: lose fat, build muscle, recomp, performance, or general health
- [ ] Target number and date (example: 190 lb by March 1)
- [ ] Rate sanity check (sustainable fat loss is roughly 0.5 to 1% of bodyweight per week)
- [ ] Phases (example: 12-week cut, 2-week maintenance break, reassess)
- [ ] Non-scale goals: lifts, waist size, energy, how clothes fit

### Training

- [ ] Days per week, and which days
- [ ] Split: full body, upper/lower, push/pull/legs, or something else
- [ ] Exercises, sets, reps, and rest for each day
- [ ] **Progression rule:** exactly when you add weight or reps
- [ ] Cardio: type, how often, how long
- [ ] Daily step target
- [ ] Deload and rest-day rules
- [ ] **Plan B workout:** a 20-minute version for bad days, travel, or no gym

### Nutrition

- [ ] Calorie target (we estimate from Step 2, then correct it from your real weight trend after 2 to 3 weeks)
- [ ] Protein target first, then the fat and carb split
- [ ] **Tracking approach** (biggest decision here, it shapes the whole app):
  - Strict: log every food and gram
  - Fixed menu: rotate set meals, just check them off
  - Hybrid: fixed menu, only log what is off-plan
- [ ] Meals per day and timing
- [ ] Go-to meals list: breakfasts, lunches, dinners, snacks. The more fixed this is, the easier the app is to follow
- [ ] Grocery list and meal-prep day
- [ ] Eating out: rules, plus go-to orders at the places you actually go
- [ ] Alcohol rules
- [ ] Planned flexibility: free-meal policy (how often, how big)
- [ ] Water target
- [ ] Supplements (protein powder, creatine, etc.)

### Recovery

- [ ] Sleep target and a bedtime
- [ ] What a rest day looks like

### The "old ways" (most important section for this app)

The app's main job is stopping drift, so we need specifics, not "I fall off sometimes."

- [ ] What are the old ways, exactly? (late-night snacking, skipping the gym after work, weekends, fast food on the drive home, one bad meal turning into a bad week...)
- [ ] When do they happen? Time of day, day of week, stress, travel, social events
- [ ] What made you fall off before? What worked before, even briefly?
- [ ] Early warning signs (example: skipping one log, then two)
- [ ] **If-then rule for each trigger.** Example: "If it's after 9pm and I want to snack, then I drink water and go to bed."
- [ ] **Minimum viable day:** the smallest set of actions that still counts as "on plan" on your worst day
- [ ] **Miss rule:** what happens after a missed workout or off-plan meal (example: never miss twice in a row)
- [ ] **Coach tone:** how Rocky talks to you when you slip. Drill sergeant, straight shooter, or encouraging

### Tracking and check-ins

- [ ] Daily log: which of weight, workout done, meals hit, steps, water, sleep. Target: under 2 minutes a day
- [ ] Weekly check-in: which day, what gets reviewed (average weight vs last week, adherence %, waist; photos every 2 to 4 weeks)
- [ ] **Adjustment rules decided now**, so you never renegotiate mid-week. Example: if the weekly average has not moved in 2 weeks and adherence is above 90%, drop 150 calories or add 2,000 steps

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
| Reminders and nudges | Workout time, meal times, bedtime, logging |
| If-then prompts | Your trigger rules pushed at trigger times (example: 8:45pm "Kitchen's closed.") |
| Progress | Photos, measurements, lift PRs |
| AI coach chat ("Rocky") | Ask questions, get pushback, weekly review written for you. Costs per message |
| Grocery list | Generated from the meal plan |
| Health sync | Steps and weight pulled in automatically |

Likely v1: Today screen, workout and meal check-off, weigh-in trend, reminders, weekly check-in.

---

## Step 5: Data sources and integrations (K+C)

- [ ] **Food data**, based on the tracking approach:
  - Your own saved meals only (free, simplest)
  - USDA FoodData Central (free API, generic foods)
  - Open Food Facts (free, barcode scanning)
  - Keep using MyFitnessPal or Cronometer for food and only track adherence here (MyFitnessPal has no public API, so no sync)
- [ ] **Apple Health:** a website cannot read Apple Health directly. Workaround is an iOS Shortcut automation that sends steps and weight to the app once a day. Decide if this is v1
- [ ] **Notification channel:**
  - Web push: free, works on iPhone once the app is added to the home screen (iOS 16.4+)
  - Email: free, easy to ignore
  - Text (Twilio): hardest to ignore, small monthly cost
- [ ] **AI coach:** only if it made v1. Needs an Anthropic API key and a monthly spending cap

---

## Step 6: Tech stack and hosting (K+C)

`kampduh.com` is on Cloudflare. The stack is open (it does not have to be Laravel). Cloudflare's own hosting (Workers) runs JavaScript/TypeScript, not PHP, so the choice comes down to two setups. Either way, the site lives at your domain and Cloudflare handles the DNS and SSL.

| | A. Fully on Cloudflare | B. Laravel app, Cloudflare in front |
|---|---|---|
| What | TypeScript full-stack app on Cloudflare Workers, D1 database (SQLite), Cron Triggers for reminders | Laravel + Livewire + Flux + Postgres, hosted on Laravel Cloud. Cloudflare points the domain at it |
| Cost | Likely $0 on the free tier for one user | Small monthly hosting bill |
| Pros | Everything in one place, next to the domain you already own. Scheduled reminders, web push, and AI calls all run there | Your usual stack. Auth and scheduling come built in |
| Cons | Auth and some plumbing built by hand (small job for a single-user app) | Two dashboards, two bills |

**Recommendation: A.** With Laravel off the table as a requirement, a one-person app fits Cloudflare's free tier comfortably and keeps everything in one place. The exact framework (React Router, SvelteKit, etc.) is a build detail C settles in the spec.

Other decisions:

- [ ] **Address:** `rocky.kampduh.com` or the root `kampduh.com`? (Is the root used for anything else?)
- [ ] **Installable app (PWA):** home-screen icon, full-screen, push notifications. Recommended, since this lives on your phone
- [ ] **Login:** just you. Single account, no signup page, long-lived session so you are never logging in at the gym
- [ ] **Backups:** this is months of personal health data, so automated database backups from day one
- [ ] **Local dev:** if A, runs from this repo with Cloudflare's local dev server (no extra setup). If B, move the repo to `~/Herd/rocky-the-coach` so Herd serves it at `rocky-the-coach.test`, with local Postgres DB `rocky_the_coach`

---

## Step 7: Look and feel (K+C)

- [ ] Phone-first? (Assumed yes: gym floor and kitchen)
- [ ] Vibe: gritty training-montage, clean and minimal, or data-dense dashboard
- [ ] Wireframes of the main screens: **Today**, **Week/Plan**, **Progress**, **Weekly Check-in**. C mocks these before any code
- [ ] Keep the "Rocky" name? App icon direction

---

## Step 8: Spec and build plan (C writes, K approves)

- [ ] `docs/plan.md`: your fitness and nutrition plan (from Step 3)
- [ ] `docs/spec.md`: v1 features, screens, data model, reminder schedule, edge cases (missed days, travel, plan phase changes)
- [ ] Build plan broken into sessions, test-first
- [ ] Seed data: your plan loaded into the app on day one, so it opens already set up

---

## Step 9: Accounts and access (K)

- [ ] Cloudflare: confirm access to `kampduh.com` DNS
- [ ] Hosting: nothing extra if Step 6 lands on Cloudflare. Laravel Cloud account only if it lands on B
- [ ] GitHub: `kameronpduhon/rocky-the-coach` exists and is connected
- [ ] Anthropic API key with a spend limit (only if AI coach is v1)
- [ ] Twilio account (only if text reminders are v1)
- [ ] iPhone on iOS 16.4 or later (for web push)

---

## Ready to build when

- [ ] `docs/plan.md` approved
- [ ] v1 feature list locked
- [ ] Stack, hosting, and address decided
- [ ] Wireframes approved
- [ ] `docs/spec.md` and build plan written
- [ ] Step 9 accounts ready

**Next action:** Step 1. Paste your plan in chat, rough is fine.
