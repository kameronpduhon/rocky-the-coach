import { describe, expect, it } from 'vitest';
import { dayMode, isRelaxedDay, isTrainingDay, setsFor, templateFor, weekNumber, weekType, type PlanCalendar } from '~/domain/calendar';

const plan: PlanCalendar = {
  phaseStart: '2026-10-05',
  weekTypes: { '8': 'deload', '12': 'maintenance', '13': 'checkpoint' },
  relaxedDays: ['2026-11-26', '2026-12-25'],
  training: { '1': 'mon-chest-back-arms', '3': 'wed-legs-shoulders', '5': 'fri-chest-shoulders-arms' },
  optional: { '2': 'optional-arms-back', '4': 'optional-arms-back' },
};

describe('calendar', () => {
  it('numbers weeks from the phase start', () => {
    expect(weekNumber(plan, '2026-10-05')).toBe(1);
    expect(weekNumber(plan, '2026-10-11')).toBe(1);
    expect(weekNumber(plan, '2026-10-12')).toBe(2);
    expect(weekNumber(plan, '2026-11-23')).toBe(8);
    expect(weekNumber(plan, '2026-12-28')).toBe(13);
  });

  it('returns 0 before the phase starts', () => {
    expect(weekNumber(plan, '2026-10-04')).toBe(0);
  });

  it('knows special weeks', () => {
    expect(weekType(plan, '2026-10-12')).toBe('standard');
    expect(weekType(plan, '2026-11-26')).toBe('deload');
    expect(weekType(plan, '2026-12-21')).toBe('maintenance');
    expect(weekType(plan, '2027-01-01')).toBe('checkpoint');
    expect(weekType(plan, '2027-01-04')).toBe('standard');
  });

  it('uses 1 set in deload weeks, 2 otherwise', () => {
    expect(setsFor(plan, '2026-11-23')).toBe(1);
    expect(setsFor(plan, '2026-11-30')).toBe(2);
  });

  it('maps weekdays to templates', () => {
    expect(templateFor(plan, '2026-10-12')).toBe('mon-chest-back-arms');
    expect(templateFor(plan, '2026-10-14')).toBe('wed-legs-shoulders');
    expect(templateFor(plan, '2026-10-13')).toBeNull();
    expect(isTrainingDay(plan, '2026-10-16')).toBe(true);
    expect(isTrainingDay(plan, '2026-10-17')).toBe(false);
  });

  it('sets weekday and weekend modes', () => {
    expect(dayMode('2026-10-16')).toBe('weekday');
    expect(dayMode('2026-10-17')).toBe('weekend');
    expect(dayMode('2026-10-18')).toBe('weekend');
  });

  it('knows relaxed days', () => {
    expect(isRelaxedDay(plan, '2026-11-26')).toBe(true);
    expect(isRelaxedDay(plan, '2026-11-27')).toBe(false);
  });
});
