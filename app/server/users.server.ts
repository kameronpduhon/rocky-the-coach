import { env } from "cloudflare:workers";
import { and, eq, gte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { getDb, type Db } from "~/db/client";
import * as core from "~/db/core-schema";

export type PersonBinding = "DB" | "DB_CATHERINE";

export interface User {
  id: number;
  name: string;
  dbBinding: PersonBinding;
  planKey: string | null;
  ingestToken: string | null;
}

export const coreDb = () => drizzle(env.CORE, { schema: core });

const columns = {
  id: core.users.id,
  name: core.users.name,
  dbBinding: core.users.dbBinding,
  planKey: core.users.planKey,
  ingestToken: core.users.ingestToken,
};

type Row = { id: number; name: string; dbBinding: string; planKey: string | null; ingestToken: string | null };
const asUser = (row: Row | undefined): User | null => (row ? { ...row, dbBinding: row.dbBinding as PersonBinding } : null);

export async function userById(id: number): Promise<User | null> {
  return asUser(await coreDb().select(columns).from(core.users).where(eq(core.users.id, id)).get());
}

export async function userByBinding(binding: PersonBinding): Promise<User | null> {
  return asUser(await coreDb().select(columns).from(core.users).where(eq(core.users.dbBinding, binding)).get());
}

export async function userByIngestToken(token: string): Promise<User | null> {
  if (!token) return null;
  return asUser(await coreDb().select(columns).from(core.users).where(eq(core.users.ingestToken, token)).get());
}

export async function allUsers(): Promise<User[]> {
  const rows = await coreDb().select(columns).from(core.users).orderBy(core.users.id).all();
  return rows.map((r) => asUser(r)!);
}

export async function credentialsFor(name: string): Promise<{ user: User; passwordHash: string | null } | null> {
  const row = await coreDb()
    .select({ ...columns, passwordHash: core.users.passwordHash })
    .from(core.users)
    .where(eq(core.users.nameKey, name.trim().toLowerCase()))
    .get();
  if (!row) return null;
  const { passwordHash, ...user } = row;
  return { user: asUser(user)!, passwordHash };
}

/** The Drizzle client for one person's own database. */
export function personDb(user: User): Db {
  return getDb(env[user.dbBinding]);
}

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;

export async function isLockedOut(ip: string, now = new Date()): Promise<boolean> {
  const since = new Date(now.getTime() - WINDOW_MS).toISOString();
  const rows = await coreDb()
    .select({ id: core.loginAttempts.id })
    .from(core.loginAttempts)
    .where(and(eq(core.loginAttempts.ip, ip), gte(core.loginAttempts.attemptedAt, since)))
    .all();
  return rows.length >= MAX_FAILURES;
}

export async function recordFailure(ip: string, now = new Date()): Promise<void> {
  await coreDb().insert(core.loginAttempts).values({ ip, attemptedAt: now.toISOString() });
}
