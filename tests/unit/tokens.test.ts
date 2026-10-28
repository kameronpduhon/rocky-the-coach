import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(path.join(import.meta.dirname, "../../app/styles/tokens.css"), "utf8");

const declared = new Map<string, string>();
for (const [, name, value] of css.matchAll(/--([\w-]+):\s*([^;]+);/g)) declared.set(name, value.trim());

function hex(name: string, seen = new Set<string>()): string {
  const value = declared.get(name);
  if (!value) throw new Error(`--${name} is not declared`);
  const alias = value.match(/^var\(--([\w-]+)\)$/);
  if (alias) {
    if (seen.has(name)) throw new Error(`--${name} refers to itself`);
    return hex(alias[1], seen.add(name));
  }
  if (!/^#[0-9a-f]{6}$/i.test(value)) throw new Error(`--${name} is ${value}, expected a hex or a var()`);
  return value;
}

function luminance(h: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(fg: string, bg: string) {
  const [a, b] = [luminance(hex(fg)), luminance(hex(bg))].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
}

describe("Corner revised tokens", () => {
  it("is light only", () => {
    expect(css).not.toContain("prefers-color-scheme");
  });

  it.each([
    ["ink", "paper"],
    ["ink-2", "paper"],
    ["ink-3", "paper"],
    ["muted", "paper"],
    ["muted", "raised"],
    ["muted", "well"],
    ["ink-3", "field"],
    ["red", "paper"],
    ["red", "raised"],
    ["on-red", "red"],
    ["brass-on", "brass-tag"],
    ["ink-2", "brass-fill"],
    ["coral", "ink"],
    ["paper", "ink"],
    ["on-ink-2", "ink"],
    // v1 names, as v1 screens use them
    ["label", "bg"],
    ["label-2", "card"],
    ["label-on-fill", "fill"],
    ["steps-text", "card"],
  ])("--%s text on --%s is at least 4.5:1", (fg, bg) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it.each([
    ["border", "paper"],
    ["border", "raised"],
    ["brass-border", "brass-fill"],
  ])("--%s outline on --%s is at least 3:1", (fg, bg) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(3);
  });

  it("has a rule for rows inside the brass card, and ink reads on brass", () => {
    expect(hex("brass-rule")).toBe("#e3d3ae");
    expect(contrast("ink", "brass-fill")).toBeGreaterThanOrEqual(4.5);
  });
});
