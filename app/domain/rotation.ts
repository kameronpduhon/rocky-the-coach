import { dayMode } from './calendar';
import { addDays, daysBetween } from './dates';
import { SLOTS, slotPool, type ISODate, type Mode, type Pool, type Slot } from './types';

export interface RotationMeal {
  slug: string;
  pool: Pool;
  mode: Mode;
  tags: string[];
}

export interface RotationInput {
  weekStart: ISODate;
  meals: RotationMeal[];
  /** slug -> last date it was eaten */
  lastEaten: Record<string, ISODate>;
  rested: string[];
}

export interface PlannedMeal {
  date: ISODate;
  slot: Slot;
  slug: string;
}

const WEEKLY_CAP = 2;
const GROUND_BEEF_CAP = 1;

function seededOrder(slugs: string[], seed: string): Map<string, number> {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  let state = h >>> 0;
  const rand = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const shuffled = [...slugs].sort();
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return new Map(shuffled.map((s, i) => [s, i]));
}

export function generateWeek(input: RotationInput): PlannedMeal[] {
  const rested = new Set(input.rested);
  const tieBreak = seededOrder(input.meals.map((m) => m.slug), input.weekStart);
  const lastSeen: Record<string, ISODate> = { ...input.lastEaten };
  const weekCount = new Map<string, number>();
  let groundBeef = 0;
  const yesterdayByPool = new Map<Pool, Set<string>>();
  const plan: PlannedMeal[] = [];

  for (let d = 0; d < 7; d++) {
    const date = addDays(input.weekStart, d);
    const mode = dayMode(date);
    const todayByPool = new Map<Pool, Set<string>>();

    for (const slot of SLOTS) {
      const pool = slotPool(slot);
      const usedToday = todayByPool.get(pool) ?? new Set<string>();
      const usedYesterday = yesterdayByPool.get(pool) ?? new Set<string>();

      const hard = input.meals.filter(
        (m) =>
          m.pool === pool &&
          (m.mode === 'any' || m.mode === mode || mode === 'weekend') &&
          !rested.has(m.slug) &&
          !usedToday.has(m.slug) &&
          !(m.tags.includes('ground-beef') && groundBeef >= GROUND_BEEF_CAP),
      );
      const underCap = (m: RotationMeal) => (weekCount.get(m.slug) ?? 0) < WEEKLY_CAP;
      const notYesterday = (m: RotationMeal) => !usedYesterday.has(m.slug);

      const tiers = [hard.filter((m) => underCap(m) && notYesterday(m)), hard.filter(notYesterday), hard];
      const candidates = tiers.find((t) => t.length > 0);
      if (!candidates) throw new Error(`No meal available for ${slot} on ${date}`);

      const score = (m: RotationMeal) => {
        const seen = lastSeen[m.slug];
        return seen ? daysBetween(seen, date) : 999;
      };
      const pick = [...candidates].sort(
        (a, b) => score(b) - score(a) || tieBreak.get(a.slug)! - tieBreak.get(b.slug)!,
      )[0];

      plan.push({ date, slot, slug: pick.slug });
      usedToday.add(pick.slug);
      todayByPool.set(pool, usedToday);
      weekCount.set(pick.slug, (weekCount.get(pick.slug) ?? 0) + 1);
      lastSeen[pick.slug] = date;
      if (pick.tags.includes('ground-beef')) groundBeef++;
    }
    for (const [pool, used] of todayByPool) yesterdayByPool.set(pool, used);
  }
  return plan;
}
