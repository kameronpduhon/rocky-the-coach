import { env } from "cloudflare:workers";
import { AsyncLocalStorage } from "node:async_hooks";
import { getDb, type Db } from "~/db/client";
import type { PersonBinding, User } from "./users.server";

const scope = new AsyncLocalStorage<User>();

export function runAsUser<T>(user: User, fn: () => T): T {
  return scope.run(user, fn);
}

export function currentUser(): User {
  const user = scope.getStore();
  if (user) return user;
  // Tests call loaders and actions directly, without the root middleware. Production leaves TEST_USER_DB empty.
  if (env.TEST_USER_DB) return { id: 1, name: "Kameron", dbBinding: env.TEST_USER_DB as PersonBinding, planKey: "kameron", ingestToken: null };
  throw new Error("No signed-in user in this request");
}

/** The signed-in person's own database. */
export function userDb(): Db {
  return getDb(env[currentUser().dbBinding]);
}

/** The signed-in person's own D1 database, for raw SQL such as the sync endpoints. */
export function userD1(): D1Database {
  return env[currentUser().dbBinding];
}
