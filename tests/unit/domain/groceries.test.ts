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
