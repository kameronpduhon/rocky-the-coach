import { templateFor, type Moves } from "~/domain/calendar";
import { addDays } from "~/domain/dates";
import type { ISODate } from "~/domain/types";
import { plan } from "./index";

export interface ScheduleDay {
  date: ISODate;
  templateId: string | null;
  name: string | null;
  /** Sets are logged that day, so its workout stays put. */
  logged: boolean;
}

export function weekSchedule(monday: ISODate, moves: Moves, setDates: Set<ISODate>): ScheduleDay[] {
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(monday, i);
    const templateId = templateFor(plan, date, moves);
    return { date, templateId, name: templateId ? plan.templates[templateId]!.name : null, logged: setDates.has(date) };
  });
}
