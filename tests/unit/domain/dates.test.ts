import { describe, expect, it } from 'vitest';
import { addDays, daysBetween, localDate, localMinutes, mealDate, weekStart, weekday } from '~/domain/dates';

describe('dates', () => {
  it('gives the Chicago calendar date, not the UTC one', () => {
    // 2026-10-04 03:30 UTC is 2026-10-03 22:30 in Chicago (CDT, UTC-5)
    expect(localDate(new Date('2026-10-04T03:30:00Z'))).toBe('2026-10-03');
  });

  it('gives minutes since local midnight', () => {
    expect(localMinutes(new Date('2026-10-04T03:30:00Z'))).toBe(22 * 60 + 30);
  });

  it('handles the November DST change', () => {
    // 2026-11-02 14:00 UTC is 08:00 CST (UTC-6)
    expect(localMinutes(new Date('2026-11-02T14:00:00Z'))).toBe(8 * 60);
  });

  it('adds days across month ends', () => {
    expect(addDays('2026-10-30', 3)).toBe('2026-11-02');
    expect(addDays('2026-10-05', -1)).toBe('2026-10-04');
  });

  it('counts days between dates', () => {
    expect(daysBetween('2026-10-05', '2026-10-12')).toBe(7);
    expect(daysBetween('2026-10-12', '2026-10-05')).toBe(-7);
  });

  it('knows weekdays and Monday week starts', () => {
    expect(weekday('2026-10-05')).toBe(1);
    expect(weekday('2026-10-11')).toBe(0);
    expect(weekStart('2026-10-11')).toBe('2026-10-05');
    expect(weekStart('2026-10-05')).toBe('2026-10-05');
  });

  it('counts a meal logged before 3am toward the previous day', () => {
    // 2026-10-04 06:30 UTC is 01:30 Chicago on Oct 4
    expect(mealDate(new Date('2026-10-04T06:30:00Z'))).toBe('2026-10-03');
    expect(mealDate(new Date('2026-10-04T13:00:00Z'))).toBe('2026-10-04');
  });
});
