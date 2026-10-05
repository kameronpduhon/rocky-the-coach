import { asc, eq } from "drizzle-orm";
import { exerciseImage, exercises, plan } from "~/content";
import type { Db } from "~/db/client";
import { setLogs, workoutSessions } from "~/db/schema";
import { streak as streakFrom } from "~/domain/adherence";
import { isTrainingDay } from "~/domain/calendar";
import { addDays, daysBetween } from "~/domain/dates";
import type { ISODate } from "~/domain/types";
import { sevenDayAverage } from "~/domain/weight";
import { waistLogsAll, weighInsBetween } from "./body.server";
import { datesWithSets, dayResults } from "./history.server";
import { targetsFor } from "./targets.server";

/** Progress photos every 4 weeks: the first round on the Sunday that ends week 4. */
export function nextPhotoDate(today: ISODate): ISODate {
  const first = addDays(plan.phaseStart, 27);
  if (today <= first) return first;
  const cycles = Math.ceil(daysBetween(first, today) / 28);
  return addDays(first, cycles * 28);
}

export interface ProgressData {
  phaseStart: ISODate;
  series: { date: ISODate; weight: number | null; avg: number | null }[];
  latestAvg: number | null;
  changeSinceStart: number | null;
  waist: { latest: number; change: number | null } | null;
  daysOnPlan: number;
  daysTracked: number;
  streak: number;
  workoutsDone: number;
  workoutsPlanned: number;
  optionalDone: number;
  avgSteps: number;
  stepGoal: number;
  strength: { id: string; name: string; image: string; from: number; to: number }[];
  nextPhoto: ISODate;
}

export async function progressData(db: Db, today: ISODate): Promise<ProgressData> {
  const start = plan.phaseStart;
  const [weighInRows, waists, results, [todayResult], setDates, last7, sets, targets] = await Promise.all([
    weighInsBetween(db, addDays(start, -7), today),
    waistLogsAll(db),
    today > start ? dayResults(db, start, addDays(today, -1)) : Promise.resolve([]),
    dayResults(db, today, today),
    datesWithSets(db, start, today),
    dayResults(db, addDays(today, -7), addDays(today, -1)),
    db
      .select({ exerciseId: setLogs.exerciseId, weight: setLogs.weightLb, date: workoutSessions.date })
      .from(setLogs)
      .innerJoin(workoutSessions, eq(setLogs.sessionId, workoutSessions.id))
      .orderBy(asc(workoutSessions.date))
      .all(),
    targetsFor(db, today),
  ]);
  const weighIns = weighInRows.map((w) => ({ date: w.date, weight: w.weightLb }));
  const byDate = new Map(weighIns.map((w) => [w.date, w.weight]));
  const lastWeighIn = weighIns.at(-1)?.date ?? start;
  const end = lastWeighIn > today ? today : lastWeighIn;
  const series = [];
  for (let i = 0; i <= Math.max(0, daysBetween(start, end)); i++) {
    const date = addDays(start, i);
    series.push({ date, weight: byDate.get(date) ?? null, avg: sevenDayAverage(weighIns, date) });
  }
  const avgs = series.map((s) => s.avg).filter((a): a is number => a !== null);
  const firstWeight = weighIns.find((w) => w.date >= start)?.weight ?? null;
  const latestAvg = avgs.at(-1) ?? null;

  const waist = waists.length
    ? { latest: waists.at(-1)!.inches, change: waists.length > 1 ? Math.round((waists.at(-1)!.inches - waists[0].inches) * 10) / 10 : null }
    : null;

  // Today joins the count once it is already on plan, the same way it joins the streak.
  const daysOnPlan = results.filter((r) => r.onPlan).length + (todayResult.onPlan ? 1 : 0);
  const daysTracked = results.length + (todayResult.onPlan ? 1 : 0);

  let workoutsDone = 0;
  let workoutsPlanned = 0;
  let optionalDone = 0;
  for (let i = 0; i <= daysBetween(start, today); i++) {
    const d = addDays(start, i);
    if (isTrainingDay(plan, d)) {
      if (d < today || setDates.has(d)) workoutsPlanned++;
      if (setDates.has(d)) workoutsDone++;
    } else if (setDates.has(d)) optionalDone++;
  }
  const topByExercise = new Map<string, Map<ISODate, number>>();
  for (const s of sets) {
    const days = topByExercise.get(s.exerciseId) ?? new Map<ISODate, number>();
    days.set(s.date, Math.max(days.get(s.date) ?? 0, s.weight));
    topByExercise.set(s.exerciseId, days);
  }
  const strength = [...topByExercise.entries()]
    .filter(([id, days]) => exercises.has(id) && days.size >= 2)
    .map(([id, days]) => {
      const values = [...days.values()];
      const ex = exercises.get(id)!;
      return { id, name: ex.name, image: exerciseImage(ex, 0), from: values[0], to: values.at(-1)! };
    })
    .filter((s) => s.to > s.from)
    .sort((a, b) => b.to - b.from - (a.to - a.from))
    .slice(0, 3);

  return {
    phaseStart: start,
    series,
    latestAvg,
    changeSinceStart: latestAvg !== null && firstWeight !== null ? Math.round((latestAvg - firstWeight) * 10) / 10 : null,
    waist,
    daysOnPlan,
    daysTracked,
    streak: streakFrom(results, today, todayResult.onPlan),
    workoutsDone,
    workoutsPlanned,
    optionalDone,
    avgSteps: Math.round(last7.reduce((s, d) => s + d.steps, 0) / 7),
    stepGoal: targets.stepGoal,
    strength,
    nextPhoto: nextPhotoDate(today),
  };
}
