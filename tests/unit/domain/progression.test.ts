import { describe, expect, it } from 'vitest';
import { nextSuggestion, restSeconds, withDrop } from '~/domain/progression';

describe('nextSuggestion', () => {
  it('has no suggestion without history', () => {
    expect(nextSuggestion(null, { repMax: 10, increment: 5, deload: false })).toEqual({ weight: null, goUp: false });
  });

  it('goes up when every set hit the top of the range', () => {
    expect(
      nextSuggestion([{ weight: 60, reps: 10 }, { weight: 60, reps: 10 }], { repMax: 10, increment: 5, deload: false }),
    ).toEqual({ weight: 65, goUp: true });
  });

  it('holds when any set fell short', () => {
    expect(
      nextSuggestion([{ weight: 60, reps: 10 }, { weight: 60, reps: 8 }], { repMax: 10, increment: 5, deload: false }),
    ).toEqual({ weight: 60, goUp: false });
  });

  it('uses the leg increment', () => {
    expect(
      nextSuggestion([{ weight: 270, reps: 12 }, { weight: 270, reps: 12 }], { repMax: 12, increment: 10, deload: false }),
    ).toEqual({ weight: 280, goUp: true });
  });

  it('never goes up in a deload week', () => {
    expect(
      nextSuggestion([{ weight: 60, reps: 10 }, { weight: 60, reps: 10 }], { repMax: 10, increment: 5, deload: true }),
    ).toEqual({ weight: 60, goUp: false });
  });

  it('bases the weight on the heaviest set', () => {
    expect(
      nextSuggestion([{ weight: 140, reps: 12 }, { weight: 145, reps: 11 }], { repMax: 12, increment: 5, deload: false }),
    ).toEqual({ weight: 145, goUp: false });
  });

  const top = [{ weight: 270, reps: 12 }, { weight: 270, reps: 12 }];
  const short = [{ weight: 270, reps: 12 }, { weight: 270, reps: 11 }];
  const legs = { repMax: 12, increment: 10, deload: false };

  it('goes up one step after an "about right" or unrated session at the top', () => {
    expect(nextSuggestion(top, legs, 'right')).toEqual({ weight: 280, goUp: true });
    expect(nextSuggestion(top, legs, null)).toEqual({ weight: 280, goUp: true });
  });

  it('goes up two steps after an easy session at the top', () => {
    expect(nextSuggestion(top, legs, 'easy')).toEqual({ weight: 290, goUp: true });
  });

  it('holds after a hard session, even at the top', () => {
    expect(nextSuggestion(top, legs, 'hard')).toEqual({ weight: 270, goUp: false });
  });

  it('holds below the top whatever the feel', () => {
    expect(nextSuggestion(short, legs, 'easy')).toEqual({ weight: 270, goUp: false });
  });

  it('holds in a deload week whatever the feel', () => {
    expect(nextSuggestion(top, { ...legs, deload: true }, 'easy')).toEqual({ weight: 270, goUp: false });
  });
});

describe('restSeconds', () => {
  it('rests longer after compound lifts', () => {
    expect(restSeconds(true)).toBe(150);
    expect(restSeconds(false)).toBe(90);
  });
});

describe('withDrop', () => {
  // Dropped at Sunday Oct 25's check-in, for the first session from Monday Oct 26.
  const drop = { weight: 40, from: '2026-10-26' };
  const up = { weight: 50, goUp: true };

  it('sets the dropped weight for the first session from its Monday', () => {
    expect(withDrop(up, drop, '2026-10-21', '2026-10-28')).toEqual({ weight: 40, goUp: false });
    expect(withDrop(up, drop, null, '2026-10-26')).toEqual({ weight: 40, goUp: false });
  });

  it('is spent once the lift is logged on or after that Monday', () => {
    expect(withDrop(up, drop, '2026-10-26', '2026-10-28')).toBe(up);
    expect(withDrop(up, drop, '2026-11-02', '2026-11-04')).toBe(up);
  });

  it('waits for its Monday, and does nothing without a drop', () => {
    expect(withDrop(up, drop, '2026-10-21', '2026-10-25')).toBe(up);
    expect(withDrop(up, null, '2026-10-21', '2026-10-28')).toBe(up);
  });
});
