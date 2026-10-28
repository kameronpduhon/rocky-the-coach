import { z } from "zod";
import { exercises, meals, plan } from "~/content";
import { factorFor, scaledMeal } from "~/content/scaled";
import { burnEntries, resolveTargets } from "~/content/targets";
import { swapWorkouts, templateFor } from "~/domain/calendar";
import { addDays, daysBetween, weekStart } from "~/domain/dates";
import { batchPortion } from "~/domain/macros";
import { swapFits } from "~/domain/next-week";
import { DEFAULT_REMINDERS } from "~/domain/reminders";
import type { RotationMeal } from "~/domain/rotation";
import { CUSTOM_WORKOUT, SLOTS, type Slot } from "~/domain/types";
import { keyOf, type Row } from "./tables";
import type { Tx } from "./tx";

export class MutationRejected extends Error {}

export interface MutationContext {
  /** ISO time the change was made. The server uses its own clock. */
  now: string;
  /** Today in Chicago. */
  today: string;
}

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const clientId = z.string().min(1).max(64);
const key = z.string().min(1).max(64);
const round1 = (n: number) => Math.round(n * 10) / 10;

function notFuture(d: string, ctx: MutationContext) {
  if (daysBetween(ctx.today, d) > 1) throw new MutationRejected("That date is in the future.");
}

const at = z.iso.datetime();
const workout = z.string().min(1).max(64);
const exerciseId = z.string().refine((id) => exercises.has(id), "That exercise isn't in the library.");
const templateId = z.string().refine((id) => id === CUSTOM_WORKOUT || id in plan.templates, "That workout isn't in the plan.");
const lift = z.object({
  position: z.number().int().min(0).max(199),
  exercise: exerciseId,
  repMin: z.number().int().min(1).max(50),
  repMax: z.number().int().min(1).max(50),
  from: z.enum(["plan", "swap", "added"]),
  replaces: z.string().optional(),
});

const MAX_AHEAD_MS = 5 * 60_000;
const MAX_BEHIND_MS = 2 * 86_400_000;

/** Workout times come from the phone, so an offline workout is dated when it happened. Bounded against our clock. */
function checkTime(time: string, ctx: MutationContext) {
  const diff = Date.parse(time) - Date.parse(ctx.now);
  if (diff > MAX_AHEAD_MS) throw new MutationRejected("That time is in the future.");
  if (diff < -MAX_BEHIND_MS) throw new MutationRejected("That time is too long ago.");
}

async function workoutRow(tx: Tx, key: string) {
  const row = await tx.get("workout_sessions", key);
  if (!row) throw new MutationRejected("That workout isn't saved.");
  return row;
}

/** Days with a workout done: finished, or with a set or a check. */
async function workoutDates(tx: Tx): Promise<Set<string>> {
  const sessions = await tx.scan("workout_sessions");
  const dateOf = new Map(sessions.map((r) => [keyOf("workout_sessions", r), r.date as string]));
  const out = new Set(sessions.filter((r) => r.ended_at).map((r) => r.date as string));
  for (const r of [...(await tx.scan("set_logs")), ...(await tx.scan("exercise_checks"))]) {
    const d = dateOf.get(r.session_key as string);
    if (d) out.add(d);
  }
  return out;
}

const slot = z.enum(SLOTS as [string, ...string[]]);
const mealSlug = z.string().min(1);

const rotationMeals = (): RotationMeal[] => [...meals.values()].map((m) => ({ slug: m.slug, pool: m.pool, mode: m.mode, tags: m.tags }));

/** The gram factor for a date's calorie target, from the targets this copy holds. */
async function dayFactor(tx: Tx, date: string): Promise<number> {
  const rows = (await tx.scan("targets"))
    .map((r) => ({ effectiveFrom: r.effective_from as string, kcal: r.kcal as number, proteinG: r.protein_g as number, stepGoal: r.step_goal as number }))
    .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  // A maintenance week eats the latest check-in's burn.
  return factorFor(resolveTargets(rows, date, burnEntries(await tx.scan("check_ins"))).kcal);
}

/** Same rule as openBatch in meals.server.ts: the newest batch of this meal with portions left, cooked up to 3 days ago. */
async function openBatchRow(tx: Tx, slug: string, date: string): Promise<Row | undefined> {
  // A batch started on this phone has no id until the server numbers it, so it sorts as the newest.
  const order = (b: Row) => (b.id as number | undefined) ?? Number.MAX_SAFE_INTEGER;
  return (await tx.scan("batches"))
    .filter((b) => b.meal_slug === slug && (b.portions_left as number) > 0 && (b.created_on as string) >= addDays(date, -3) && (b.created_on as string) <= date)
    .sort((x, y) => (y.created_on as string).localeCompare(x.created_on as string) || order(y) - order(x))[0];
}

/** A slot is resolved once it is eaten or skipped. */
async function slotResolved(tx: Tx, date: string, s: string): Promise<boolean> {
  return (await tx.scan("meal_logs")).some((l) => l.date === date && l.slot === s && (l.category === "planned" || l.category === "skipped"));
}

async function restedOn(tx: Tx, date: string): Promise<string[]> {
  return (await tx.scan("meal_state")).filter((r) => typeof r.rested_until === "string" && (r.rested_until as string) >= date).map((r) => r.slug as string);
}

/** "Ate it": logs the planned meal at the day's grams, or at its batch's, and uses up a batch portion. */
async function eatPlanned(tx: Tx, a: { clientId: string; date: string; slot: string; mealSlug: string }, ctx: MutationContext): Promise<void> {
  const raw = meals.get(a.mealSlug);
  if (!raw) throw new MutationRejected("That meal isn't in the library.");
  if (await slotResolved(tx, a.date, a.slot)) return;
  const batch = await openBatchRow(tx, raw.slug, a.date);
  const meal = scaledMeal(raw, batch ? ((batch.factor as number | undefined) ?? 1) : await dayFactor(tx, a.date));
  tx.put("meal_logs", {
    client_id: a.clientId,
    date: a.date,
    slot: a.slot,
    meal_slug: meal.slug,
    name: meal.name,
    category: "planned",
    kcal: meal.kcal,
    protein_g: meal.protein,
    relaxed: 0,
    portions: 1,
    logged_at: ctx.now,
  });
  if (batch) tx.put("batches", { ...batch, portions_left: (batch.portions_left as number) - 1 });
}

/** A skipped meal: nothing eaten, but the slot is answered, so the day can count as tracked. */
function putSkipped(tx: Tx, a: { clientId: string; date: string; slot: string; mealSlug: string }, ctx: MutationContext): void {
  tx.put("meal_logs", {
    client_id: a.clientId,
    date: a.date,
    slot: a.slot,
    // No slug, so the rotation and the check-in's repeat counts never take a skip for a meal eaten.
    meal_slug: null,
    name: meals.get(a.mealSlug)?.name ?? a.slot,
    category: "skipped",
    kcal: 0,
    protein_g: 0,
    relaxed: 0,
    portions: 1,
    logged_at: ctx.now,
  });
}

function putOffPlan(
  tx: Tx,
  e: { clientId: string; date: string; name: string; category: string; kcal: number; protein_g: number; relaxed: number },
  ctx: MutationContext,
): void {
  tx.put("meal_logs", {
    client_id: e.clientId,
    date: e.date,
    slot: null,
    meal_slug: null,
    name: e.name,
    category: e.category,
    kcal: e.kcal,
    protein_g: e.protein_g,
    relaxed: e.relaxed,
    portions: 1,
    logged_at: ctx.now,
  });
}

const closeOutEntry = z.object({ clientId, slot, mealSlug });

const defs = {
  logWeighIn: {
    args: z.object({ date, weightLb: z.number().min(80).max(500) }),
    async run(tx: Tx, a: { date: string; weightLb: number }, ctx: MutationContext) {
      notFuture(a.date, ctx);
      tx.put("weigh_ins", { date: a.date, weight_lb: round1(a.weightLb), logged_at: ctx.now });
    },
  },
  editWeighIn: {
    args: z.object({ date, weightLb: z.number().min(80).max(500) }),
    async run(tx: Tx, a: { date: string; weightLb: number }, ctx: MutationContext) {
      notFuture(a.date, ctx);
      const prev = await tx.get("weigh_ins", a.date);
      tx.put("weigh_ins", { date: a.date, weight_lb: round1(a.weightLb), logged_at: (prev?.logged_at as string | undefined) ?? ctx.now });
    },
  },
  deleteWeighIn: {
    args: z.object({ date }),
    async run(tx: Tx, a: { date: string }) {
      tx.delete("weigh_ins", a.date);
    },
  },
  logMeal: {
    args: z.object({ clientId, date, slot, mealSlug }),
    async run(tx: Tx, a: { clientId: string; date: string; slot: string; mealSlug: string }, ctx: MutationContext) {
      notFuture(a.date, ctx);
      await eatPlanned(tx, a, ctx);
    },
  },
  skipMeal: {
    args: z.object({ clientId, date, slot, mealSlug }),
    async run(tx: Tx, a: { clientId: string; date: string; slot: string; mealSlug: string }, ctx: MutationContext) {
      notFuture(a.date, ctx);
      if (await slotResolved(tx, a.date, a.slot)) throw new MutationRejected("That meal is already marked.");
      putSkipped(tx, a, ctx);
    },
  },
  closeOutDay: {
    args: z.object({ date, eaten: z.array(closeOutEntry).max(5), skipped: z.array(closeOutEntry).max(5) }),
    async run(tx: Tx, a: { date: string; eaten: z.infer<typeof closeOutEntry>[]; skipped: z.infer<typeof closeOutEntry>[] }, ctx: MutationContext) {
      notFuture(a.date, ctx);
      // Yesterday, or the day before it while the 3am rule still files late meals under it.
      if (daysBetween(a.date, ctx.today) > 2) throw new MutationRejected("That day is too long ago to close out.");
      for (const e of a.eaten) await eatPlanned(tx, { ...e, date: a.date }, ctx);
      for (const e of a.skipped) if (!(await slotResolved(tx, a.date, e.slot))) putSkipped(tx, { ...e, date: a.date }, ctx);
    },
  },
  swapMeal: {
    args: z.object({ date, slot, mealSlug, always: z.boolean() }),
    async run(tx: Tx, a: { date: string; slot: string; mealSlug: string; always: boolean }, ctx: MutationContext) {
      notFuture(a.date, ctx);
      if (!swapFits({ date: a.date, slot: a.slot as Slot, slug: a.mealSlug }, rotationMeals(), await restedOn(tx, a.date))) {
        throw new MutationRejected("That meal doesn't fit this slot.");
      }
      if ((await tx.scan("meal_logs")).some((l) => l.date === a.date && l.slot === a.slot && l.category === "planned")) {
        throw new MutationRejected("That meal is already eaten.");
      }
      const current = await tx.get("planned_meals", `${a.date}|${a.slot}`);
      tx.put("planned_meals", { date: a.date, slot: a.slot, meal_slug: a.mealSlug, swapped: 1 });
      if (a.always && current && current.meal_slug !== a.mealSlug) {
        const old = current.meal_slug as string;
        const state = await tx.get("meal_state", old);
        tx.put("meal_state", { slug: old, photo_key: (state?.photo_key as string | null | undefined) ?? null, rested_until: addDays(ctx.today, 28) });
      }
    },
  },
  startBatch: {
    args: z.object({ clientId, date, slot, mealSlug, portions: z.union([z.literal(2), z.literal(3)]), cookedWeightG: z.number().int().min(1).max(10_000) }),
    async run(tx: Tx, a: { clientId: string; date: string; slot: string; mealSlug: string; portions: number; cookedWeightG: number }, ctx: MutationContext) {
      notFuture(a.date, ctx);
      const meal = meals.get(a.mealSlug);
      if (!meal) throw new MutationRejected("That meal isn't in the library.");
      tx.put("batches", {
        client_id: a.clientId,
        meal_slug: meal.slug,
        portions: a.portions,
        cooked_weight_g: a.cookedWeightG,
        portion_g: batchPortion(a.cookedWeightG, a.portions),
        created_on: a.date,
        portions_left: a.portions,
        factor: await dayFactor(tx, a.date),
      });
      // The next days of the batch eat it too. Only this week: a row in next week would stop its plan being generated.
      const sunday = addDays(weekStart(a.date), 6);
      for (let i = 1; i < a.portions; i++) {
        const d = addDays(a.date, i);
        if (d > sunday || (await slotResolved(tx, d, a.slot))) continue;
        // Resting doesn't matter here: it's already cooked.
        if (!swapFits({ date: d, slot: a.slot as Slot, slug: meal.slug }, rotationMeals(), [])) continue;
        tx.put("planned_meals", { date: d, slot: a.slot, meal_slug: meal.slug, swapped: 1 });
      }
    },
  },
  unlogMeal: {
    args: z.object({ key }),
    async run(tx: Tx, a: { key: string }) {
      tx.delete("meal_logs", a.key);
    },
  },
  logOffPlan: {
    args: z.object({
      clientId,
      date,
      name: z.string().trim().min(1).max(80),
      category: z.enum(["meal", "snack", "dessert", "drink"]),
      kcal: z.number().int().min(0).max(5000),
      proteinG: z.number().int().min(0).max(400),
      relaxed: z.boolean(),
      /** Also save it as a usual order under this phone-made key. */
      usualId: clientId.optional(),
    }),
    async run(
      tx: Tx,
      a: { clientId: string; date: string; name: string; category: string; kcal: number; proteinG: number; relaxed: boolean; usualId?: string },
      ctx: MutationContext,
    ) {
      notFuture(a.date, ctx);
      putOffPlan(tx, { clientId: a.clientId, date: a.date, name: a.name, category: a.category, kcal: a.kcal, protein_g: a.proteinG, relaxed: a.relaxed ? 1 : 0 }, ctx);
      if (a.usualId) {
        tx.put("usual_orders", {
          client_id: a.usualId,
          name: a.name,
          category: a.category,
          kcal: a.kcal,
          protein_g: a.proteinG,
          relaxed: a.relaxed ? 1 : 0,
          uses: 1,
          last_used_at: ctx.now,
          created_at: ctx.now,
        });
      }
    },
  },
  logUsual: {
    args: z.object({ clientId, usual: key, date }),
    async run(tx: Tx, a: { clientId: string; usual: string; date: string }, ctx: MutationContext) {
      notFuture(a.date, ctx);
      const u = await tx.get("usual_orders", a.usual);
      if (!u) throw new MutationRejected("That usual order isn't saved.");
      putOffPlan(tx, { clientId: a.clientId, date: a.date, name: u.name as string, category: u.category as string, kcal: u.kcal as number, protein_g: u.protein_g as number, relaxed: u.relaxed as number }, ctx);
      tx.put("usual_orders", { ...u, uses: ((u.uses as number | undefined) ?? 0) + 1, last_used_at: ctx.now });
    },
  },
  removeUsual: {
    args: z.object({ key }),
    async run(tx: Tx, a: { key: string }) {
      tx.delete("usual_orders", a.key);
    },
  },
  deleteOffPlan: {
    args: z.object({ key }),
    async run(tx: Tx, a: { key: string }) {
      tx.delete("meal_logs", a.key);
    },
  },
  setReminder: {
    args: z.object({
      kind: z.enum(DEFAULT_REMINDERS.map((r) => r.kind) as [string, ...string[]]),
      enabled: z.boolean(),
      time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    }),
    async run(tx: Tx, a: { kind: string; enabled: boolean; time: string }) {
      tx.put("reminder_settings", { kind: a.kind, enabled: a.enabled ? 1 : 0, time: a.time });
    },
  },
  setVoice: {
    args: z.object({ voice: z.enum(["corner", "plain"]) }),
    async run(tx: Tx, a: { voice: string }) {
      tx.put("profile", { id: "me", voice: a.voice });
    },
  },
  planWorkout: {
    args: z.object({ clientId, date, templateId, at }),
    async run(tx: Tx, a: { clientId: string; date: string; templateId: string; at: string }, ctx: MutationContext) {
      notFuture(a.date, ctx);
      checkTime(a.at, ctx);
      const open = (await tx.scan("workout_sessions")).find((r) => r.date === a.date && !r.ended_at);
      if (open?.started_at) {
        if (open.template_id === a.templateId) return;
        throw new MutationRejected("Today's workout has already started.");
      }
      if (open) {
        tx.put("workout_sessions", { ...open, template_id: a.templateId, lifts: open.template_id === a.templateId ? open.lifts : null });
        return;
      }
      tx.put("workout_sessions", {
        client_id: a.clientId,
        date: a.date,
        template_id: a.templateId,
        started_at: null,
        ended_at: null,
        exercises: null,
        planned_at: a.at,
        lifts: null,
        feel: null,
      });
    },
  },
  setLifts: {
    args: z.object({ workout, lifts: z.array(lift).max(30) }),
    async run(tx: Tx, a: { workout: string; lifts: z.infer<typeof lift>[] }) {
      const row = await workoutRow(tx, a.workout);
      if (new Set(a.lifts.map((l) => l.position)).size !== a.lifts.length) throw new MutationRejected("Two lifts share a place.");
      const kept = new Set(a.lifts.map((l) => l.position));
      const keptExercises = new Set(a.lifts.map((l) => l.exercise));
      const sets = (await tx.scan("set_logs")).filter((r) => r.session_key === a.workout);
      const checks = (await tx.scan("exercise_checks")).filter((r) => r.session_key === a.workout);
      if (sets.some((r) => !kept.has(r.position as number)) || checks.some((r) => !keptExercises.has(r.exercise_id as string))) {
        throw new MutationRejected("That lift has sets logged.");
      }
      tx.put("workout_sessions", { ...row, lifts: JSON.stringify(a.lifts) });
    },
  },
  startWorkout: {
    args: z.object({ workout, at }),
    async run(tx: Tx, a: { workout: string; at: string }, ctx: MutationContext) {
      checkTime(a.at, ctx);
      const row = await workoutRow(tx, a.workout);
      if (row.started_at) return;
      tx.put("workout_sessions", { ...row, started_at: a.at });
    },
  },
  logSet: {
    args: z.object({
      clientId,
      workout,
      position: z.number().int().min(0).max(199),
      exercise: exerciseId,
      setNumber: z.number().int().min(1).max(10),
      weightLb: z.number().min(0).max(2000),
      reps: z.number().int().min(0).max(100),
      at,
    }),
    async run(
      tx: Tx,
      a: { clientId: string; workout: string; position: number; exercise: string; setNumber: number; weightLb: number; reps: number; at: string },
      ctx: MutationContext,
    ) {
      checkTime(a.at, ctx);
      const row = await workoutRow(tx, a.workout);
      // Logging is what starts a workout someone forgot to start.
      if (!row.started_at) tx.put("workout_sessions", { ...row, started_at: a.at });
      tx.put("set_logs", {
        client_id: a.clientId,
        // The server has numbered the workout by now; the phone may not have, until its next pull.
        session_id: (row.id as number | undefined) ?? null,
        session_key: a.workout,
        exercise_id: a.exercise,
        position: a.position,
        set_number: a.setNumber,
        weight_lb: round1(a.weightLb),
        reps: a.reps,
        logged_at: a.at,
      });
    },
  },
  editSet: {
    args: z.object({ key, weightLb: z.number().min(0).max(2000), reps: z.number().int().min(0).max(100) }),
    async run(tx: Tx, a: { key: string; weightLb: number; reps: number }) {
      const row = await tx.get("set_logs", a.key);
      if (!row) throw new MutationRejected("That set isn't saved.");
      tx.put("set_logs", { ...row, weight_lb: round1(a.weightLb), reps: a.reps });
    },
  },
  deleteSet: {
    args: z.object({ key }),
    async run(tx: Tx, a: { key: string }) {
      tx.delete("set_logs", a.key);
    },
  },
  checkLift: {
    args: z.object({ workout, exercise: exerciseId, done: z.boolean() }),
    async run(tx: Tx, a: { workout: string; exercise: string; done: boolean }) {
      const row = await workoutRow(tx, a.workout);
      if (!a.done) return tx.delete("exercise_checks", `${a.workout}|${a.exercise}`);
      tx.put("exercise_checks", { session_id: (row.id as number | undefined) ?? null, session_key: a.workout, exercise_id: a.exercise });
    },
  },
  finishWorkout: {
    args: z.object({ workout, at }),
    async run(tx: Tx, a: { workout: string; at: string }, ctx: MutationContext) {
      checkTime(a.at, ctx);
      const row = await workoutRow(tx, a.workout);
      // A workout marked done without being started still counts, as in v1.
      tx.put("workout_sessions", { ...row, started_at: row.started_at ?? a.at, ended_at: a.at });
    },
  },
  rateWorkout: {
    args: z.object({ workout, feel: z.enum(["easy", "right", "hard"]).nullable() }),
    async run(tx: Tx, a: { workout: string; feel: string | null }) {
      const row = await workoutRow(tx, a.workout);
      if (!row.ended_at) throw new MutationRejected("Finish the workout first.");
      tx.put("workout_sessions", { ...row, feel: a.feel });
    },
  },
  setNote: {
    args: z.object({ exercise: exerciseId, note: z.string().max(200) }),
    async run(tx: Tx, a: { exercise: string; note: string }, ctx: MutationContext) {
      const note = a.note.trim();
      if (!note) return tx.delete("exercise_notes", a.exercise);
      tx.put("exercise_notes", { exercise_id: a.exercise, note, updated_at: ctx.now });
    },
  },
  moveWorkout: {
    args: z.object({ a: date, b: date }),
    async run(tx: Tx, a: { a: string; b: string }) {
      if (a.a === a.b || weekStart(a.a) !== weekStart(a.b)) throw new MutationRejected("Pick another day this week.");
      const moves: Record<string, string | null> = Object.fromEntries((await tx.scan("schedule_moves")).map((r) => [r.date as string, (r.template_id as string | null) ?? null]));
      if (templateFor(plan, a.a, moves) === null && templateFor(plan, a.b, moves) === null) throw new MutationRejected("Neither day has a workout.");
      const logged = await workoutDates(tx);
      if (logged.has(a.a) || logged.has(a.b)) throw new MutationRejected("That workout is already logged.");
      for (const d of swapWorkouts(plan, moves, a.a, a.b)) {
        if (d.usual) tx.delete("schedule_moves", d.date);
        else tx.put("schedule_moves", { date: d.date, template_id: d.templateId });
      }
      // A workout planned but not started follows the schedule, so it goes and the day replans from its new workout.
      for (const r of await tx.scan("workout_sessions")) {
        if ((r.date === a.a || r.date === a.b) && !r.started_at && !r.ended_at) tx.delete("workout_sessions", keyOf("workout_sessions", r));
      }
    },
  },
  swapAlways: {
    args: z.object({ templateId: z.string().refine((id) => id in plan.templates, "That workout isn't in the plan."), position: z.number().int().min(0).max(30), exercise: exerciseId }),
    async run(tx: Tx, a: { templateId: string; position: number; exercise: string }) {
      tx.put("exercise_overrides", { template_id: a.templateId, position: a.position, exercise_id: a.exercise });
    },
  },
};

export type MutationName = keyof typeof defs;
export const MUTATION_NAMES = Object.keys(defs) as MutationName[];

/** Validates the args and applies one named change. Throws MutationRejected for anything the change refuses. */
export async function runMutation(tx: Tx, name: string, args: unknown, ctx: MutationContext): Promise<void> {
  // hasOwn, because the name comes from the phone and "constructor" would otherwise resolve.
  const def = Object.hasOwn(defs, name)
    ? (defs as Record<string, { args: z.ZodType; run: (tx: Tx, a: never, ctx: MutationContext) => Promise<void> }>)[name]
    : undefined;
  if (!def) throw new MutationRejected(`Unknown change: ${name}`);
  const parsed = def.args.safeParse(args);
  if (!parsed.success) throw new MutationRejected(parsed.error.issues[0]?.message ?? "Bad input");
  await def.run(tx, parsed.data as never, ctx);
}

export const MUTATION_LABELS: Record<MutationName, string> = {
  logWeighIn: "Weigh-in",
  editWeighIn: "Weigh-in change",
  deleteWeighIn: "Weigh-in removal",
  logMeal: "Meal",
  unlogMeal: "Meal undo",
  skipMeal: "Skipped meal",
  closeOutDay: "Close-out",
  swapMeal: "Meal swap",
  startBatch: "Batch",
  logOffPlan: "Off-plan item",
  deleteOffPlan: "Off-plan removal",
  logUsual: "Usual order",
  removeUsual: "Usual order removal",
  setReminder: "Reminder",
  setVoice: "Voice setting",
  planWorkout: "Workout plan",
  setLifts: "Lift change",
  startWorkout: "Workout start",
  logSet: "Set",
  editSet: "Set change",
  deleteSet: "Set removal",
  checkLift: "Lift check",
  finishWorkout: "Workout finish",
  rateWorkout: "How it felt",
  setNote: "Note",
  moveWorkout: "Workout move",
  swapAlways: "Swap",
};

/** The one line a screen shows for a change that did not save. */
export function describeRejection(name: string, message: string): string {
  const label = Object.hasOwn(MUTATION_LABELS, name) ? MUTATION_LABELS[name as MutationName] : "A change";
  return `${label} didn't save. ${message}`;
}
