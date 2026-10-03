import { parseTime } from './dates';
import type { Slot } from './types';

export type ReminderKind =
  | 'weigh-in'
  | 'breakfast'
  | 'lift'
  | 'lunch'
  | 'snack'
  | 'plan-b'
  | 'steps'
  | 'dinner'
  | 'kitchen-closed'
  | 'check-in';

export interface ReminderFacts {
  /** 0 = Sunday */
  weekday: number;
  weighedIn: boolean;
  loggedSlots: Slot[];
  sessionStarted: boolean;
  loggedSetToday: boolean;
  steps: number;
  stepGoal: number;
  checkInDone: boolean;
}

interface ReminderDef {
  kind: ReminderKind;
  time: string;
  days: number[];
  when: (f: ReminderFacts) => boolean;
  title: string;
  body: string;
}

const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];
const TRAINING = [1, 3, 5];

export const DEFAULT_REMINDERS: ReminderDef[] = [
  { kind: 'weigh-in', time: '07:30', days: EVERY_DAY, when: (f) => !f.weighedIn, title: 'Weigh-in', body: 'Step on the scale. Five seconds.' },
  { kind: 'breakfast', time: '08:00', days: EVERY_DAY, when: (f) => !f.loggedSlots.includes('breakfast'), title: 'Breakfast', body: 'Breakfast is on the plan. Log it when you eat.' },
  { kind: 'lift', time: '11:30', days: TRAINING, when: (f) => !f.sessionStarted, title: 'Lift at noon', body: "Today's session is ready. 45 minutes." },
  { kind: 'lunch', time: '14:30', days: EVERY_DAY, when: (f) => !f.loggedSlots.includes('lunch'), title: 'Lunch', body: 'Lunch time. Your scale amounts are ready.' },
  { kind: 'snack', time: '15:45', days: EVERY_DAY, when: (f) => !f.loggedSlots.includes('snack'), title: 'Snack', body: 'Planned snack, nothing else until dinner.' },
  { kind: 'plan-b', time: '17:00', days: TRAINING, when: (f) => !f.loggedSetToday, title: 'Plan B tonight', body: 'Missed the gym? 25 minutes at home still counts.' },
  { kind: 'steps', time: '18:00', days: EVERY_DAY, when: (f) => f.steps < 0.6 * f.stepGoal, title: 'Steps', body: 'Two 15-minute walks gets you there.' },
  { kind: 'dinner', time: '19:00', days: EVERY_DAY, when: (f) => !f.loggedSlots.includes('dinner'), title: 'Dinner', body: 'Dinner is on the plan. Log it when you eat.' },
  { kind: 'kitchen-closed', time: '20:30', days: EVERY_DAY, when: () => true, title: "Kitchen's closed", body: 'Dessert is done. See you at breakfast.' },
  { kind: 'check-in', time: '19:00', days: [0], when: (f) => !f.checkInDone, title: 'Sunday check-in', body: 'Ten minutes to set up next week.' },
];

const WINDOW_MINUTES = 30;

export interface ReminderSetting {
  kind: ReminderKind;
  enabled: boolean;
  time: string;
}

export function reminderDef(kind: ReminderKind): ReminderDef {
  const def = DEFAULT_REMINDERS.find((r) => r.kind === kind);
  if (!def) throw new Error(`Unknown reminder: ${kind}`);
  return def;
}

export function dueReminders(
  minutes: number,
  facts: ReminderFacts,
  settings: ReminderSetting[],
  sentToday: ReminderKind[],
): ReminderKind[] {
  const due: ReminderKind[] = [];
  for (const def of DEFAULT_REMINDERS) {
    const setting = settings.find((s) => s.kind === def.kind);
    if (setting && !setting.enabled) continue;
    const at = parseTime(setting?.time ?? def.time);
    if (minutes < at || minutes >= at + WINDOW_MINUTES) continue;
    if (!def.days.includes(facts.weekday)) continue;
    if (sentToday.includes(def.kind)) continue;
    if (!def.when(facts)) continue;
    due.push(def.kind);
  }
  return due;
}
