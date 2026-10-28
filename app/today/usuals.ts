// Usual orders: off-plan entries saved for one-tap logging, most used first (option 3A).
import { keyOf, type Row } from "~/sync/tables";

/** The sheet shows this many, then "All <n> usuals". */
export const USUALS_SHOWN = 5;

export interface UsualModel {
  key: string;
  name: string;
  /** "1,050 cal · 75 g · relaxed", or "100 cal · drink" with no protein. */
  sub: string;
}

export function usualOrders(rows: Row[]): UsualModel[] {
  return [...rows]
    .sort(
      (a, b) =>
        Number(b.uses ?? 0) - Number(a.uses ?? 0) ||
        String(b.last_used_at ?? "").localeCompare(String(a.last_used_at ?? "")) ||
        String(a.name).localeCompare(String(b.name)),
    )
    .map((u) => ({
      key: keyOf("usual_orders", u),
      name: u.name as string,
      sub: [`${Number(u.kcal).toLocaleString("en-US")} cal`, Number(u.protein_g) > 0 ? `${u.protein_g} g` : null, u.relaxed ? "relaxed" : (u.category as string)].filter(Boolean).join(" · "),
    }));
}
