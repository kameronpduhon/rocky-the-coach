# Rocky v2, project 2: Workouts

Status: approved design, 2026-10-27. Next step: the W1 implementation plan.

This is project 2 of the five-project rebuild. Foundation (project 1: accounts, the phone's copy, the Corner look, Today, Settings, Login) is live.

| # | Project | Ships |
|---|---|---|
| 1 | Foundation | Done |
| **2** | **Workouts** (this spec) | Plan-ahead workout, gym mode (set, rest, done), the "how did it feel" tap, the locked-phone rest ping |
| 3 | Nutrition engine | Trend and expenditure, gram rescaling, meal screens, Library meals |
| 4 | Check-in, Plan, Progress, Library | The weekly ritual, the overview screens, and the Library tab (exercises moved here from project 2) |
| 5 | Rocky's AI | Rocky's take, Tell Rocky, describe-a-meal, memory, AI switch |

## Source material

| Source | What it holds |
|---|---|
| Mocks, https://claude.ai/artifact/65WeReuGH5ZageJng9K6nq | Artboards `WorkoutPlan`, `WorkoutSet`, `WorkoutRest`, `WorkoutDone` |
| `docs/design/system.md` | The Corner design system. Where it and a mock disagree on looks, the mock wins, except the colour rules |
| `docs/superpowers/specs/2026-10-27-foundation-design.md` | The sync layer, named changes, and conventions this project builds on |
| `app/routes/workout.tsx`, `app/server/workouts.server.ts` | v1 behaviour. Anything this spec does not change keeps working as v1 does |

## Decisions this spec rests on

- **Plan ahead.** Today's workout can be planned or changed in the morning without starting it. The workout clock and rest timers start only at Start.
- **Switching today's workout changes today only.** The workout it replaces is skipped this week, unless "Move to another day" is used, which trades two days.
- **The "How did it feel?" tap is optional and covers the whole workout:**
    - Hard holds next time's weight, even when every set hit the top of the range.
    - Easy jumps two steps when every set hit the top (for example +20 lb instead of +10). Below the top, Easy changes nothing.
    - It never blocks logging.
- **The rest ping works with the phone locked.** A server-side timer, a Cloudflare Durable Object, sends it.
- **Workouts move onto the phone's copy.** Every write is a named change, so logging works with no signal at the gym.
- **The existing tables are extended, not replaced.** v1 screens that read workouts (Plan, Progress, check-in, reminders) keep working unchanged.
- **Out of scope:**
    - The Library tab (project 4).
    - The stuck-lift card (project 4, check-in).
    - Anything AI.
    - Catherine's plan.

## 1. Data

### Workouts

`workout_sessions` keeps its role ("a workout on a day") and changes like this:

| Column | Change |
|---|---|
| `client_id` | New, text, unique. A UUID made on the phone, so a workout can be created offline. v1 rows keep it null and stay keyed `id:<id>`. |
| `started_at` | Now nullable. A planned workout has no start. |
| `planned_at` | New, nullable. Set when the workout is first planned. |
| `lifts` | New, nullable JSON. That day's own lift list (below). Null means "the template, with its always-swaps". |
| `feel` | New, nullable: `easy`, `right` or `hard`. |
| `exercises` | Kept for history. The migration copies custom workouts' lists into `lifts`, and nothing new writes it. |

Making `started_at` nullable needs a table rebuild in SQLite. The migration recreates the sync triggers for every table it rebuilds.

**Lift list.** `lifts` is an array of entries:

```
{ position: number, exercise: string, repMin: number, repMax: number, from: "plan" | "swap" | "added", replaces?: string }
```

- **Plan lifts** keep their template position: 0, 1, 2 and so on.
- **Added lifts** take positions from 100 upward, in the order they were added.
- **Skipping a lift** removes its entry, and nothing is renumbered. A set's `position` therefore always points at the same lift, whatever is added or skipped later.
- **A swap for today** sets `from: "swap"`, `exercise` to the new lift and `replaces` to the old one, which is what Undo restores.
- **Custom workouts** ("Your own") are lists made entirely of added lifts. Migrated custom workouts keep their v1 positions.

**One open workout per day.** A day has at most one workout that is planned or started and not finished. The plan screen edits that one, and creates it on the first change. An optional extra on a rest day, or a second workout after finishing, is a new row.

**A workout started and never finished** counts as finished from the next day, as of its last set's time. Nothing is written to make this happen; readers apply the rule.

### Sets and checks

- **`set_logs` gains `session_key`,** text, not null. It holds the workout's sync key: its `client_id`, or `id:<id>` for v1 rows. The migration backfills it, and new writes always set it. `session_id` stays, filled when known, so v1 readers keep working.
- **`exercise_checks` gains `session_key` too.** Its sync key becomes `session_key|exercise_id`.

### Exercise notes

A new synced table, `exercise_notes`:
- `exercise_id` is the primary key.
- `note` is text, up to 200 characters.
- `updated_at` is set on every save.

Notes belong to the exercise, not to a workout, so they carry from week to week.

### Sync registry

In `app/sync/tables.ts`:
- `workout_sessions` is keyed by client ID (`COALESCE(client_id, 'id:' || id)`).
- `exercise_checks` is keyed by `session_key|exercise_id`.
- `exercise_notes` is new, keyed by `exercise_id`.

The trigger migration is regenerated from the registry.

### Named changes

These are new mutators in `app/sync/mutators.ts`, run on the phone and the server alike:

| Mutator | What it does |
|---|---|
| `planWorkout { clientId, date, templateId }` | Creates or retargets the day's open workout before it starts. Picking another template resets `lifts` to null |
| `setLifts { workout, lifts }` | Replaces the day's lift list. Refused once a set exists at a position the new list drops |
| `startWorkout { workout, at }` | Sets `started_at` |
| `logSet { clientId, workout, position, exercise, setNumber, weightLb, reps, at }` | Adds a set |
| `editSet { key, weightLb, reps }`, `deleteSet { key }` | Fixes or removes a set |
| `checkLift { workout, exercise, done }` | "Done, no numbers", or undoing it |
| `finishWorkout { workout, at }` | Sets `ended_at` |
| `rateWorkout { workout, feel }` | Sets or clears `feel`. Allowed any time after the finish |
| `setNote { exercise, note }` | Saves or clears a note |
| `moveWorkout { a, b }` | The v1 trade of two days' workouts, written to `schedule_moves` |
| `swapAlways { templateId, position, exercise }` | The v1 "swap always" override |

**Times come from the phone.** `at` is the phone's clock, because the server's clock would date an offline workout by when it synced. The server refuses an `at` more than 5 minutes ahead of its own clock, or more than 2 days behind it. `logged_at` and `planned_at` follow the same rule.

### Weights with the feel tap

`nextSuggestion(lastSession, rule, feel)` in `app/domain/progression.ts`:

| Last time | `feel` | Next weight |
|---|---|---|
| Every set at the top of the range | none or `right` | Up one step (the exercise's increment) |
| Every set at the top of the range | `easy` | Up two steps |
| Every set at the top of the range | `hard` | Holds |
| Not every set at the top | any | Holds |
| Deload week | any | Holds |

Today's "go up" note and the gym screens both use it, with the `feel` of the workout that last logged that exercise.

## 2. Screens

All four live at `/workout` for today. The workout's state picks the screen: planned or not yet made shows Plan, started shows Set or Rest, finished shows Done. `/workout?date=<past day>` opens that day on Done. The tab bar is hidden on all of them.

### From Today

- **"Change today's workout"** opens Plan.
- **"Start: <lift>"** runs `planWorkout` if needed, then `startWorkout`, then opens Set.
- **"Short, 25 min, home"** plans the home workout and starts it.
- **On a rest day,** the optional-workout link and "Log a different workout" open Plan with that workout, or "Your own", already picked.

### Plan (mock `WorkoutPlan`)

- **Header:** back to Today, and "Saved · not started".
- **Headline:** the workout split, as on Today (48 px here), then "Noon · <n> lifts · <n> sets · about <n> min".
- **Workout picker:** today's scheduled workout first, then the other gym workouts, then "Short, home", then "Your own". The picker is hidden once the workout has started.
- **Lift rows** show sets and reps, plus the brass "<weight> lb, up <n>" when the lift goes up.
    - The swap icon opens a sheet with three choices: swap for today, swap always, or skip today.
    - Rows swapped or added today sit on `raised`, with Undo or Remove.
- **"+ Add a lift"** opens the exercise picker, restyled.
- **"Move to another day"** opens the move sheet.
- **Docked bar:**
    - "Changes save as you go. The clock starts when you tap Start at the gym."
    - Red "Done, see you at noon", which goes back to Today.
    - Outline "Start now".

### Set (mock `WorkoutSet`)

- **Header:**
    - An X back to Today. The workout keeps running.
    - "LIFT <n> OF <n> · <clock>", where the clock is time since `started_at`. Tapping it opens the lift list, which jumps to any lift or finishes the workout.
    - A Swap button.
- **Segment row:** one segment per lift. Red is the current lift, ink is done, and an outline is still to do.
- **The lift:**
    - Its name as the poster (64 px), then "Set <n> of <n> · <range> reps · to failure".
    - The brass callout with last time's sets and the reason, for example "Last Wednesday: 270 × 12, 12. Both sets hit the top, so 280 today."
    - The note line. Tap it to edit; "Add a note" shows when there is none.
- **Weight and reps cards:**
    - Weight starts at the suggestion, or empty if the lift has no history. Its stepper moves by the exercise's increment.
    - Reps start at that set's reps last time, or the bottom of the range. Its stepper moves by 1.
- **"Done, no numbers"** is a quiet link under the cards.
- **Docked bar:** "Then set <n> at <weight> · Next lift: <name>", and the 64 px red "LOG SET <n>: <weight> × <reps>".

### Rest (mock `WorkoutRest`)

Shown after each logged set, over Set's layout.

- **Above the panel:**
    - The lift's set rows. Logged sets carry a check and "Logged"; tap one to edit or delete it.
    - The next set's target, muted.
    - One plain line on where the lift stands, for example "11 on set 1, so 280 holds next week. Match or beat it here."
- **The dark panel:**
    - "REST" in coral, with "Lock your phone. Rocky pings you at 0:00."
    - The Anton countdown and a red progress bar.
    - −15 s, +15 s and Skip.
- **Rest length:** 150 s for compound lifts, 90 s for the rest.
- **At 0:00** the panel closes and the next set comes up. After a lift's last set, the next unfinished lift in list order comes up.

### Done (mock `WorkoutDone`)

- **Headline:** the workout split plus "Done.", for example "LEGS. SHOULDERS. DONE.". Then "<n> lifts · <n> sets · <n> min".
- **One Rocky line.** The label "Rocky:" is bold ink, not the mock's red, because red is only for actions and live state. The line is rule-written, for example "Two lifts moved up. Chicken and rice within the hour."
- **The brass "MOVED UP" card** lists each lift whose next weight rises, as "<lift> <old> → <new> lb". It is hidden when nothing moved up.
- **Every lift's sets,** for example "280 × 11, 12 · holds".
- **"How did it feel?"** offers Easy, About right and Hard. It is optional, saves on tap, and tapping the chosen one clears it.
- **Docked bar:** red "Back to Today".

### Shared kit

New pieces in `app/ui/`, each with one job:

| Piece | Job |
|---|---|
| `GymFrame` | Full screen with no tab bar and a docked bottom action. Promised by the Foundation spec |
| `Stepper` | A big number between two 48 px outline buttons |
| `SegmentRow` | The row of lift segments |
| `RestPanel` | The dark rest panel |
| `ChoiceRow` | The workout picker and the feel buttons |

## 3. The rest ping

**A Durable Object holds the timer.** `RestTimer` is a SQLite-backed Durable Object, one per person (`idFromName(dbBinding)`). It holds at most one alarm.

- **`POST /api/rest`, body `{ seconds, title, body }`.** It stores the message and the person's binding, and sets the alarm to its own clock plus `seconds`. This replaces any earlier alarm.
- **`DELETE /api/rest`** clears the alarm.
- **The alarm** sends one notification with tag `rest` through the existing push code, to that person's push subscriptions. The tag means a new ping replaces an old one on the phone.

**Who calls it:**
- Logging a set schedules the ping, with the rest length and "Rest's up. Set <n> of <lift>."
- Skip, ±15 s and logging the next set reschedule or cancel it.
- Finish cancels it.

Calls are fire-and-forget, so the screen never waits on them.

**Without notifications or signal:**
- If notifications are off on this phone, the panel's line reads "Turn on notifications in Settings to get a ping."
- If the schedule call fails, the line reads "No signal, so no ping. Keep an eye on the clock." The on-screen countdown always runs.

**After a reopen.** If the app is reopened during a rest, the time left comes from the last set's `logged_at` plus the rest length, as v1 does.

## 4. Errors and edge cases

| Situation | Behaviour |
|---|---|
| Offline at the gym | Every change saves on the phone and is sent later, as Foundation does |
| The server refuses a change | The Foundation notice, naming it, for example "Set didn't save. That time is in the future." |
| A swapped or added lift has no history | No suggested weight; the weight box starts empty |
| A lift is skipped or added after sets are logged | Positions never shift, so logged sets stay with their exercise. `setLifts` refuses a list that drops a position with sets |
| The workout picker after Start | Hidden. Swap, add and skip still work |
| A workout is never finished | It reads as finished from the next day |
| Two devices | Rows carry phone-made IDs, so two phones never clash. One tab syncs at a time, as Foundation does |

## 5. Rollout

Each step deploys on its own, and the app works fully after each.

1. **W1: data, named changes, the rest timer.** Nothing on screen changes.
    - The migration covers `workout_sessions` (rebuilt), `set_logs` and `exercise_checks` (`session_key`), and the new `exercise_notes`. It backfills keys and lists, and regenerates the sync triggers.
    - The v1 workout screen's server actions also write `session_key` and the other new fields, so it keeps working.
    - The new mutators, the feel rule in `nextSuggestion`, and the `RestTimer` Durable Object with `/api/rest` all land here. Nothing calls `/api/rest` yet.
    - Kameron runs both remote migrations.
2. **W2: the four screens.**
    - Plan, Set, Rest and Done replace the v1 workout screen.
    - Today's links move to them.
    - Logging a set schedules the ping.
    - The feel tap starts shaping weights on Today and in the gym.
    - The v1 workout route's actions and its offline queue use are removed.

## Testing

**Unit:**
- **Every new mutator**, against the in-memory store, including the time bounds and `setLifts` refusing to drop a position with sets.
- **`nextSuggestion`**, one test per row of the feel table.
- **The workout view model:**
    - The lift list after swaps, adds and skips.
    - The current lift and the next set's target.
    - The rest time left after a reopen.
    - The "moved up" list.
    - A workout from yesterday reading as finished.

**Workers (real D1):**
- **The migration** keeps every workout and set. It links each set to the right workout through `session_key`, and copies custom lists into `lifts`.
- **The triggers** log writes to the rebuilt and new tables.
- **Each workout mutator** applies cleanly through push.
- **`RestTimer`:**
    - Schedule sets an alarm, and a second schedule replaces it.
    - Delete clears it.
    - The alarm calls the push sender once with tag `rest`.

**Process.** One full-suite run before each PR.

**On the wire (Kameron's iPhone, at the gym):**
- Plan the workout in the morning. At noon, turn on airplane mode, start, and log every set. Turn airplane mode off and confirm everything reaches D1, with the phone's times.
- With signal, lock the phone during a rest. The ping arrives at 0:00.
- Tap "Hard" on Done. The next session of those lifts suggests the same weight.
