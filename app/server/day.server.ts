import { eq } from "drizzle-orm";
import { exerciseImage, exercises, plan, type MealWithMacros } from "~/content";
import type { Db } from "~/db/client";
import { mealState, workoutSessions } from "~/db/schema";
import { isOnPlan, streak as streakFrom } from "~/domain/adherence";
import { dayMode, isRelaxedDay, isTrainingDay, optionalTemplateFor, setsFor, templateFor, weekNumber, weekType } from "~/domain/calendar";
import { addDays, formatClock, localMinutes, parseTime } from "~/domain/dates";
import type { DayMode, ISODate, Slot, WeekType } from "~/domain/types";
import { stepsFor, weighInEntry } from "./body.server";
import { datesWithSets, dayResults } from "./history.server";
import { plannedForDate } from "./meal-plan.server";
import { logsForDate, type MealLog } from "./meals.server";
import { targetsFor, type Targets } from "./targets.server";

export interface SlotView {
  slot: Slot;
  time: string;
  minutes: number;
  meal: MealWithMacros;
  swapped: boolean;
  logId: number | null;
  photoKey: string | null;
}

export interface TrainingView {
  templateId: string;
  name: string;
  exerciseCount: number;
  setCount: number;
  heroImage: string;
}

export interface DaySummary {
  date: ISODate;
  minutes: number;
  weekNumber: number;
  weekType: WeekType;
  relaxed: boolean;
  mode: DayMode;
  targets: Targets;
  totals: { kcal: number; proteinG: number };
  steps: number;
  weighIn: number | null;
  weighInTime: string | null;
  slots: SlotView[];
  offPlan: MealLog[];
  offPlanDessert: boolean;
  training: TrainingView | null;
  optional: { templateId: string; name: string } | null;
  sessionStarted: boolean;
  loggedSetToday: boolean;
  onPlan: boolean;
  streak: number;
  missedTwice: boolean;
  nextSlot: Slot | null;
}

export async function loadDay(db: Db, date: ISODate, now: Date): Promise<DaySummary> {
  const [targets, slots, logs, steps, weighInRow, photos] = await Promise.all([
    targetsFor(db, date),
    plannedForDate(db, date),
    logsForDate(db, date),
    stepsFor(db, date),
    weighInEntry(db, date),
    db.select().from(mealState).all(),
  ]);
  const photoBySlug = new Map(photos.map((p) => [p.slug, p.photoKey]));

  const slotViews: SlotView[] = slots.map((s) => {
    const minutes = parseTime(plan.slotTimes[s.slot]);
    const log = logs.find((l) => l.slot === s.slot && l.category === "planned");
    return { slot: s.slot, time: formatClock(minutes), minutes, meal: s.meal, swapped: s.swapped, logId: log?.id ?? null, photoKey: photoBySlug.get(s.meal.slug) ?? null };
  });

  const offPlan = logs.filter((l) => l.category !== "planned");
  const totals = logs.reduce((t, l) => ({ kcal: t.kcal + l.kcal, proteinG: t.proteinG + l.proteinG }), { kcal: 0, proteinG: 0 });
  const offPlanDessert = offPlan.some((l) => l.category === "dessert" && !l.relaxed);
  const relaxed = isRelaxedDay(plan, date);

  const templateId = templateFor(plan, date);
  const training: TrainingView | null = templateId
    ? (() => {
        const t = plan.templates[templateId]!;
        const first = exercises.get(t.exercises[0].exercise)!;
        return { templateId, name: t.name, exerciseCount: t.exercises.length, setCount: t.exercises.length * setsFor(plan, date), heroImage: exerciseImage(first, 0) };
      })()
    : null;
  const optionalId = optionalTemplateFor(plan, date);

  const sessions = await db.select().from(workoutSessions).where(eq(workoutSessions.date, date)).all();
  const setDates = await datesWithSets(db, addDays(date, -14), date);

  const history = await dayResults(db, addDays(date, -60), addDays(date, -1));
  const onPlan = isOnPlan({ proteinG: totals.proteinG, steps, offPlanDessert, relaxedDay: relaxed, proteinTarget: targets.proteinG, stepGoal: targets.stepGoal });

  return {
    date,
    minutes: localMinutes(now),
    weekNumber: weekNumber(plan, date),
    weekType: weekType(plan, date),
    relaxed,
    mode: dayMode(date),
    targets,
    totals,
    steps,
    weighIn: weighInRow?.weightLb ?? null,
    weighInTime: weighInRow ? formatClock(localMinutes(new Date(weighInRow.loggedAt))) : null,
    slots: slotViews,
    offPlan,
    offPlanDessert,
    training,
    optional: optionalId ? { templateId: optionalId, name: plan.templates[optionalId]!.name } : null,
    sessionStarted: sessions.length > 0,
    loggedSetToday: setDates.has(date),
    onPlan,
    streak: streakFrom(history, date, onPlan),
    missedTwice: missedTwoInARow(date, setDates),
    nextSlot: slotViews.find((s) => s.logId === null)?.slot ?? null,
  };
}

/** The last two training days before today both had no sets, and nothing was logged since the first of them. */
function missedTwoInARow(today: ISODate, setDates: Set<ISODate>): boolean {
  const missed: ISODate[] = [];
  for (let d = addDays(today, -1); missed.length < 2 && d >= addDays(today, -14) && d >= plan.phaseStart; d = addDays(d, -1)) {
    if (!isTrainingDay(plan, d)) continue;
    if (setDates.has(d)) return false;
    missed.push(d);
  }
  if (missed.length < 2) return false;
  for (const d of setDates) if (d > missed[1]) return false;
  return true;
}
