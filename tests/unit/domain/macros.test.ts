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
