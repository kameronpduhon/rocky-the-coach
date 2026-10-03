import { describe, expect, it } from 'vitest';
import { nextSuggestion, restSeconds } from '~/domain/progression';

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
});

describe('restSeconds', () => {
  it('rests longer after compound lifts', () => {
    expect(restSeconds(true)).toBe(150);
    expect(restSeconds(false)).toBe(90);
  });
});
