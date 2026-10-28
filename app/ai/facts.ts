// What Rocky knows (spec section 6, "facts"): the limits and the reading every screen shares. Pure.
import type { Row } from "~/sync/tables";

export const FACT_LIMIT = 30;
export const FACT_MAX = 200;

export interface Fact {
  key: string;
  text: string;
  dated: boolean;
  createdAt: string;
}

/** The facts, oldest first. */
export function factsOf(rows: Row[]): Fact[] {
  return rows
    .map((r) => ({ key: String(r.client_id), text: String(r.text), dated: Number(r.dated) === 1, createdAt: String(r.created_at) }))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.key.localeCompare(b.key));
}
