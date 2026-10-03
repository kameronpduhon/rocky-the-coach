export interface LoggedSet {
  weight: number;
  reps: number;
}

export interface ProgressionRule {
  repMax: number;
  increment: number;
  deload: boolean;
}

export interface Suggestion {
  weight: number | null;
  goUp: boolean;
}

export function nextSuggestion(lastSession: LoggedSet[] | null, rule: ProgressionRule): Suggestion {
  if (!lastSession || lastSession.length === 0) return { weight: null, goUp: false };
  const top = Math.max(...lastSession.map((s) => s.weight));
  const goUp = !rule.deload && lastSession.every((s) => s.reps >= rule.repMax);
  return { weight: goUp ? top + rule.increment : top, goUp };
}

export function restSeconds(compound: boolean): number {
  return compound ? 150 : 90;
}
