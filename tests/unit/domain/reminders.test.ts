import { describe, expect, it } from 'vitest';
import { DEFAULT_REMINDERS, dueReminders, type ReminderFacts } from '~/domain/reminders';

const facts: ReminderFacts = {
  weekday: 1,
  trainingDay: true,
  weighedIn: false,
  loggedSlots: [],
  sessionStarted: false,
  loggedSetToday: false,
  steps: 2000,
  stepGoal: 7500,
  checkInDone: false,
};

const settings = DEFAULT_REMINDERS.map((r) => ({ kind: r.kind, enabled: true, time: r.time }));

describe('dueReminders', () => {
  it('fires the weigh-in reminder in its window', () => {
    expect(dueReminders(7 * 60 + 30, facts, settings, [])).toContain('weigh-in');
    expect(dueReminders(7 * 60 + 55, facts, settings, [])).toContain('weigh-in');
    expect(dueReminders(8 * 60 + 5, facts, settings, [])).not.toContain('weigh-in');
  });

  it('skips reminders already sent today', () => {
    expect(dueReminders(7 * 60 + 35, facts, settings, ['weigh-in'])).not.toContain('weigh-in');
  });

  it('skips reminders whose condition no longer holds', () => {
    expect(dueReminders(7 * 60 + 35, { ...facts, weighedIn: true }, settings, [])).not.toContain('weigh-in');
    expect(dueReminders(14 * 60 + 35, { ...facts, loggedSlots: ['lunch'] }, settings, [])).not.toContain('lunch');
  });

  it('only sends training reminders on training days', () => {
    expect(dueReminders(11 * 60 + 30, facts, settings, [])).toContain('lift');
    expect(dueReminders(11 * 60 + 30, { ...facts, weekday: 2, trainingDay: false }, settings, [])).not.toContain('lift');
    expect(dueReminders(17 * 60, { ...facts, weekday: 2, trainingDay: false }, settings, [])).not.toContain('plan-b');
    expect(dueReminders(17 * 60, facts, settings, [])).toContain('plan-b');
    expect(dueReminders(17 * 60, { ...facts, loggedSetToday: true }, settings, [])).not.toContain('plan-b');
  });

  it('respects disabled reminders and edited times', () => {
    const edited = settings.map((s) => (s.kind === 'weigh-in' ? { ...s, time: '06:45' } : s.kind === 'breakfast' ? { ...s, enabled: false } : s));
    expect(dueReminders(6 * 60 + 50, facts, edited, [])).toContain('weigh-in');
    expect(dueReminders(8 * 60, facts, edited, [])).not.toContain('breakfast');
  });

  it('sends the check-in reminder on Sunday evening only', () => {
    expect(dueReminders(19 * 60, { ...facts, weekday: 0 }, settings, [])).toContain('check-in');
    expect(dueReminders(19 * 60, facts, settings, [])).not.toContain('check-in');
  });

  it('sends the steps nudge only when under 60% of goal', () => {
    expect(dueReminders(18 * 60, facts, settings, [])).toContain('steps');
    expect(dueReminders(18 * 60, { ...facts, steps: 5000 }, settings, [])).not.toContain('steps');
  });
});
