import { z } from "zod";
import { exercises, meals, plan } from "~/content";
import { swapWorkouts, templateFor } from "~/domain/calendar";
import { addDays, daysBetween, weekStart } from "~/domain/dates";
import { DEFAULT_REMINDERS } from "~/domain/reminders";
import { CUSTOM_WORKOUT, SLOTS } from "~/domain/types";
import { keyOf } from "./tables";
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
    args: z.object({ clientId, date, slot: z.enum(SLOTS as [string, ...string[]]), mealSlug: z.string().min(1) }),
    async run(tx: Tx, a: { clientId: string; date: string; slot: string; mealSlug: string }, ctx: MutationContext) {
      notFuture(a.date, ctx);
      const meal = meals.get(a.mealSlug);
      if (!meal) throw new MutationRejected("That meal isn't in the library.");
      const logs = await tx.scan("meal_logs");
      if (logs.some((l) => l.date === a.date && l.slot === a.slot && l.category === "planned")) return;
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
      // Same rule as openBatch in meals.server.ts: the newest batch of this meal with portions left, cooked up to 3 days ago.
      const batch = (await tx.scan("batches"))
        .filter((b) => b.meal_slug === meal.slug && (b.portions_left as number) > 0 && (b.created_on as string) >= addDays(a.date, -3) && (b.created_on as string) <= a.date)
        .sort((x, y) => (y.id as number) - (x.id as number))[0];
      if (batch) tx.put("batches", { ...batch, portions_left: (batch.portions_left as number) - 1 });
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
    }),
    async run(
      tx: Tx,
      a: { clientId: string; date: string; name: string; category: string; kcal: number; proteinG: number; relaxed: boolean },
      ctx: MutationContext,
    ) {
      notFuture(a.date, ctx);
      tx.put("meal_logs", {
        client_id: a.clientId,
        date: a.date,
        slot: null,
        meal_slug: null,
        name: a.name,
        category: a.category,
        kcal: a.kcal,
        protein_g: a.proteinG,
        relaxed: a.relaxed ? 1 : 0,
        portions: 1,
        logged_at: ctx.now,
      });
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
  logOffPlan: "Off-plan item",
  deleteOffPlan: "Off-plan removal",
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
