// Rocky's take, written by rules from the week's numbers (spec section 1, "Rocky's take"). Every number it prints comes
// from the digest. Project 5 replaces only this text, and only when the AI is on. Pure.
import { COACH_NAME } from "~/brand";
import { MIN_TRACKED_IN_WEEK } from "~/domain/energy";
import { weekday } from "~/domain/dates";
import type { ISODate } from "~/domain/types";
import type { CheckInDigest } from "./digest";

export interface Take {
  win: string;
  fix: string;
  call: string;
}

const DAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const COUNT = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"];

const num = (n: number) => n.toLocaleString("en-US");
const dayName = (d: ISODate) => DAY[weekday(d)];
const monthDay = (d: ISODate) => {
  const [, m, day] = d.split("-").map(Number);
  return `${MONTH_SHORT[m - 1]} ${day}`;
};
/** A weight change, one decimal: "0.4". */
const lb = (n: number) => Math.abs(n).toFixed(1);
/** Inches, at most two decimals: "0.25", "0.5". */
const inches = (n: number) => String(Math.round(Math.abs(n) * 100) / 100);
const goal = (lbPerWeek: number) => String(Math.round(lbPerWeek * 10) / 10);

function win(d: CheckInDigest): string {
  const { days, protein, lifts, steps, waist, weight } = d;
  if (days.counted === days.total && protein.avg !== null && protein.avg >= protein.target - 5) return `Seven of seven days counted, and protein averaged ${protein.avg} g against ${protein.target}.`;
  if (lifts.movedUp.length >= 2) return `${COUNT[lifts.movedUp.length] ?? lifts.movedUp.length} lifts moved up. ${lifts.movedUp[0].name} goes to ${lifts.movedUp[0].to} lb.`;
  if (lifts.planned >= 2 && lifts.plannedDone === lifts.planned) return `All ${lifts.planned} workouts done.`;
  if (steps.avg >= steps.goal) return `Steps averaged ${num(steps.avg)}, ${steps.avg > steps.goal ? "over" : "right at"} the ${num(steps.goal)} goal.`;
  if (waist.change !== null && waist.change < 0 && waist.wasDate) return `Waist is down ${inches(waist.change)} in since ${monthDay(waist.wasDate)}.`;
  if (weight.change !== null && weight.change < 0) return `Trend down ${lb(weight.change)} lb this week.`;
  return `${days.counted} of ${days.total} days counted.`;
}

function fix(d: CheckInDigest): string {
  const { steps, days, protein, lifts, desserts } = d;
  if (steps.avg < steps.goal) {
    const low = steps.lowDay ? ` ${dayName(steps.lowDay.date)} was the low day at ${num(steps.lowDay.steps)}.` : "";
    return `Steps averaged ${num(steps.avg)}, short of ${num(steps.goal)}.${low}`;
  }
  if (days.tracked < MIN_TRACKED_IN_WEEK) {
    const closed = days.tracked === 0 ? "No days were" : days.tracked === 1 ? "Only 1 day was" : `Only ${days.tracked} days were`;
    return `${closed} closed out in full. Close out each night so the burn can update.`;
  }
  if (protein.avg !== null && protein.avg < protein.target - 10) {
    const low = protein.lowDay ? ` ${dayName(protein.lowDay.date)} was the low day at ${protein.lowDay.grams} g.` : "";
    return `Protein averaged ${protein.avg} g against ${protein.target}.${low}`;
  }
  if (lifts.missed.length === 1) return `${dayName(lifts.missed[0])}'s workout was missed. Get the next one in.`;
  if (lifts.missed.length > 1) return `${lifts.missed.length} workouts were missed. Get the next one in.`;
  if (lifts.stuck.length > 0) return `${lifts.stuck[0].name} is stuck at ${lifts.stuck[0].top} lb. Pick a plan for it below.`;
  if (desserts.offPlan > desserts.allowance) return `${desserts.offPlan} off-plan desserts against the ${desserts.allowance} allowed.`;
  return "Nothing to fix. Run it back.";
}

/** Rocky's pick, not the radio the person has chosen. */
function callLine(d: CheckInDigest): string {
  const c = d.call;
  const kcal = num(c.calories.kcal);
  if (c.kind === "maintenance") return `Maintenance week next: ${num(c.maintenanceKcal ?? c.burn)} a day, your burn.`;
  if (c.pick === "steps" && c.steps) {
    const walk = num(c.steps.stepGoal);
    return c.hungry ? `You were hungry two Sundays running, so ${COACH_NAME} picks ${walk} steps over less food.` : `Food is at half portions, so ${COACH_NAME} picks ${walk} steps over less food.`;
  }
  if (c.kind === "cut") return `Burn is near ${num(c.burn)}, so calories go to ${kcal} from Monday.`;
  if (c.kind === "raise") return `Faster than ${goal(c.goalLbPerWeek)} lb a week, so calories go up to ${kcal}.`;
  if (c.kind === "on-pace") return c.steadyBy !== null ? `The burn estimate settles by week ${c.steadyBy}, so ${kcal} holds one more week.` : `Right on pace, so ${kcal} holds.`;
  if (c.state === "holding") {
    if (c.holdReason === "week-days") {
      const days = c.trackedDays === 0 ? "No days were" : c.trackedDays === 1 ? "Only 1 day was" : `Only ${c.trackedDays} days were`;
      return `${days} tracked in full, so ${kcal} holds one more week.`;
    }
    if (c.holdReason === "window-days") return `Only ${c.windowTrackedDays} days in the last three weeks were tracked in full, so ${kcal} holds one more week.`;
    if (c.holdReason === "weigh-ins") return `Only ${c.weighIns} weigh-ins in the last three weeks, so ${kcal} holds one more week.`;
    return `Two weeks of weigh-ins come first, so ${kcal} holds.`;
  }
  if (c.guardrail === "fast-loss") return `You lost over ${c.limits.fastLossLb} lb two weeks running, so ${kcal} holds.`;
  if (c.guardrail === "floor") return `${num(c.limits.floor)} is the floor, so it holds.`;
  if (c.guardrail === "half-portions") return `Food is at half portions and steps are at ${num(c.calories.stepGoal)}, so ${kcal} holds.`;
  return `${kcal} holds.`;
}

function lead(change: number | null): string | null {
  if (change === null) return null;
  if (Math.abs(change) < 0.05) return "Trend flat.";
  return `Trend ${change < 0 ? "down" : "up"} ${lb(change)} lb.`;
}

export function ruleTake(d: CheckInDigest): Take {
  const first = lead(d.weight.change);
  const line = callLine(d);
  return { win: win(d), fix: fix(d), call: first ? `${first} ${line}` : line };
}
