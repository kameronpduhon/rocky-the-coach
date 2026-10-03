# M2: Domain Rules Implementation Plan

> **For agentic workers:** implement this plan task-by-task with the `executing-plans` skill. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Encode every rule in `docs/spec.md` "Domain rules" as pure, unit-tested TypeScript modules under `app/domain/`.

**Architecture:** No I/O in this layer. Every function takes plain data and returns plain data, so the UI, the cron, and the check-in all share one tested source of truth. Dates are `YYYY-MM-DD` strings in America/Chicago; only `dates.ts` touches `Intl`.

**Tech Stack:** TypeScript, Vitest (configured in M1).

**Prerequisite:** M1 complete (repo scaffolded, `npm test` runs the `unit` and `workers` Vitest projects). Every test in this plan lives under `tests/unit/`, which runs in Node.

---

## File map

| File | Responsibility |
|---|---|
| `app/domain/types.ts` | Shared domain types |
| `app/domain/dates.ts` | Timezone-aware "today", minutes of day, date math |
| `app/domain/calendar.ts` | Phase week number, week type, training template, mode, sets |
| `app/domain/macros.ts` | Meal macros, portion scaling, batch split |
| `app/domain/rotation.ts` | Weekly meal plan generation |
| `app/domain/progression.ts` | Next-session weight suggestion, rest timer |
| `app/domain/adherence.ts` | On plan, streak, weekly adherence |
| `app/domain/weight.ts` | 7-day average, weekly change |
| `app/domain/adjustments.ts` | Check-in adjustment rules |
| `app/domain/steps.ts` | Step goal ramp |
| `app/domain/messages.ts` | Rocky message situation and variant pick |
| `app/domain/reminders.ts` | Which reminders are due |
| `app/domain/groceries.ts` | Grocery list aggregation |
| `tests/unit/domain/*.test.ts` | One test file per module |

---

### Task 1: Types and dates

**Files:**
- Create: `app/domain/types.ts`
- Create: `app/domain/dates.ts`
- Test: `tests/unit/domain/dates.test.ts`

- [ ] **Step 1: Write the types**

```ts
// app/domain/types.ts
export type ISODate = string;

export type Slot = 'breakfast' | 'lunch' | 'snack' | 'dinner' | 'dessert';
export const SLOTS: Slot[] = ['breakfast', 'lunch', 'snack', 'dinner', 'dessert'];

export type Pool = 'breakfast' | 'main' | 'snack' | 'dessert';
export type Mode = 'weekday' | 'weekend' | 'any';
export type DayMode = 'weekday' | 'weekend';
export type WeekType = 'standard' | 'deload' | 'maintenance' | 'checkpoint';

export function slotPool(slot: Slot): Pool {
  if (slot === 'lunch' || slot === 'dinner') return 'main';
  return slot;
}
```

- [ ] **Step 2: Write the failing test**

```ts
// tests/unit/domain/dates.test.ts
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
```

- [ ] **Step 3: Run it to make sure it fails**

Run: `npx vitest run tests/unit/domain/dates.test.ts`
Expected: FAIL, cannot resolve `~/domain/dates`.

- [ ] **Step 4: Implement**

```ts
// app/domain/dates.ts
import type { ISODate } from './types';

export const TZ = 'America/Chicago';

function parts(now: Date, tz: string) {
  const out: Record<string, string> = {};
  for (const p of new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now)) {
    out[p.type] = p.value;
  }
  return out;
}

export function localDate(now: Date = new Date(), tz: string = TZ): ISODate {
  const p = parts(now, tz);
  return `${p.year}-${p.month}-${p.day}`;
}

export function localMinutes(now: Date = new Date(), tz: string = TZ): number {
  const p = parts(now, tz);
  return Number(p.hour) * 60 + Number(p.minute);
}

function toUTC(d: ISODate): number {
  const [y, m, day] = d.split('-').map(Number);
  return Date.UTC(y, m - 1, day);
}

export function addDays(d: ISODate, n: number): ISODate {
  return new Date(toUTC(d) + n * 86_400_000).toISOString().slice(0, 10);
}

export function daysBetween(a: ISODate, b: ISODate): number {
  return Math.round((toUTC(b) - toUTC(a)) / 86_400_000);
}

/** 0 = Sunday ... 6 = Saturday */
export function weekday(d: ISODate): number {
  return new Date(toUTC(d)).getUTCDay();
}

export function weekStart(d: ISODate): ISODate {
  return addDays(d, -((weekday(d) + 6) % 7));
}

/** Late-night logging (before 3am) belongs to the previous day. */
export function mealDate(now: Date = new Date(), tz: string = TZ): ISODate {
  const today = localDate(now, tz);
  return localMinutes(now, tz) < 180 ? addDays(today, -1) : today;
}

export function formatTime(minutes: number): string {
  const h24 = Math.floor(minutes / 60);
  const m = minutes % 60;
  const suffix = h24 >= 12 ? 'pm' : 'am';
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return m === 0 ? `${h}${suffix}` : `${h}:${String(m).padStart(2, '0')}${suffix}`;
}

export function parseTime(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}
```

- [ ] **Step 5: Run the test and make sure it passes**

Run: `npx vitest run tests/unit/domain/dates.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 6: Commit**

```bash
git add app/domain/types.ts app/domain/dates.ts tests/unit/domain/dates.test.ts
git commit -m "Add domain types and timezone-aware date helpers"
```

---

### Task 2: Calendar

**Files:**
- Create: `app/domain/calendar.ts`
- Test: `tests/unit/domain/calendar.test.ts`

The plan config shape is the `plan` section of `content/plan.json` (created in M1, Task 6). The type lives here so the domain owns it.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/domain/calendar.test.ts
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
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run tests/unit/domain/calendar.test.ts`
Expected: FAIL, cannot resolve `~/domain/calendar`.

- [ ] **Step 3: Implement**

```ts
// app/domain/calendar.ts
import { daysBetween, weekday } from './dates';
import type { DayMode, ISODate, WeekType } from './types';

export interface PlanCalendar {
  phaseStart: ISODate;
  /** Week number (as a string key) to its special type. Missing weeks are standard. */
  weekTypes: Record<string, WeekType>;
  relaxedDays: ISODate[];
  /** Weekday number (0 = Sunday) to template id. */
  training: Record<string, string>;
  optional: Record<string, string>;
}

export function weekNumber(plan: PlanCalendar, date: ISODate): number {
  const days = daysBetween(plan.phaseStart, date);
  if (days < 0) return 0;
  return Math.floor(days / 7) + 1;
}

export function weekType(plan: PlanCalendar, date: ISODate): WeekType {
  return plan.weekTypes[String(weekNumber(plan, date))] ?? 'standard';
}

export function setsFor(plan: PlanCalendar, date: ISODate): 1 | 2 {
  return weekType(plan, date) === 'deload' ? 1 : 2;
}

export function templateFor(plan: PlanCalendar, date: ISODate): string | null {
  return plan.training[String(weekday(date))] ?? null;
}

export function optionalTemplateFor(plan: PlanCalendar, date: ISODate): string | null {
  return plan.optional[String(weekday(date))] ?? null;
}

export function isTrainingDay(plan: PlanCalendar, date: ISODate): boolean {
  return templateFor(plan, date) !== null;
}

export function dayMode(date: ISODate): DayMode {
  const d = weekday(date);
  return d === 0 || d === 6 ? 'weekend' : 'weekday';
}

export function isRelaxedDay(plan: PlanCalendar, date: ISODate): boolean {
  return plan.relaxedDays.includes(date);
}
```

- [ ] **Step 4: Run the test and make sure it passes**

Run: `npx vitest run tests/unit/domain/calendar.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add app/domain/calendar.ts tests/unit/domain/calendar.test.ts
git commit -m "Add phase calendar rules"
```

---

### Task 3: Macros, scaling, batch split

**Files:**
- Create: `app/domain/macros.ts`
- Test: `tests/unit/domain/macros.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/domain/macros.test.ts
import { describe, expect, it } from 'vitest';
import { batchPortion, mealMacros, scaleGrams, type FoodMacros } from '~/domain/macros';

const foods = new Map<string, FoodMacros>([
  ['chicken-breast-raw', { kcalPer100: 120, proteinPer100: 22.5 }],
  ['white-rice-cooked', { kcalPer100: 130, proteinPer100: 2.7 }],
  ['butter', { kcalPer100: 717, proteinPer100: 0.9 }],
  ['pineapple-raw', { kcalPer100: 50, proteinPer100: 0.5 }],
]);

describe('mealMacros', () => {
  it('sums ingredients and rounds kcal to 5 and protein to 1', () => {
    const m = mealMacros(
      [
        { foodId: 'chicken-breast-raw', grams: 220 },
        { foodId: 'white-rice-cooked', grams: 200 },
        { foodId: 'butter', grams: 10 },
        { foodId: 'pineapple-raw', grams: 100 },
      ],
      foods,
    );
    // 264 + 260 + 71.7 + 50 = 645.7 -> 645 ; 49.5 + 5.4 + 0.09 + 0.5 = 55.49 -> 55
    expect(m).toEqual({ kcal: 645, protein: 55 });
  });

  it('throws on an unknown food so content mistakes fail loudly', () => {
    expect(() => mealMacros([{ foodId: 'nope', grams: 10 }], foods)).toThrow(/Unknown food: nope/);
  });
});

describe('scaleGrams', () => {
  it('multiplies and rounds to 5 g at 20 g and above', () => {
    expect(scaleGrams(220, 3)).toBe(660);
    expect(scaleGrams(150, 2)).toBe(300);
    expect(scaleGrams(37, 1)).toBe(35);
  });

  it('rounds to 1 g under 20 g', () => {
    expect(scaleGrams(10, 1)).toBe(10);
    expect(scaleGrams(6, 3)).toBe(18);
  });
});

describe('batchPortion', () => {
  it('splits a cooked batch and rounds to 5 g', () => {
    expect(batchPortion(492, 3)).toBe(165);
    expect(batchPortion(500, 2)).toBe(250);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run tests/unit/domain/macros.test.ts`
Expected: FAIL, cannot resolve `~/domain/macros`. (M1 Task 5 already created `app/domain/macros.ts` with exactly the code below so the content loader compiles. If the file exists, this test passes immediately; confirm it matches Step 3 and move on.)

- [ ] **Step 3: Implement**

```ts
// app/domain/macros.ts
export interface FoodMacros {
  kcalPer100: number;
  proteinPer100: number;
}

export interface IngredientAmount {
  foodId: string;
  grams: number;
}

export interface Macros {
  kcal: number;
  protein: number;
}

export function mealMacros(ingredients: IngredientAmount[], foods: Map<string, FoodMacros>): Macros {
  let kcal = 0;
  let protein = 0;
  for (const ing of ingredients) {
    const food = foods.get(ing.foodId);
    if (!food) throw new Error(`Unknown food: ${ing.foodId}`);
    kcal += (ing.grams / 100) * food.kcalPer100;
    protein += (ing.grams / 100) * food.proteinPer100;
  }
  return { kcal: Math.round(kcal / 5) * 5, protein: Math.round(protein) };
}

export function scaleGrams(gramsPerPortion: number, portions: number): number {
  const total = gramsPerPortion * portions;
  return total < 20 ? Math.round(total) : Math.round(total / 5) * 5;
}

export function batchPortion(cookedWeightG: number, portions: number): number {
  return Math.round(cookedWeightG / portions / 5) * 5;
}
```

- [ ] **Step 4: Run the test and make sure it passes**

Run: `npx vitest run tests/unit/domain/macros.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add app/domain/macros.ts tests/unit/domain/macros.test.ts
git commit -m "Add meal macro, scaling, and batch split rules"
```

---

### Task 4: Meal rotation

**Files:**
- Create: `app/domain/rotation.ts`
- Test: `tests/unit/domain/rotation.test.ts`

Rules (spec, "Meal rotation"): candidates by pool and mode, rested meals and the ground beef weekly limit are never violated; any meal at most twice a week and no repeat on consecutive days in the same pool are relaxed in that order when nothing fits; lunch and dinner differ on the same day; least recently eaten wins; ties break by a shuffle seeded from the week start.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/domain/rotation.test.ts
import { describe, expect, it } from 'vitest';
import { generateWeek, type RotationMeal } from '~/domain/rotation';

const meals: RotationMeal[] = [
  { slug: 'steak-and-eggs', pool: 'breakfast', mode: 'any', tags: [] },
  { slug: 'yogurt-bowl', pool: 'breakfast', mode: 'any', tags: [] },
  { slug: 'egg-hash', pool: 'breakfast', mode: 'any', tags: [] },
  { slug: 'pancakes', pool: 'breakfast', mode: 'any', tags: [] },
  { slug: 'chicken-rice', pool: 'main', mode: 'any', tags: [] },
  { slug: 'steak-potato', pool: 'main', mode: 'any', tags: [] },
  { slug: 'shrimp-rice', pool: 'main', mode: 'any', tags: [] },
  { slug: 'cod-potatoes', pool: 'main', mode: 'any', tags: [] },
  { slug: 'honey-thighs', pool: 'main', mode: 'any', tags: [] },
  { slug: 'steak-egg-bowl', pool: 'main', mode: 'any', tags: [] },
  { slug: 'salmon-rice', pool: 'main', mode: 'any', tags: [] },
  { slug: 'burger-bowl', pool: 'main', mode: 'any', tags: ['ground-beef'] },
  { slug: 'fajita-bowl', pool: 'main', mode: 'weekend', tags: [] },
  { slug: 'steak-salad', pool: 'main', mode: 'weekend', tags: [] },
  { slug: 'yogurt-berries', pool: 'snack', mode: 'any', tags: [] },
  { slug: 'cottage-pineapple', pool: 'snack', mode: 'any', tags: [] },
  { slug: 'shake', pool: 'snack', mode: 'any', tags: [] },
  { slug: 'shrimp-cocktail', pool: 'snack', mode: 'any', tags: [] },
  { slug: 'eggs-fruit', pool: 'snack', mode: 'any', tags: [] },
  { slug: 'protein-ice-cream', pool: 'dessert', mode: 'any', tags: [] },
  { slug: 'yogurt-honey', pool: 'dessert', mode: 'any', tags: [] },
  { slug: 'nice-cream', pool: 'dessert', mode: 'any', tags: [] },
  { slug: 'berries-cream', pool: 'dessert', mode: 'any', tags: [] },
  { slug: 'baked-apple', pool: 'dessert', mode: 'any', tags: [] },
];

const base = { weekStart: '2026-10-12', meals, lastEaten: {}, rested: [] as string[] };

describe('generateWeek', () => {
  it('plans 5 slots for 7 days', () => {
    const plan = generateWeek(base);
    expect(plan).toHaveLength(35);
    expect(plan[0]).toMatchObject({ date: '2026-10-12', slot: 'breakfast' });
    expect(plan[34]).toMatchObject({ date: '2026-10-18', slot: 'dessert' });
  });

  it('is deterministic for the same input', () => {
    expect(generateWeek(base)).toEqual(generateWeek(base));
  });

  it('never plans weekend-only meals on weekdays', () => {
    const plan = generateWeek(base);
    const weekdayPicks = plan.filter((p) => p.date < '2026-10-17').map((p) => p.slug);
    expect(weekdayPicks).not.toContain('fajita-bowl');
    expect(weekdayPicks).not.toContain('steak-salad');
  });

  it('never plans rested meals', () => {
    const plan = generateWeek({ ...base, rested: ['chicken-rice'] });
    expect(plan.map((p) => p.slug)).not.toContain('chicken-rice');
  });

  it('plans ground beef at most once a week', () => {
    const plan = generateWeek(base);
    expect(plan.filter((p) => p.slug === 'burger-bowl').length).toBeLessThanOrEqual(1);
  });

  it('caps every meal at twice a week when the pool allows it', () => {
    const plan = generateWeek(base);
    const counts = new Map<string, number>();
    for (const p of plan) counts.set(p.slug, (counts.get(p.slug) ?? 0) + 1);
    for (const [, n] of counts) expect(n).toBeLessThanOrEqual(2);
  });

  it('never repeats a meal on consecutive days in the same pool when the pool allows it', () => {
    const plan = generateWeek(base);
    const byDate = new Map<string, string[]>();
    for (const p of plan) byDate.set(p.date, [...(byDate.get(p.date) ?? []), p.slug]);
    const dates = [...byDate.keys()];
    for (let i = 1; i < dates.length; i++) {
      const today = new Set(byDate.get(dates[i]));
      for (const slug of byDate.get(dates[i - 1])!) expect(today.has(slug)).toBe(false);
    }
  });

  it('serves different lunch and dinner on the same day', () => {
    const plan = generateWeek(base);
    for (let d = 0; d < 7; d++) {
      const day = plan.slice(d * 5, d * 5 + 5);
      const lunch = day.find((p) => p.slot === 'lunch')!.slug;
      const dinner = day.find((p) => p.slot === 'dinner')!.slug;
      expect(lunch).not.toBe(dinner);
    }
  });

  it('prefers meals not eaten recently', () => {
    const lastEaten = {
      'steak-and-eggs': '2026-10-11',
      'yogurt-bowl': '2026-10-10',
      'egg-hash': '2026-10-09',
    };
    const plan = generateWeek({ ...base, lastEaten });
    expect(plan[0].slug).toBe('pancakes');
  });

  it('relaxes the weekly cap before giving up when the pool is tiny', () => {
    const tiny = meals.filter((m) => m.pool !== 'breakfast').concat([
      { slug: 'only-a', pool: 'breakfast', mode: 'any', tags: [] },
      { slug: 'only-b', pool: 'breakfast', mode: 'any', tags: [] },
    ]);
    const plan = generateWeek({ ...base, meals: tiny });
    const breakfasts = plan.filter((p) => p.slot === 'breakfast').map((p) => p.slug);
    expect(breakfasts).toHaveLength(7);
    for (let i = 1; i < 7; i++) expect(breakfasts[i]).not.toBe(breakfasts[i - 1]);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run tests/unit/domain/rotation.test.ts`
Expected: FAIL, cannot resolve `~/domain/rotation`.

- [ ] **Step 3: Implement**

```ts
// app/domain/rotation.ts
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
          (m.mode === 'any' || m.mode === mode) &&
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
```

- [ ] **Step 4: Run the test and make sure it passes**

Run: `npx vitest run tests/unit/domain/rotation.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add app/domain/rotation.ts tests/unit/domain/rotation.test.ts
git commit -m "Add weekly meal rotation"
```

---

### Task 5: Workout progression

**Files:**
- Create: `app/domain/progression.ts`
- Test: `tests/unit/domain/progression.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/domain/progression.test.ts
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
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run tests/unit/domain/progression.test.ts`
Expected: FAIL, cannot resolve `~/domain/progression`.

- [ ] **Step 3: Implement**

```ts
// app/domain/progression.ts
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
```

- [ ] **Step 4: Run the test and make sure it passes**

Run: `npx vitest run tests/unit/domain/progression.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add app/domain/progression.ts tests/unit/domain/progression.test.ts
git commit -m "Add workout progression rules"
```

---

### Task 6: On plan, streak, adherence

**Files:**
- Create: `app/domain/adherence.ts`
- Test: `tests/unit/domain/adherence.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/domain/adherence.test.ts
import { describe, expect, it } from 'vitest';
import { isOnPlan, streak, weekAdherence, weekIsOnPlan, type DayFacts } from '~/domain/adherence';

const good: DayFacts = { proteinG: 185, steps: 8000, offPlanDessert: false, relaxedDay: false, proteinTarget: 180, stepGoal: 7500 };

describe('isOnPlan', () => {
  it('needs protein, steps, and no off-plan dessert', () => {
    expect(isOnPlan(good)).toBe(true);
    expect(isOnPlan({ ...good, proteinG: 150 })).toBe(false);
    expect(isOnPlan({ ...good, steps: 7000 })).toBe(false);
    expect(isOnPlan({ ...good, steps: null })).toBe(false);
    expect(isOnPlan({ ...good, offPlanDessert: true })).toBe(false);
  });

  it('always counts relaxed days', () => {
    expect(isOnPlan({ ...good, proteinG: 0, steps: 0, offPlanDessert: true, relaxedDay: true })).toBe(true);
  });
});

describe('streak', () => {
  it('counts consecutive on-plan days ending yesterday', () => {
    const history = [
      { date: '2026-10-08', onPlan: false },
      { date: '2026-10-09', onPlan: true },
      { date: '2026-10-10', onPlan: true },
      { date: '2026-10-11', onPlan: true },
    ];
    expect(streak(history, '2026-10-12', false)).toBe(3);
  });

  it('adds today once today is on plan', () => {
    expect(streak([{ date: '2026-10-11', onPlan: true }], '2026-10-12', true)).toBe(2);
  });

  it('is zero when yesterday broke it', () => {
    expect(streak([{ date: '2026-10-10', onPlan: true }, { date: '2026-10-11', onPlan: false }], '2026-10-12', false)).toBe(0);
  });

  it('stops at a gap in history', () => {
    expect(streak([{ date: '2026-10-09', onPlan: true }, { date: '2026-10-11', onPlan: true }], '2026-10-12', false)).toBe(1);
  });
});

describe('weekAdherence', () => {
  it('counts on-plan days and calls 6 of 7 on plan', () => {
    const days = [true, true, true, true, true, true, false];
    expect(weekAdherence(days)).toBe(6);
    expect(weekIsOnPlan(6)).toBe(true);
    expect(weekIsOnPlan(5)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run tests/unit/domain/adherence.test.ts`
Expected: FAIL, cannot resolve `~/domain/adherence`.

- [ ] **Step 3: Implement**

```ts
// app/domain/adherence.ts
import { addDays } from './dates';
import type { ISODate } from './types';

export interface DayFacts {
  proteinG: number;
  steps: number | null;
  offPlanDessert: boolean;
  relaxedDay: boolean;
  proteinTarget: number;
  stepGoal: number;
}

export function isOnPlan(f: DayFacts): boolean {
  if (f.relaxedDay) return true;
  return f.proteinG >= f.proteinTarget && (f.steps ?? 0) >= f.stepGoal && !f.offPlanDessert;
}

export function streak(history: { date: ISODate; onPlan: boolean }[], today: ISODate, todayOnPlan: boolean): number {
  const byDate = new Map(history.map((h) => [h.date, h.onPlan]));
  let count = 0;
  let d = addDays(today, -1);
  while (byDate.get(d) === true) {
    count++;
    d = addDays(d, -1);
  }
  return count + (todayOnPlan ? 1 : 0);
}

export function weekAdherence(days: boolean[]): number {
  return days.filter(Boolean).length;
}

export function weekIsOnPlan(onPlanDays: number): boolean {
  return onPlanDays >= 6;
}
```

- [ ] **Step 4: Run the test and make sure it passes**

Run: `npx vitest run tests/unit/domain/adherence.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add app/domain/adherence.ts tests/unit/domain/adherence.test.ts
git commit -m "Add on-plan, streak, and adherence rules"
```

---

### Task 7: Weight trend

**Files:**
- Create: `app/domain/weight.ts`
- Test: `tests/unit/domain/weight.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/domain/weight.test.ts
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
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run tests/unit/domain/weight.test.ts`
Expected: FAIL, cannot resolve `~/domain/weight`.

- [ ] **Step 3: Implement**

```ts
// app/domain/weight.ts
import { addDays } from './dates';
import type { ISODate } from './types';

const round1 = (n: number) => Math.round(n * 10) / 10;

export function sevenDayAverage(weighIns: { date: ISODate; weight: number }[], date: ISODate): number | null {
  const from = addDays(date, -6);
  const window = weighIns.filter((w) => w.date >= from && w.date <= date);
  if (window.length < 3) return null;
  return round1(window.reduce((sum, w) => sum + w.weight, 0) / window.length);
}

export function weeklyChange(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null) return null;
  return round1(current - previous);
}
```

- [ ] **Step 4: Run the test and make sure it passes**

Run: `npx vitest run tests/unit/domain/weight.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add app/domain/weight.ts tests/unit/domain/weight.test.ts
git commit -m "Add weight trend rules"
```

---

### Task 8: Adjustment rules and step ramp

**Files:**
- Create: `app/domain/adjustments.ts`
- Create: `app/domain/steps.ts`
- Test: `tests/unit/domain/adjustments.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/domain/adjustments.test.ts
import { describe, expect, it } from 'vitest';
import { decideAdjustment } from '~/domain/adjustments';
import { rampStepGoal } from '~/domain/steps';

const current = { kcal: 2400, stepGoal: 8000 };

describe('decideAdjustment', () => {
  it('waits for two weeks of data', () => {
    expect(decideAdjustment([{ change: -1, onPlan: true }], current)).toEqual({ kind: 'too-early' });
    expect(decideAdjustment([{ change: null, onPlan: true }, { change: -1, onPlan: true }], current)).toEqual({ kind: 'too-early' });
  });

  it('holds numbers when the last week was off plan', () => {
    expect(decideAdjustment([{ change: -0.2, onPlan: true }, { change: 0.1, onPlan: false }], current)).toEqual({ kind: 'tighten-up' });
  });

  it('offers a cut or more steps after two slow weeks on plan', () => {
    expect(decideAdjustment([{ change: -0.3, onPlan: true }, { change: 0, onPlan: true }], current)).toEqual({
      kind: 'slow',
      newKcal: 2250,
      newStepGoal: 9000,
    });
  });

  it('never cuts below 2,000 and stops offering steps at the 10,000 cap', () => {
    expect(decideAdjustment([{ change: 0, onPlan: true }, { change: 0, onPlan: true }], { kcal: 2100, stepGoal: 10000 })).toEqual({
      kind: 'slow',
      newKcal: 2000,
      newStepGoal: null,
    });
  });

  it('adds food after two fast weeks', () => {
    expect(decideAdjustment([{ change: -2.4, onPlan: true }, { change: -2.1, onPlan: true }], current)).toEqual({ kind: 'fast', newKcal: 2550 });
  });

  it('is on pace otherwise', () => {
    expect(decideAdjustment([{ change: -1.0, onPlan: true }, { change: -0.9, onPlan: true }], current)).toEqual({ kind: 'on-pace' });
  });
});

describe('rampStepGoal', () => {
  it('adds 500 when the week averaged at or above the goal', () => {
    expect(rampStepGoal(7500, 7640)).toBe(8000);
  });

  it('holds when the goal was missed', () => {
    expect(rampStepGoal(7500, 7100)).toBe(7500);
  });

  it('caps at 10,000', () => {
    expect(rampStepGoal(9800, 10200)).toBe(10000);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run tests/unit/domain/adjustments.test.ts`
Expected: FAIL, cannot resolve `~/domain/adjustments`.

- [ ] **Step 3: Implement both modules**

```ts
// app/domain/steps.ts
export const STEP_CAP = 10_000;

export function rampStepGoal(goal: number, weekAverage: number): number {
  return weekAverage >= goal ? Math.min(goal + 500, STEP_CAP) : goal;
}
```

```ts
// app/domain/adjustments.ts
import { STEP_CAP } from './steps';

export interface WeekResult {
  /** Weekly change in the 7-day average, negative is a loss. */
  change: number | null;
  onPlan: boolean;
}

export type Adjustment =
  | { kind: 'too-early' }
  | { kind: 'tighten-up' }
  | { kind: 'slow'; newKcal: number; newStepGoal: number | null }
  | { kind: 'fast'; newKcal: number }
  | { kind: 'on-pace' };

const KCAL_FLOOR = 2000;

/** weeks: oldest first; only the last two are used. */
export function decideAdjustment(weeks: WeekResult[], current: { kcal: number; stepGoal: number }): Adjustment {
  const lastTwo = weeks.slice(-2);
  if (lastTwo.length < 2 || lastTwo.some((w) => w.change === null)) return { kind: 'too-early' };
  const [prev, last] = lastTwo as [WeekResult & { change: number }, WeekResult & { change: number }];

  if (!last.onPlan) return { kind: 'tighten-up' };

  if (prev.onPlan && prev.change > -0.5 && last.change > -0.5) {
    return {
      kind: 'slow',
      newKcal: Math.max(KCAL_FLOOR, current.kcal - 150),
      newStepGoal: current.stepGoal < STEP_CAP ? Math.min(current.stepGoal + 1000, STEP_CAP) : null,
    };
  }

  if (prev.change < -2 && last.change < -2) return { kind: 'fast', newKcal: current.kcal + 150 };

  return { kind: 'on-pace' };
}
```

- [ ] **Step 4: Run the test and make sure it passes**

Run: `npx vitest run tests/unit/domain/adjustments.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add app/domain/adjustments.ts app/domain/steps.ts tests/unit/domain/adjustments.test.ts
git commit -m "Add check-in adjustment rules and step ramp"
```

---

### Task 9: Rocky messages

**Files:**
- Create: `app/domain/messages.ts`
- Test: `tests/unit/domain/messages.test.ts`

Situations and priority come from the spec, with `relaxed-day` first so holidays never nag. Copy lives in `content/messages.json` (M1); this module only picks.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/domain/messages.test.ts
import { describe, expect, it } from 'vitest';
import { pickSituation, renderMessage, type TodayState } from '~/domain/messages';

const base: TodayState = {
  minutes: 9 * 60,
  relaxedDay: false,
  trainingDay: true,
  sessionStarted: false,
  loggedSetToday: false,
  missedTwice: false,
  weighedIn: true,
  proteinG: 61,
  proteinTarget: 180,
  steps: 3120,
  stepGoal: 7500,
  onPlan: false,
};

describe('pickSituation', () => {
  it('lets a relaxed day win over everything', () => {
    expect(pickSituation({ ...base, relaxedDay: true, missedTwice: true })).toBe('relaxed-day');
  });

  it('calls out two missed training days first', () => {
    expect(pickSituation({ ...base, missedTwice: true, weighedIn: false })).toBe('missed-twice');
  });

  it('pushes Plan B after 2:30pm on a training day with no sets', () => {
    expect(pickSituation({ ...base, minutes: 15 * 60 })).toBe('missed-today');
    expect(pickSituation({ ...base, minutes: 15 * 60, loggedSetToday: true })).not.toBe('missed-today');
  });

  it('asks for the weigh-in before anything else routine', () => {
    expect(pickSituation({ ...base, weighedIn: false })).toBe('weigh-in-missing');
  });

  it('sets up the lift on a training morning', () => {
    expect(pickSituation(base)).toBe('training-day-morning');
  });

  it('flags protein and steps behind after 5pm', () => {
    const evening = { ...base, trainingDay: false, minutes: 17 * 60 + 30 };
    expect(pickSituation(evening)).toBe('protein-behind');
    expect(pickSituation({ ...evening, proteinG: 150 })).toBe('steps-behind');
  });

  it('closes the kitchen after 8:30pm', () => {
    expect(pickSituation({ ...base, trainingDay: false, minutes: 20 * 60 + 45, proteinG: 185, steps: 9000 })).toBe('kitchen-closed');
  });

  it('celebrates on-plan days, else defaults', () => {
    const afternoon = { ...base, trainingDay: false, minutes: 13 * 60 };
    expect(pickSituation({ ...afternoon, onPlan: true })).toBe('on-plan');
    expect(pickSituation(afternoon)).toBe('default');
  });
});

describe('renderMessage', () => {
  const copy = { 'on-plan': ['On plan. {streak} days straight.', 'Day {streak}. Keep stacking.'] };

  it('fills variables', () => {
    expect(renderMessage(copy, 'on-plan', '2026-10-12', { streak: 7 })).toMatch(/7/);
  });

  it('uses a different variant on consecutive days', () => {
    expect(renderMessage(copy, 'on-plan', '2026-10-12', { streak: 7 })).not.toBe(
      renderMessage(copy, 'on-plan', '2026-10-13', { streak: 7 }),
    );
  });

  it('throws when a situation has no copy', () => {
    expect(() => renderMessage(copy, 'default', '2026-10-12', {})).toThrow(/No copy for default/);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run tests/unit/domain/messages.test.ts`
Expected: FAIL, cannot resolve `~/domain/messages`.

- [ ] **Step 3: Implement**

```ts
// app/domain/messages.ts
import { daysBetween } from './dates';
import type { ISODate } from './types';

export type Situation =
  | 'relaxed-day'
  | 'missed-twice'
  | 'missed-today'
  | 'weigh-in-missing'
  | 'training-day-morning'
  | 'protein-behind'
  | 'steps-behind'
  | 'kitchen-closed'
  | 'on-plan'
  | 'default';

export interface TodayState {
  minutes: number;
  relaxedDay: boolean;
  trainingDay: boolean;
  sessionStarted: boolean;
  loggedSetToday: boolean;
  missedTwice: boolean;
  weighedIn: boolean;
  proteinG: number;
  proteinTarget: number;
  steps: number;
  stepGoal: number;
  onPlan: boolean;
}

export function pickSituation(s: TodayState): Situation {
  if (s.relaxedDay) return 'relaxed-day';
  if (s.missedTwice) return 'missed-twice';
  if (s.trainingDay && s.minutes >= 14 * 60 + 30 && !s.loggedSetToday) return 'missed-today';
  if (!s.weighedIn) return 'weigh-in-missing';
  if (s.trainingDay && s.minutes < 12 * 60 && !s.sessionStarted) return 'training-day-morning';
  if (s.minutes >= 17 * 60 && s.proteinG < 0.6 * s.proteinTarget) return 'protein-behind';
  if (s.minutes >= 17 * 60 && s.steps < 0.6 * s.stepGoal) return 'steps-behind';
  if (s.minutes >= 20 * 60 + 30) return 'kitchen-closed';
  if (s.onPlan) return 'on-plan';
  return 'default';
}

export function renderMessage(
  copy: Partial<Record<Situation, string[]>>,
  situation: Situation,
  date: ISODate,
  vars: Record<string, string | number>,
): string {
  const variants = copy[situation];
  if (!variants || variants.length === 0) throw new Error(`No copy for ${situation}`);
  const index = ((daysBetween('2026-01-01', date) % variants.length) + variants.length) % variants.length;
  return variants[index].replace(/\{(\w+)\}/g, (_, key: string) => String(vars[key] ?? ''));
}
```

- [ ] **Step 4: Run the test and make sure it passes**

Run: `npx vitest run tests/unit/domain/messages.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add app/domain/messages.ts tests/unit/domain/messages.test.ts
git commit -m "Add Rocky message selection"
```

---

### Task 10: Reminders due

**Files:**
- Create: `app/domain/reminders.ts`
- Test: `tests/unit/domain/reminders.test.ts`

A reminder is due when the local time is within 30 minutes after its time, today is one of its days, it has not been sent today, and its condition holds. The cron runs every 5 minutes, so the 30-minute window survives a few missed runs.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/domain/reminders.test.ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_REMINDERS, dueReminders, type ReminderFacts } from '~/domain/reminders';

const facts: ReminderFacts = {
  weekday: 1,
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
    expect(dueReminders(11 * 60 + 30, { ...facts, weekday: 2 }, settings, [])).not.toContain('lift');
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
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run tests/unit/domain/reminders.test.ts`
Expected: FAIL, cannot resolve `~/domain/reminders`.

- [ ] **Step 3: Implement**

```ts
// app/domain/reminders.ts
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
```

- [ ] **Step 4: Run the test and make sure it passes**

Run: `npx vitest run tests/unit/domain/reminders.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add app/domain/reminders.ts tests/unit/domain/reminders.test.ts
git commit -m "Add reminder scheduling rules"
```

---

### Task 11: Grocery list

**Files:**
- Create: `app/domain/groceries.ts`
- Test: `tests/unit/domain/groceries.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/domain/groceries.test.ts
import { describe, expect, it } from 'vitest';
import { buildGroceryList, friendlyGrams, type GroceryFood } from '~/domain/groceries';

const foods = new Map<string, GroceryFood>([
  ['chicken-breast-raw', { name: 'Chicken breast', section: 'meat-seafood' }],
  ['white-rice-cooked', { name: 'White rice', section: 'pantry' }],
  ['butter', { name: 'Butter', section: 'dairy-eggs' }],
]);

const ingredientsBySlug = new Map([
  ['chicken-rice', [
    { foodId: 'chicken-breast-raw', grams: 220 },
    { foodId: 'white-rice-cooked', grams: 200 },
    { foodId: 'butter', grams: 10 },
  ]],
]);

describe('friendlyGrams', () => {
  it('rounds to 50 g above 200 g and 5 g below', () => {
    expect(friendlyGrams(660)).toBe(650);
    expect(friendlyGrams(680)).toBe(700);
    expect(friendlyGrams(30)).toBe(30);
    expect(friendlyGrams(12)).toBe(10);
  });
});

describe('buildGroceryList', () => {
  it('sums foods across planned meals and groups by section', () => {
    const list = buildGroceryList(['chicken-rice', 'chicken-rice', 'chicken-rice'], ingredientsBySlug, foods);
    expect(list).toEqual([
      { section: 'meat-seafood', items: [{ foodId: 'chicken-breast-raw', name: 'Chicken breast', grams: 650 }] },
      { section: 'dairy-eggs', items: [{ foodId: 'butter', name: 'Butter', grams: 30 }] },
      { section: 'pantry', items: [{ foodId: 'white-rice-cooked', name: 'White rice', grams: 600 }] },
    ]);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run tests/unit/domain/groceries.test.ts`
Expected: FAIL, cannot resolve `~/domain/groceries`.

- [ ] **Step 3: Implement**

```ts
// app/domain/groceries.ts
export type Section = 'meat-seafood' | 'dairy-eggs' | 'produce' | 'pantry';
export const SECTION_ORDER: Section[] = ['meat-seafood', 'dairy-eggs', 'produce', 'pantry'];
export const SECTION_LABEL: Record<Section, string> = {
  'meat-seafood': 'Meat and seafood',
  'dairy-eggs': 'Dairy and eggs',
  produce: 'Produce',
  pantry: 'Pantry',
};

export interface GroceryFood {
  name: string;
  section: Section;
}

export interface GroceryItem {
  foodId: string;
  name: string;
  grams: number;
}

export function friendlyGrams(g: number): number {
  return g > 200 ? Math.round(g / 50) * 50 : Math.round(g / 5) * 5;
}

/** plannedSlugs: one entry per planned portion for the week. */
export function buildGroceryList(
  plannedSlugs: string[],
  ingredientsBySlug: Map<string, { foodId: string; grams: number }[]>,
  foods: Map<string, GroceryFood>,
): { section: Section; items: GroceryItem[] }[] {
  const totals = new Map<string, number>();
  for (const slug of plannedSlugs) {
    for (const ing of ingredientsBySlug.get(slug) ?? []) {
      totals.set(ing.foodId, (totals.get(ing.foodId) ?? 0) + ing.grams);
    }
  }
  return SECTION_ORDER.map((section) => ({
    section,
    items: [...totals.entries()]
      .filter(([id]) => foods.get(id)?.section === section)
      .map(([id, grams]) => ({ foodId: id, name: foods.get(id)!.name, grams: friendlyGrams(grams) }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  })).filter((group) => group.items.length > 0);
}
```

- [ ] **Step 4: Run the test and make sure it passes**

Run: `npx vitest run tests/unit/domain/groceries.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Run the whole domain suite once and commit**

Run: `npx vitest run tests/unit/domain`
Expected: PASS, all 11 files.

```bash
git add app/domain/groceries.ts tests/unit/domain/groceries.test.ts
git commit -m "Add grocery list aggregation"
```
