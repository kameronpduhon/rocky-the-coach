// Which tables sync, and how a row's key is built. Triggers, pull and the client store must agree on keys,
// so this file is the only place they are defined. No Worker imports: the browser loads it too.

export type Row = Record<string, unknown>;

export interface TableDef {
  name: string;
  /** SQL for the row key. `p` is a column prefix such as "NEW." or "". */
  keySql: (p: string) => string;
  key: (r: Row) => string;
  /** Columns for INSERT ... ON CONFLICT when a mutator writes this table. */
  conflict: string[];
}

const cols = (...names: string[]): Pick<TableDef, "keySql" | "key" | "conflict"> => ({
  keySql: (p) => names.map((n) => `${p}${n}`).join(" || '|' || "),
  key: (r) => names.map((n) => String(r[n])).join("|"),
  conflict: names,
});

const byId: Pick<TableDef, "keySql" | "key" | "conflict"> = {
  keySql: (p) => `'id:' || ${p}id`,
  key: (r) => `id:${r.id}`,
  conflict: ["id"],
};

// Rows a phone creates carry a client_id before the server gives them an id, so that is their identity.
const byClientId: Pick<TableDef, "keySql" | "key" | "conflict"> = {
  keySql: (p) => `COALESCE(${p}client_id, 'id:' || ${p}id)`,
  key: (r) => (r.client_id as string | null) ?? `id:${r.id}`,
  conflict: ["client_id"],
};

export const SYNCED: TableDef[] = [
  { name: "meal_state", ...cols("slug") },
  { name: "planned_meals", ...cols("date", "slot") },
  { name: "meal_logs", ...byClientId },
  { name: "batches", ...byId },
  { name: "workout_sessions", ...byId },
  { name: "exercise_checks", ...cols("session_id", "exercise_id") },
  { name: "set_logs", ...byClientId },
  { name: "exercise_overrides", ...cols("template_id", "position") },
  { name: "exercise_swaps", ...cols("date", "template_id", "position") },
  { name: "schedule_moves", ...cols("date") },
  { name: "weigh_ins", ...cols("date") },
  { name: "waist_logs", ...cols("date") },
  { name: "steps_daily", ...cols("date") },
  { name: "targets", ...cols("effective_from") },
  { name: "check_ins", ...cols("week_start") },
  { name: "reminder_settings", ...cols("kind") },
  { name: "grocery_checks", ...cols("week_start", "food_id") },
  { name: "profile", ...cols("id") },
];

const BY_NAME = new Map(SYNCED.map((d) => [d.name, d]));

export function tableDef(name: string): TableDef {
  const def = BY_NAME.get(name);
  if (!def) throw new Error(`Not a synced table: ${name}`);
  return def;
}

export function keyOf(table: string, row: Row): string {
  return tableDef(table).key(row);
}
