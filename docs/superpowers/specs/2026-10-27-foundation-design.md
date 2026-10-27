# Rocky v2, project 1: Foundation

Status: approved design, 2026-10-27. Next step: implementation plan.

Rocky v2 is a rebuild in five projects, each with its own spec, plan, and build:

| # | Project | Ships |
|---|---|---|
| **1** | **Foundation** (this spec) | Two-person accounts, the local-first data layer, the Corner revised design system, Today, Settings, Login |
| 2 | Workouts | Plan-ahead workout, gym mode (set, rest, done), Library exercises |
| 3 | Nutrition engine | Trend and expenditure, gram rescaling, day completeness, meal screens, Library meals |
| 4 | Check-in, Plan, Progress | The weekly ritual and the two overview screens |
| 5 | Rocky's AI | Rocky's take, Tell Rocky, describe-a-meal, barcode and label, memory, AI switch |

## Source material

| Source | What it holds |
|---|---|
| Research doc, https://claude.ai/artifact/H8VHSWMYpddc5ShcTbSVhD | Research on 30+ apps and the "What we decided" table |
| Mocks, https://claude.ai/artifact/65WeReuGH5ZageJng9K6nq | Approved Corner revised artboards. This spec uses `Corner2`, `Corner2Lunch`, `Settings` |
| `docs/spec.md` | v1 behaviour. Anything this spec does not change keeps working as v1 does |
| `docs/plan.md` | Kameron's plan numbers |

Where this spec and the mocks disagree on looks, the mocks win. Where they disagree on behaviour, this spec wins.

## Decisions this spec rests on

- Users: Kameron and Catherine, one household. Not a product: no signup, billing, or onboarding funnel.
- Platform: stays an installed PWA on Cloudflare (Workers, D1, R2). No native app, no Apple developer account.
- Light mode only. No dark theme in this project.
- Rebuild in place: same repo and Worker. Kameron's existing database becomes his, untouched. Catherine and the shared logins get their own databases. All v1 history is kept. The app works fully after every rollout step.
- Catherine has no plan yet. She gets an account and a "plan on the way" Today; her plan is written later in its own session.
- Sign-in is name plus password, one password each.
- Shared: the meal library, exercises, food data, meal photos. Personal: everything about a person's days.
- A new logo and probably a new name come after the rebuild. The app name and the coach's name each live in one constant (`APP_NAME`, `COACH_NAME`) so a rename is a one-line change.

## 1. Accounts and ownership

Amended 2026-10-27, before planning: each person gets their own D1 database instead of a `user_id` column on every table. Isolation then comes from the setup, not from a filter in every query, and no existing row is rewritten.

### Databases

| Binding | Database | Holds |
|---|---|---|
| `DB` | `rocky-db` (existing) | Kameron's data, unchanged |
| `DB_CATHERINE` | `rocky-db-catherine` (new) | Catherine's data. Same schema and migrations as `rocky-db` |
| `CORE` | `rocky-core` (new) | `households`, `users`, `login_attempts` |

- Person databases share one migrations folder (`drizzle/`) and are migrated one after the other. Core has its own (`drizzle-core/`).
- Core `users`:
    - `id`, `household_id`, `name`, `name_key` (lowercase, unique)
    - `password_hash` (format `pbkdf2$<iterations>$<salt>$<hash>`), `ingest_token` (unique)
    - `db_binding` (`DB` or `DB_CATHERINE`), `plan_key`, `created_at`
- The core migration seeds one household with Kameron (`DB`, plan `kameron`) and Catherine (`DB_CATHERINE`, no plan). Both start with no password.
- Personal settings that sync (voice) live in each person database, not in core.

### Plans

- A plan is repo content, like meals.
- `users.plan_key` names it. `kameron` is today's `content/plan.json`.
- Catherine's `plan_key` is null until her plan is written.
- Any screen or job that needs a plan checks `plan_key` first.
- Making every plan read per person is done when her plan arrives, not in this project.

### Finding the signed-in person's data

- Root middleware resolves the user from the session and runs the request inside an `AsyncLocalStorage` scope.
- `userDb()` returns the Drizzle client for that user's database, and replaces the 23 `getDb(env.DB)` call sites.
- Outside a request scope (cron, the steps ingest), code picks the database from the user row explicitly.
- A user comes only from the session or the ingest token, never from form fields or query strings.
- In tests, a `TEST_USER_DB` variable (empty in production) lets loaders run without the middleware.

### Sign-in

- `POST /login` takes `name` and `password`.
- Passwords are hashed with PBKDF2-SHA256 (100,000 iterations, the Workers maximum) and a 16-byte random salt, using `crypto.subtle`. Comparison is constant-time.
- The session cookie stores `userId` and lasts 400 days, as in v1.
- An existing v1 cookie (`signedIn`) is upgraded to Kameron's `userId` on his next request, so he is not signed out.
- The 5-failures-in-15-minutes lockout stays, now in core.
- `APP_PASSWORD` leaves the code and `wrangler.jsonc`. The secret is deleted after both sign-ins are verified.

### Commands

- `npm run user -- set-password <name> [--remote]` prompts for a password without echoing it and writes the hash.
- `npm run user -- token <name> [--rotate] [--remote]` prints, or replaces, that user's ingest token.
- Kameron runs both against production.

### Steps ingest

- `/api/ingest/steps` resolves the user from the bearer token, looked up in `users.ingest_token`, and writes to that user's database.
- `INGEST_TOKEN` stays valid as an alias for Kameron until his Shortcut is switched over. It is then removed.

### Without a plan

Until Catherine's plan exists:
- Plan, Progress, Workout, Meal, Check-in and Groceries redirect her to Today.
- Today shows "Your plan is on the way" with weigh-in and steps.
- Library and Settings work.
- The reminder cron skips users without a plan.

## 2. Local-first data layer

### Goal

- No tap on a rebuilt screen waits on the network. A tap's result paints in the same frame.
- Writes made offline are kept and sent later.

### Shared mutators

- Every write a rebuilt screen makes is a named mutator in `app/sync/mutators.ts`. A mutator is a pure function `(tx, args, ctx) => void` over a small `Tx` interface: `get`, `put`, `delete`, and `scan` by table and key.
- The same function runs on the phone (optimistic) and on the server (authoritative).
- Each mutator validates its args with Zod. On the server, invalid args throw `MutationRejected`.

Foundation mutators:

| Mutator | Notes |
|---|---|
| `logWeighIn`, `editWeighIn`, `deleteWeighIn` | |
| `logMeal`, `unlogMeal` | "Ate it" and undoing it |
| `logOffPlan`, `deleteOffPlan` | |
| `setReminder` | On/off and time |
| `setVoice` | |

Writes from v1 screens (workout, meal, check-in, plan, progress, library) keep using their existing server actions in this project.

### Server `Tx`

- D1 has no interactive transactions. The server `Tx` reads from D1, overlaying its own pending writes, and buffers the writes.
- It commits a mutator's writes and the client's new `last_mutation_id` in one `db.batch()`, which is atomic.
- With two users, read-then-write races are not a practical risk. The design does not add locking.

### Changes log

- New table `changes` in each person database: `version INTEGER PRIMARY KEY AUTOINCREMENT`, `table_name`, `row_key`, `op` (`put` | `del`).
- SQLite triggers write it. There is one `AFTER INSERT`, `AFTER UPDATE`, and `AFTER DELETE` trigger per synced table.
- Because triggers write the log, writes from v1 server actions, cron jobs, and the steps ingest are logged without code changes.

### Client bookkeeping

- New table `sync_clients` in each person database: `client_id` (primary key, one per installed app), `last_mutation_id`.

### Protocol

`POST /api/push` takes `{ clientId, mutations: [{ id, name, args }] }`.

- `id` increases per client.
- The server skips any `id` at or below `last_mutation_id`. It applies the rest in order.
- A rejected mutation still advances `last_mutation_id` and is reported back in `{ rejected: [{ id, message }] }`.

`GET /api/pull?since=<version>&clientId=` returns `{ version, lastMutationId, puts: { table: rows[] }, dels: { table: keys[] } }`.

- `since=0` returns a full snapshot of the user's rows.
- Otherwise the server returns the current row for each distinct `(table, key)` in `changes` after `since`, from the signed-in user's database.
- The server prunes `changes` older than 30 days. A client whose `since` is older than the oldest kept version gets a full snapshot.

### Client store

- The client store lives in `app/sync/store.ts`: one in-memory map per table, behind a small subscribe API read through `useSyncExternalStore` hooks.
- It is persisted to IndexedDB, one database per user id.
- After install, the app calls `navigator.storage.persist()`.

Client loop:

1. **Write.** Apply the mutator to the store, append it to the pending queue (persisted), and push.
2. **On push success.** Pull.
3. **On pull.**
    1. Replace base rows with the server rows.
    2. Drop pending mutations at or below `lastMutationId`.
    3. Re-apply the rest on top.
    4. Surface any rejected mutation as a one-line notice naming what did not save. Its optimistic effect disappears with the rebase.
4. **Also pull** on app open, on coming back to the foreground, and every 60 s while visible.
5. **Push retries** with backoff (1, 2, 4 ... 60 s) while offline.
6. **Waiting changes.** The existing `PendingSync` component shows "N changes waiting" while the queue is not empty.

The existing localStorage `offline-queue.ts` is retired once rebuilt screens use the store. v1 screens keep it until their projects replace them.

### Rendering

- `ssr: true` stays for this project, because v1 routes still use server loaders.
- Rebuilt routes (Today, Settings) read from the store through `clientLoader` with `hydrate = true` and a `HydrateFallback`. Their server loaders return nothing personal.
- The switch to SPA mode happens in project 4, when no server loaders remain.

### Service worker

- The service worker precaches the built assets and the self-hosted fonts at install, versioned by build.
- Navigation stays network-first with the cached HTML as fallback, so the app opens offline.

### Measuring

- The `web-vitals` attribution build reports INP from real sessions (Safari 26.2+) to `POST /api/vitals`.
- That endpoint stores `route`, `inp_ms`, `target`, `at` in a `vitals` table.
- Budget: INP p75 under 100 ms on Today.

## 3. Design system and shell

Values are measured from the approved mocks. `docs/design/system.md` is written from the mocks, not from this table.

### Colour tokens

Tailwind 4 `@theme` CSS variables.

| Token | Value | Only for |
|---|---|---|
| `--paper` / `--raised` | `#F3EEE4` / `#FBF8F2` | Backgrounds; the highlighted "next" row |
| `--ink`, `--ink-2`, `--ink-3`, `--muted` | `#1A1714`, `#3A332A`, `#4A443C`, `#6B6358` | Text, heavy rules, the dark Rocky card |
| `--rule` / `--border` | `#DED5C5` / `#8F8677` | Dividers / control outlines |
| `--red` | `#BF3326` | The primary action and live state: rest timer, today, active tab, focus ring |
| `--brass-tag` / `--brass-border` / `--brass-fill` | `#7E6020` / `#9C7A2E` / `#F8F1E1` | Progression only |
| `--coral` | `#F08A7E` | The label on the dark Rocky card |

`theme-color` and the manifest `background_color` are `#F3EEE4`.

### Type

- Faces:
    - Anton for posters and section heads.
    - Barlow 400 to 700 for body text.
    - Barlow Semi Condensed 600 and 700 with `font-variant-numeric: tabular-nums` for every number.
- Self-hosted woff2 from the `@fontsource` packages, precached.
- Sizes:
    - Poster 64 to 68 px, line-height 0.92.
    - Section head 28 px.
    - Body 16 to 17 px.
    - Small text never under 13 px.

### Components

Shared components live in `app/ui/`:

- `Poster`: headline plus one line.
- `Button`: primary red, outline ink, text link.
- `Stepper`, `Segmented`, `Switch`, `Row` (minimum 44 px).
- `ProgressionCallout`: brass.
- `RockyCard`: dark.
- `Sheet`, `TabBar`.
- `WeekStrip`, `ProteinBar`.
- `GymFrame`: full screen, no tab bar, docked bottom action. Built here, used from project 2.

### Rules built in

- No label above a heading.
- Red only for action and live state. Brass only for progression. Never red for food over target.
- Tap targets of at least 44 px.
- `:active` press feedback within 100 ms.
- A red focus-visible ring.
- `::selection` themed from the palette.
- Motion off under `prefers-reduced-motion`.

### Motion

- One moment: a check landing (spring via CSS `linear()`) and the protein bar filling.
- Nothing else animates on load.

### Tab bar

Fixed bottom, with safe-area padding. Four tabs: Today, Plan, Progress, Library.

### v1 screens until their projects

- v1 colour variables are remapped to the new tokens.
- Glass classes (`glass`, `glass-on-image`, `--glass-selected`) render as solid paper with an ink border.
- New fonts and the new tab bar apply.
- Layouts are unchanged.
- Contrast is checked on every v1 screen after the remap.

## 4. Screens

### Today (mocks `Corner2`, `Corner2Lunch`)

**What's next.** A pure function `nextUp(day, now)` in `app/domain/next-up.ts` picks the poster.

1. Sunday from 17:00 until the check-in is finished or closes at Monday 12:00: the check-in. Button "Start check-in".
2. Otherwise, the first unfinished item in time order among today's meals and today's workout:
    - Meals end their window when the next slot begins, which is v1's `nextSlot` rule.
    - The workout stays current until it is finished. If it was never started, it ends at the close of its plan window (14:00).
    - Workout: headline is the split (for example "LEGS. SHOULDERS. 7 LIFTS."), meta line, any go-up callout, button "Start: <first lift>" or "Resume: <current lift>", plus an outline "Short, 25 min, home" (Plan B).
    - Meal: headline is the meal name plus protein, meta line, the scale grams list, button "Ate it", outline "Swap".
3. After the last meal, if steps are short: "<N> steps. Two short walks."
4. Otherwise: a done state ("Done. Kitchen's closed.") from the existing message set.
5. No plan (Catherine): "Your plan is on the way." with the weigh-in row and steps.

**Weigh-in.** If no weigh-in today, a slim weigh-in row sits above the poster.

**Below the poster, in order:**

1. **Rocky card.** v1's rule-picked rotating message. The label reads "Rocky, in your corner" in Corner voice and "Rocky" in Plain.
2. **Fuel:**
    - The protein bar filling meal by meal, with the user's protein target marked.
    - One quiet line for calories and steps.
    - The meal list:
        - The next meal has an "Ate it" button.
        - Eaten meals collapse to one line with "Eaten".
        - Other meals have a 44 px check.
    - An off-plan dessert row: "1 of 2 left this week".
    - "+ Ate something else", which opens the v1 off-plan sheet, restyled.
3. **This week:** the week strip, plus the trend line and the "today counted" line.

**Change today's workout.** The link "Change today's workout" opens v1's move sheet and custom-workout options until project 2.

### Habit rules (`app/domain/habits.ts`)

- **Counted day.** A day counts if any one of these happened that day:
    - a weigh-in
    - a meal logged (on or off plan)
    - a set logged or an exercise checked
    - steps of 3,000 or more

  Days marked relaxed in the plan always count.
- **Streak.** Consecutive days walking back from today, where a single uncounted day is skipped over, not broken. Two uncounted days in a row end it. Today, until it ends, never breaks the streak. The header shows "<N>-DAY STREAK".
- **Dessert allowance.**
    - 2 off-plan desserts per Monday-to-Sunday week.
    - The row shows "<n> of 2 left this week".
    - Over the allowance it shows "<n> this week" in the same ink. There is no warning colour.
- **Full day.** The full-day metric (for check-in counts) becomes: protein target met, step goal met, and no off-plan dessert beyond the allowance. It replaces `isOnPlan`'s dessert clause.
- **Minimum viable day.** The card is removed.

### Settings (mock `Settings`, minus the AI parts)

Settings contains:

- **Signed in as <name>.** Catherine's line names Kameron, and Kameron's names Catherine.
- **How Rocky talks:** Corner or Plain, through `setVoice`.
- **Reminders:** v1's reminder settings restyled, with on/off and time per reminder, through `setReminder`. The skip-if-done behaviour stays as v1.
- **Steps from your iPhone:** the ingest URL and the user's own token, masked with Copy, plus "Last received <time>".
- **Sign out.**

"What Rocky knows" and the AI switch are project 5.

### Login

- A Corner-style screen: "ROCKY." poster, name field, password field, a red "Sign in" button.
- Errors are inline: "That name and password don't match." Lockout reads: "Too many tries. Wait 15 minutes."

## 5. Rollout

Each step is deployed on its own, and the app works fully after each one.

1. **Accounts and ownership.**
    - New `rocky-core` and `rocky-db-catherine` databases, core migration with the seeded users.
    - Name-plus-password login, `userDb()`, per-user ingest tokens, the no-plan redirects, per-person cron.
    - Kameron creates both databases, runs their remote migrations and both `set-password` commands. His own database is not migrated in this step.
2. **Data layer.**
    - `changes` and triggers, `sync_clients`, `/api/push`, `/api/pull`.
    - The client store, persistence, and the pull loop.
    - `/api/vitals`.
    - Nothing visible changes.
3. **Look.** Tokens, self-hosted fonts, the tab bar, the v1 palette remap.
4. **New screens.** Today, Settings, and Login on the store, plus the habit rules.

## Error handling

| Situation | Behaviour |
|---|---|
| Offline, or push fails | The queue persists and retries with backoff. "N changes waiting" shows. |
| Server rejects a mutation | That mutation is dropped on rebase. A one-line notice names what did not save. Later mutations continue. |
| IndexedDB cleared or unavailable | Full snapshot on the next pull. In private mode the store runs in memory for the session. |
| `since` older than the kept log | Full snapshot. |
| Session expired (401 on push or pull) | Redirect to Login. The pending queue is kept and sent after sign-in, only if the same user signs in. A different user's sign-in clears the queue. |
| Catherine opens a plan-dependent v1 screen | That screen shows "Your plan is on the way" instead of erroring. |

## Testing

**Unit (Vitest `unit` project):**

- Every Foundation mutator against an in-memory `Tx`.
- Habit rules:
    - counted day
    - streak, including a single gap, a double gap, a relaxed day, and today in progress
    - dessert allowance
- `nextUp` at fixed times on a lift day, a rest day, a Sunday evening, and with no plan.

**Workers (`@cloudflare/vitest-plugin`, real D1):**

- Push:
    - Applies mutations in order.
    - Skips replayed ids.
    - Reports rejections and still advances `last_mutation_id`.
- Pull:
    - Returns a full snapshot at 0.
    - Returns deltas after that.
    - Returns deletes.
    - Falls back to a snapshot past pruning.
- Triggers log writes made by v1 server actions.
- Isolation:
    - Catherine's pull never contains Kameron's rows, and the reverse.
    - A push cannot write the other user's rows.
    - The ingest token maps to the right user.
- Kameron's request scope reads only `DB`, Catherine's only `DB_CATHERINE`. The legacy v1 cookie resolves to Kameron.
- Login: the right password, a wrong password, lockout.

**Process.** One full-suite run before the PR.

**On the wire (Kameron's iPhone, installed PWA):**

- In airplane mode, log a weigh-in, two meals, and an off-plan item. Reconnect and confirm all reach D1.
- Sign in as each user on separate phones and confirm neither sees the other's data.
- Steps from each Shortcut land on the right user.
- Read INP p75 from `vitals` after a day of use.

## Out of scope for this project

- Plan-ahead workout and gym mode.
- The nutrition engine, gram rescaling, and meal screens.
- The new check-in, Plan, Progress, and Library.
- Everything AI.
- Catherine's plan content and a combined grocery list.
- The logo and name, dark mode, and SPA mode.
