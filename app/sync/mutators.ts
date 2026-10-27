import { z } from "zod";
import { meals } from "~/content";
import { addDays, daysBetween } from "~/domain/dates";
import { DEFAULT_REMINDERS } from "~/domain/reminders";
import { SLOTS } from "~/domain/types";
import type { Tx } from "./tx";

export class MutationRejected extends Error {}

export interface MutationContext {
  /** ISO time the change was made. The server uses its own clock. */
  now: string;
  /** Today in Chicago. */
  today: string;
}

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const clientId = z.string().min(1).max(64);
const key = z.string().min(1).max(64);
const round1 = (n: number) => Math.round(n * 10) / 10;

function notFuture(d: string, ctx: MutationContext) {
  if (daysBetween(ctx.today, d) > 1) throw new MutationRejected("That date is in the future.");
}

const defs = {
  logWeighIn: {
    args: z.object({ date, weightLb: z.number().min(80).max(500) }),
    async run(tx: Tx, a: { date: string; weightLb: number }, ctx: MutationContext) {
      notFuture(a.date, ctx);
      tx.put("weigh_ins", { date: a.date, weight_lb: round1(a.weightLb), logged_at: ctx.now });
    },
  },
  editWeighIn: {
    args: z.object({ date, weightLb: z.number().min(80).max(500) }),
    async run(tx: Tx, a: { date: string; weightLb: number }, ctx: MutationContext) {
      notFuture(a.date, ctx);
      const prev = await tx.get("weigh_ins", a.date);
      tx.put("weigh_ins", { date: a.date, weight_lb: round1(a.weightLb), logged_at: (prev?.logged_at as string | undefined) ?? ctx.now });
    },
  },
  deleteWeighIn: {
    args: z.object({ date }),
    async run(tx: Tx, a: { date: string }) {
      tx.delete("weigh_ins", a.date);
    },
  },
  logMeal: {
    args: z.object({ clientId, date, slot: z.enum(SLOTS as [string, ...string[]]), mealSlug: z.string().min(1) }),
    async run(tx: Tx, a: { clientId: string; date: string; slot: string; mealSlug: string }, ctx: MutationContext) {
      notFuture(a.date, ctx);
      const meal = meals.get(a.mealSlug);
      if (!meal) throw new MutationRejected("That meal isn't in the library.");
      const logs = await tx.scan("meal_logs");
      if (logs.some((l) => l.date === a.date && l.slot === a.slot && l.category === "planned")) return;
      tx.put("meal_logs", {
        client_id: a.clientId,
        date: a.date,
        slot: a.slot,
        meal_slug: meal.slug,
        name: meal.name,
        category: "planned",
        kcal: meal.kcal,
        protein_g: meal.protein,
        relaxed: 0,
        portions: 1,
        logged_at: ctx.now,
      });
      // Same rule as openBatch in meals.server.ts: the newest batch of this meal with portions left, cooked up to 3 days ago.
      const batch = (await tx.scan("batches"))
        .filter((b) => b.meal_slug === meal.slug && (b.portions_left as number) > 0 && (b.created_on as string) >= addDays(a.date, -3) && (b.created_on as string) <= a.date)
        .sort((x, y) => (y.id as number) - (x.id as number))[0];
      if (batch) tx.put("batches", { ...batch, portions_left: (batch.portions_left as number) - 1 });
    },
  },
  unlogMeal: {
    args: z.object({ key }),
    async run(tx: Tx, a: { key: string }) {
      tx.delete("meal_logs", a.key);
    },
  },
  logOffPlan: {
    args: z.object({
      clientId,
      date,
      name: z.string().trim().min(1).max(80),
      category: z.enum(["meal", "snack", "dessert", "drink"]),
      kcal: z.number().int().min(0).max(5000),
      proteinG: z.number().int().min(0).max(400),
      relaxed: z.boolean(),
    }),
    async run(
      tx: Tx,
      a: { clientId: string; date: string; name: string; category: string; kcal: number; proteinG: number; relaxed: boolean },
      ctx: MutationContext,
    ) {
      notFuture(a.date, ctx);
      tx.put("meal_logs", {
        client_id: a.clientId,
        date: a.date,
        slot: null,
        meal_slug: null,
        name: a.name,
        category: a.category,
        kcal: a.kcal,
        protein_g: a.proteinG,
        relaxed: a.relaxed ? 1 : 0,
        portions: 1,
        logged_at: ctx.now,
      });
    },
  },
  deleteOffPlan: {
    args: z.object({ key }),
    async run(tx: Tx, a: { key: string }) {
      tx.delete("meal_logs", a.key);
    },
  },
  setReminder: {
    args: z.object({
      kind: z.enum(DEFAULT_REMINDERS.map((r) => r.kind) as [string, ...string[]]),
      enabled: z.boolean(),
      time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    }),
    async run(tx: Tx, a: { kind: string; enabled: boolean; time: string }) {
      tx.put("reminder_settings", { kind: a.kind, enabled: a.enabled ? 1 : 0, time: a.time });
    },
  },
  setVoice: {
    args: z.object({ voice: z.enum(["corner", "plain"]) }),
    async run(tx: Tx, a: { voice: string }) {
      tx.put("profile", { id: "me", voice: a.voice });
    },
  },
};

export type MutationName = keyof typeof defs;
export const MUTATION_NAMES = Object.keys(defs) as MutationName[];

/** Validates the args and applies one named change. Throws MutationRejected for anything the change refuses. */
export async function runMutation(tx: Tx, name: string, args: unknown, ctx: MutationContext): Promise<void> {
  // hasOwn, because the name comes from the phone and "constructor" would otherwise resolve.
  const def = Object.hasOwn(defs, name)
    ? (defs as Record<string, { args: z.ZodType; run: (tx: Tx, a: never, ctx: MutationContext) => Promise<void> }>)[name]
    : undefined;
  if (!def) throw new MutationRejected(`Unknown change: ${name}`);
  const parsed = def.args.safeParse(args);
  if (!parsed.success) throw new MutationRejected(parsed.error.issues[0]?.message ?? "Bad input");
  await def.run(tx, parsed.data as never, ctx);
}
