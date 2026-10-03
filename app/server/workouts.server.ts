import { and, asc, desc, eq, lt } from "drizzle-orm";
import { exerciseImage, exercises, plan } from "~/content";
import type { Exercise } from "~/content/schema";
import type { Db } from "~/db/client";
import { exerciseOverrides, exerciseSwaps, setLogs, workoutSessions } from "~/db/schema";
import { setsFor, weekType } from "~/domain/calendar";
import { nextSuggestion, restSeconds, type LoggedSet, type Suggestion } from "~/domain/progression";
import type { ISODate } from "~/domain/types";

export interface ExerciseSlot {
  position: number;
  exercise: Exercise;
  repMin: number;
  repMax: number;
  swapped: boolean;
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
  const last = await db
    .select({ sessionId: setLogs.sessionId })
    .from(setLogs)
    .innerJoin(workoutSessions, eq(setLogs.sessionId, workoutSessions.id))
    .where(and(eq(setLogs.exerciseId, exerciseId), lt(workoutSessions.date, before)))
    .orderBy(desc(workoutSessions.date), desc(setLogs.sessionId))
    .limit(1)
    .get();
  if (!last) return null;
  const rows = await db
    .select()
    .from(setLogs)
    .where(and(eq(setLogs.sessionId, last.sessionId), eq(setLogs.exerciseId, exerciseId)))
    .orderBy(asc(setLogs.setNumber))
    .all();
  return rows.map((r) => ({ weight: r.weightLb, reps: r.reps }));
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

export async function logSet(db: Db, input: SetInput, now: Date): Promise<void> {
  let session = await findSession(db, input.date, input.templateId);
  if (!session) {
    [session] = await db.insert(workoutSessions).values({ date: input.date, templateId: input.templateId, startedAt: now.toISOString() }).returning();
  }
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

export async function endSession(db: Db, date: ISODate, templateId: string, now: Date): Promise<void> {
  await db.update(workoutSessions).set({ endedAt: now.toISOString() }).where(and(eq(workoutSessions.date, date), eq(workoutSessions.templateId, templateId)));
}

export interface ExerciseView {
  position: number;
  id: string;
  name: string;
  images: [string, string];
  repMin: number;
  repMax: number;
  compound: boolean;
  restSeconds: number;
  swapped: boolean;
  last: LoggedSet[] | null;
  suggestion: Suggestion;
  logged: { id: number; setNumber: number; weight: number; reps: number }[];
  done: boolean;
  /** Set once today's sets are done and every one hit the top of the range. */
  nextTime: number | null;
  swapOptions: { id: string; name: string; equipment: string; image: string }[];
}

export interface WorkoutView {
  templateId: string;
  name: string;
  kind: string;
  date: ISODate;
  sets: number;
  deload: boolean;
  startedAt: string | null;
  endedAt: string | null;
  exercises: ExerciseView[];
}

export async function workoutView(db: Db, date: ISODate, templateId: string): Promise<WorkoutView> {
  const template = plan.templates[templateId]!;
  const slots = await resolveTemplate(db, templateId, date);
  const session = await findSession(db, date, templateId);
  const todays = session ? await db.select().from(setLogs).where(eq(setLogs.sessionId, session.id)).orderBy(asc(setLogs.setNumber)).all() : [];
  const sets = setsFor(plan, date);
  const deload = weekType(plan, date) === "deload";
  const inUse = new Set(slots.map((s) => s.exercise.id));

  const views = await Promise.all(
    slots.map(async (s): Promise<ExerciseView> => {
      const last = await lastSessionSets(db, s.exercise.id, date);
      const rule = { repMax: s.repMax, increment: s.exercise.increment, deload };
      const logged = todays
        .filter((l) => l.position === s.position && l.exerciseId === s.exercise.id)
        .map((l) => ({ id: l.id, setNumber: l.setNumber, weight: l.weightLb, reps: l.reps }));
      const done = logged.length >= sets;
      const after = done ? nextSuggestion(logged, rule) : null;
      return {
        position: s.position,
        id: s.exercise.id,
        name: s.exercise.name,
        images: [exerciseImage(s.exercise, 0), exerciseImage(s.exercise, 1)],
        repMin: s.repMin,
        repMax: s.repMax,
        compound: s.exercise.compound,
        restSeconds: restSeconds(s.exercise.compound),
        swapped: s.swapped,
        last,
        suggestion: nextSuggestion(last, rule),
        logged,
        done,
        nextTime: after?.goUp ? after.weight : null,
        // Exercises already in today's workout are left out so a swap never doubles one up.
        swapOptions: [...exercises.values()]
          .filter((e) => e.group === s.exercise.group && !inUse.has(e.id))
          .map((e) => ({ id: e.id, name: e.name, equipment: e.equipment, image: exerciseImage(e, 0) })),
      };
    }),
  );

  return { templateId, name: template.name, kind: template.kind, date, sets, deload, startedAt: session?.startedAt ?? null, endedAt: session?.endedAt ?? null, exercises: views };
}

export async function goUps(db: Db, date: ISODate, templateId: string): Promise<string[]> {
  const view = await workoutView(db, date, templateId);
  return view.exercises.filter((e) => e.suggestion.goUp).map((e) => `${e.name} goes up to ${e.suggestion.weight} lb today`);
}
