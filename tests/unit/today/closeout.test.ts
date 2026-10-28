import { describe, expect, it } from "vitest";
import { closeOutLabel } from "~/today/closeout";
import { usualOrders } from "~/today/usuals";

describe("closeOutLabel", () => {
  it("names the mix of eaten and skipped", () => {
    expect(closeOutLabel(2, 0)).toBe("Save: both eaten");
    expect(closeOutLabel(3, 0)).toBe("Save: all 3 eaten");
    expect(closeOutLabel(2, 1)).toBe("Save: 2 eaten, 1 skipped");
    expect(closeOutLabel(0, 2)).toBe("Save: all skipped");
    expect(closeOutLabel(1, 0)).toBe("Save: eaten");
    expect(closeOutLabel(0, 1)).toBe("Save: skipped");
  });
});

describe("usualOrders", () => {
  it("lists the most used first, then the latest, and leaves out zero protein", () => {
    const rows = [
      { client_id: "usual-ranch-water", name: "Ranch Water", category: "drink", kcal: 100, protein_g: 0, relaxed: 0, uses: 2, last_used_at: "2026-10-20T01:00:00Z" },
      { client_id: "u-1", name: "Chipotle bowl, double chicken", category: "meal", kcal: 1050, protein_g: 75, relaxed: 1, uses: 2, last_used_at: "2026-10-27T18:00:00Z" },
      { client_id: "usual-restaurant-meal", name: "Restaurant meal", category: "meal", kcal: 900, protein_g: 50, relaxed: 1, uses: 0, last_used_at: null },
    ];
    expect(usualOrders(rows)).toEqual([
      { key: "u-1", name: "Chipotle bowl, double chicken", sub: "1,050 cal · 75 g · relaxed" },
      { key: "usual-ranch-water", name: "Ranch Water", sub: "100 cal · drink" },
      { key: "usual-restaurant-meal", name: "Restaurant meal", sub: "900 cal · 50 g · relaxed" },
    ]);
  });
});
