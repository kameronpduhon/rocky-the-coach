import { describe, expect, it } from 'vitest';
import { sevenDayAverage, weeklyChange } from '~/domain/weight';

const weighIns = [
  { date: '2026-10-05', weight: 207.0 },
  { date: '2026-10-06', weight: 206.2 },
  { date: '2026-10-07', weight: 206.8 },
  { date: '2026-10-08', weight: 205.9 },
  { date: '2026-10-09', weight: 206.4 },
  { date: '2026-10-10', weight: 205.6 },
  { date: '2026-10-11', weight: 206.0 },
  { date: '2026-10-12', weight: 205.2 },
];

describe('sevenDayAverage', () => {
  it('averages the 7 days ending on the date, to one decimal', () => {
    // Oct 5 to 11: 1443.9 / 7 = 206.27
    expect(sevenDayAverage(weighIns, '2026-10-11')).toBe(206.3);
    // Oct 6 to 12: 1442.1 / 7 = 206.01
    expect(sevenDayAverage(weighIns, '2026-10-12')).toBe(206.0);
  });

  it('needs at least 3 weigh-ins in the window', () => {
    expect(sevenDayAverage(weighIns.slice(0, 2), '2026-10-06')).toBeNull();
    expect(sevenDayAverage(weighIns.slice(0, 3), '2026-10-07')).toBe(206.7);
  });
});

describe('weeklyChange', () => {
  it('subtracts and rounds to one decimal, null when either side is missing', () => {
    expect(weeklyChange(205.2, 206.1)).toBe(-0.9);
    expect(weeklyChange(null, 206.1)).toBeNull();
  });
});
