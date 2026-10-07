import { and, asc, desc, eq, lt } from "drizzle-orm";
import { exerciseImage, exercises, plan } from "~/content";
import type { Exercise } from "~/content/schema";
import type { Db } from "~/db/client";
import { exerciseChecks, exerciseOverrides, exerciseSwaps, setLogs, workoutSessions } from "~/db/schema";
import { setsFor, weekType } from "~/domain/calendar";
import { nextSuggestion, restSeconds, type LoggedSet, type Suggestion } from "~/domain/progression";
import { CUSTOM_WORKOUT, type ISODate } from "~/domain/types";

export interface ExerciseSlot {
  position: number;
  exercise: Exercise;
  repMin: number;
  repMax: number;
  swapped: boolean;
}

export const CUSTOM = CUSTOM_WORKOUT;
const CUSTOM_REPS = { repMin: 8, repMax: 12 };

export const isWorkout = (templateId: string) => templateId === CUSTOM || templateId in plan.templates;

export function workoutName(templateId: string): string {
  return templateId === CUSTOM ? "Custom workout" : (plan.templates[templateId]?.name ?? "Workout");
}

type Session = typeof workoutSessions.$inferSelect;

function customIds(session: Session | undefined): string[] {
  const ids: unknown = JSON.parse(session?.exercises ?? "[]");
  return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string" && exercises.has(id)) : [];
}

function customSlots(session: Session | undefined): ExerciseSlot[] {
  return customIds(session).map((id, position) => ({ position, exercise: exercises.get(id)!, ...CUSTOM_REPS, swapped: false }));
}

/** The exercises in a day's workout: the plan's, or for a custom workout the ones picked for it. */
export async function workoutSlots(db: Db, date: ISODate, templateId: string): Promise<ExerciseSlot[]> {
  return templateId === CUSTOM ? customSlots(await findSession(db, date, CUSTOM)) : resolveTemplate(db, templateId, date);
}

export async function resolveTemplate(db: Db, templateId: string, date: ISODate): Promise<ExerciseSlot[]> {
  const template = plan.templates[templateId];
  if (!template) throw new Error(`Unknown template ${templateId}`);
  const [overrides, swaps] = await Promise.all([
    db.select().from(exerciseOverrides).where(eq(exerciseOverrides.templateId, templateId)).all(),
    db.select().from(exerciseSwaps).where(and(eq(exerciseSwaps.date, date), eq(exerciseSwaps.templateId, templateId))).all(),
  ]);
  return template.exercises.map((e, position) => {
    const chosen = swaps.find((s) => s.position === position)?.exerciseId ?? overrides.find((o) => o.position === position)?.exerciseId ?? e.exercise;
    const exercise = exercises.get(chosen) ?? exercises.get(e.exercise)!;
    return { position, exercise, repMin: e.repMin, repMax: e.repMax, swapped: exercise.id !== e.exercise };
  });
}

export async function lastSessionSets(db: Db, exerciseId: string, before: ISODate): Promise<LoggedSet[] | null> {
  // One round trip: newest session first, so the leading rows that share its id are that session's sets.
  const rows = await db
    .select({ sessionId: setLogs.sessionId, weight: setLogs.weightLb, reps: setLogs.reps })
    .from(setLogs)
    .innerJoin(workoutSessions, eq(setLogs.sessionId, workoutSessions.id))
    .where(and(eq(setLogs.exerciseId, exerciseId), lt(workoutSessions.date, before)))
    .orderBy(desc(workoutSessions.date), desc(setLogs.sessionId), asc(setLogs.setNumber))
    .limit(20)
    .all();
  if (rows.length === 0) return null;
  return rows.filter((r) => r.sessionId === rows[0].sessionId).map((r) => ({ weight: r.weight, reps: r.reps }));
}

function findSession(db: Db, date: ISODate, templateId: string) {
  return db.select().from(workoutSessions).where(and(eq(workoutSessions.date, date), eq(workoutSessions.templateId, templateId))).get();
}

export interface SetInput {
  date: ISODate;
  templateId: string;
  position: number;
  exerciseId: string;
  setNumber: number;
  weightLb: number;
  reps: number;
  clientId: string;
}

async function ensureSession(db: Db, date: ISODate, templateId: string, now: Date): Promise<Session> {
  const found = await findSession(db, date, templateId);
  if (found) return found;
  const [created] = await db.insert(workoutSessions).values({ date, templateId, startedAt: now.toISOString() }).returning();
  return created;
}

export async function logSet(db: Db, input: SetInput, now: Date): Promise<void> {
  const session = await ensureSession(db, input.date, input.templateId, now);
  await db
    .insert(setLogs)
    .values({
      sessionId: session.id,
      exerciseId: input.exerciseId,
      position: input.position,
      setNumber: input.setNumber,
      weightLb: input.weightLb,
      reps: input.reps,
      loggedAt: now.toISOString(),
      clientId: input.clientId,
    })
    .onConflictDoNothing();
}

export async function updateSet(db: Db, id: number, weightLb: number, reps: number): Promise<void> {
  await db.update(setLogs).set({ weightLb, reps }).where(eq(setLogs.id, id));
}

export async function deleteSet(db: Db, id: number): Promise<void> {
  await db.delete(setLogs).where(eq(setLogs.id, id));
}

export async function swapExercise(db: Db, date: ISODate, templateId: string, position: number, exerciseId: string, always: boolean): Promise<void> {
  if (always) {
    await db.insert(exerciseOverrides).values({ templateId, position, exerciseId }).onConflictDoUpdate({ target: [exerciseOverrides.templateId, exerciseOverrides.position], set: { exerciseId } });
    await db.delete(exerciseSwaps).where(and(eq(exerciseSwaps.date, date), eq(exerciseSwaps.templateId, templateId), eq(exerciseSwaps.position, position)));
  } else {
    await db
      .insert(exerciseSwaps)
      .values({ date, templateId, position, exerciseId })
      .onConflictDoUpdate({ target: [exerciseSwaps.date, exerciseSwaps.templateId, exerciseSwaps.position], set: { exerciseId } });
  }
}

/** Ends the workout. With nothing logged it still counts as done, for a workout logged without the numbers. */
export async function endSession(db: Db, date: ISODate, templateId: string, now: Date): Promise<void> {
  const session = await ensureSession(db, date, templateId, now);
  await db.update(workoutSessions).set({ endedAt: now.toISOString() }).where(eq(workoutSessions.id, session.id));
}

/** Marks an exercise done without weights or reps, or clears that mark. */
export async function checkExercise(db: Db, date: ISODate, templateId: string, exerciseId: string, done: boolean, now: Date): Promise<void> {
  const session = await ensureSession(db, date, templateId, now);
  if (done) await db.insert(exerciseChecks).values({ sessionId: session.id, exerciseId }).onConflictDoNothing();
  else await db.delete(exerciseChecks).where(and(eq(exerciseChecks.sessionId, session.id), eq(exerciseChecks.exerciseId, exerciseId)));
}

/**
 * Sets the exercises in a custom workout. Ones with sets or a check stay even if left out, so nothing logged is
 * orphaned; the rest keep their order and new picks go on the end.
 */
export async function setCustomExercises(db: Db, date: ISODate, ids: string[], now: Date): Promise<void> {
  const session = await ensureSession(db, date, CUSTOM, now);
  const [sets, checks] = await Promise.all([
    db.select({ id: setLogs.exerciseId }).from(setLogs).where(eq(setLogs.sessionId, session.id)).all(),
    db.select({ id: exerciseChecks.exerciseId }).from(exerciseChecks).where(eq(exerciseChecks.sessionId, session.id)).all(),
  ]);
  const keep = new Set([...ids, ...sets.map((r) => r.id), ...checks.map((r) => r.id)]);
  const current = customIds(session);
  const next = [...current.filter((id) => keep.has(id)), ...ids.filter((id) => exercises.has(id) && !current.includes(id))];
  await db.update(workoutSessions).set({ exercises: JSON.stringify([...new Set(next)]) }).where(eq(workoutSessions.id, session.id));
}

export interface ExerciseView {
  position: number;
  id: string;
  name: string;
  equipment: string;
  images: [string, string];
  repMin: number;
  repMax: number;
  compound: boolean;
  restSeconds: number;
  swapped: boolean;
  /** Done without logging weights or reps. */
  checked: boolean;
  last: LoggedSet[] | null;
  suggestion: Suggestion;
  logged: { id: number; setNumber: number; weight: number; reps: number; loggedAt: string }[];
  done: boolean;
  /** Set once today's sets are done and every one hit the top of the range. */
  nextTime: number | null;
  swapOptions: { id: string; name: string; equipment: string; image: string }[];
}

export interface WorkoutView {
  templateId: string;
  name: string;
  kind: string;
  custom: boolean;
  date: ISODate;
  sets: number;
  deload: boolean;
  startedAt: string | null;
  endedAt: string | null;
  exercises: ExerciseView[];
}

export async function workoutView(db: Db, date: ISODate, templateId: string): Promise<WorkoutView> {
  const custom = templateId === CUSTOM;
  const [planned, session] = await Promise.all([custom ? null : resolveTemplate(db, templateId, date), findSession(db, date, templateId)]);
  const slots = planned ?? customSlots(session);
  const [todays, checks] = session
    ? await Promise.all([
        db.select().from(setLogs).where(eq(setLogs.sessionId, session.id)).orderBy(asc(setLogs.setNumber)).all(),
        db.select().from(exerciseChecks).where(eq(exerciseChecks.sessionId, session.id)).all(),
      ])
    : [[], []];
  const checked = new Set(checks.map((c) => c.exerciseId));
  const sets = setsFor(plan, date);
  const deload = weekType(plan, date) === "deload";
  const inUse = new Set(slots.map((s) => s.exercise.id));

  const views = await Promise.all(
    slots.map(async (s): Promise<ExerciseView> => {
      const last = await lastSessionSets(db, s.exercise.id, date);
      const rule = { repMax: s.repMax, increment: s.exercise.increment, deload };
      const logged = todays
        // A custom workout's list can be edited, so its sets follow the exercise rather than the position.
        .filter((l) => l.exerciseId === s.exercise.id && (custom || l.position === s.position))
        .map((l) => ({ id: l.id, setNumber: l.setNumber, weight: l.weightLb, reps: l.reps, loggedAt: l.loggedAt }));
      const done = logged.length >= sets || checked.has(s.exercise.id);
      const after = done ? nextSuggestion(logged, rule) : null;
      return {
        position: s.position,
        id: s.exercise.id,
        name: s.exercise.name,
        equipment: s.exercise.equipment,
        images: [exerciseImage(s.exercise, 0), exerciseImage(s.exercise, 1)],
        repMin: s.repMin,
        repMax: s.repMax,
        compound: s.exercise.compound,
        restSeconds: restSeconds(s.exercise.compound),
        swapped: s.swapped,
        checked: checked.has(s.exercise.id),
        last,
        suggestion: nextSuggestion(last, rule),
        logged,
        done,
        nextTime: after?.goUp ? after.weight : null,
        // Exercises already in today's workout are left out so a swap never doubles one up.
        swapOptions: custom
          ? []
          : [...exercises.values()]
              .filter((e) => e.group === s.exercise.group && !inUse.has(e.id))
              .map((e) => ({ id: e.id, name: e.name, equipment: e.equipment, image: exerciseImage(e, 0) })),
      };
    }),
  );

  return { templateId, name: workoutName(templateId), kind: custom ? CUSTOM : plan.templates[templateId]!.kind, custom, date, sets, deload, startedAt: session?.startedAt ?? null, endedAt: session?.endedAt ?? null, exercises: views };
}

export async function goUps(db: Db, date: ISODate, templateId: string): Promise<string[]> {
  const view = await workoutView(db, date, templateId);
  return view.exercises.filter((e) => e.suggestion.goUp).map((e) => `${e.name} goes up to ${e.suggestion.weight} lb today`);
}
