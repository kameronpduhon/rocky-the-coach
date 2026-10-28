// Numbers in text (spec section 2, "The check"): digits, and the number words a coach might write. "One" and "a" are
// left alone, since they are mostly a pronoun and an article. Pure: the phone and the Worker both run it.

const WORDS: Record<string, number> = {
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
  hundred: 100,
  thousand: 1000,
  half: 0.5,
  quarter: 0.25,
};

const DIGITS = /\d[\d,]*(?:\.\d+)?/g;

/** Every number in the text, by value: the digits (commas dropped, never a sign), then the number words. */
export function readNumbers(text: string): number[] {
  const digits = [...text.matchAll(DIGITS)].map((m) => Number(m[0].replace(/,/g, "")));
  const words = (text.toLowerCase().match(/[a-z]+/g) ?? []).filter((w) => Object.hasOwn(WORDS, w)).map((w) => WORDS[w]);
  return [...digits, ...words];
}

export function allowedNumbers(lines: string[]): Set<number> {
  return new Set(lines.flatMap(readNumbers));
}

/** The numbers in `text` that aren't allowed. */
export function strayNumbers(text: string, allowed: Set<number>): number[] {
  return readNumbers(text).filter((n) => !allowed.has(n));
}
