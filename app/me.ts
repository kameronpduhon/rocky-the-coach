import { redirect, useRouteLoaderData } from "react-router";

/** The signed-in person, from GET /api/me. */
export type Me = { userId: number; name: string; hasPlan: boolean };

const SAVED = "rocky-layout";

// Screens that only make sense with a plan. Library, the lift page and Settings work for everyone.
const PLAN_ONLY = /^\/(plan|progress|workout|meal|check-in|groceries)(\/|$)/;

export const isPlanOnly = (pathname: string) => PLAN_ONLY.test(pathname);

type KeyValue = Pick<Storage, "getItem" | "setItem">;

function browserStorage(): KeyValue | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

/** Offline, who is signed in has not changed, so the last answer stands in. A 401 still goes to sign in. */
export async function loadMe(send: typeof fetch = fetch, storage: KeyValue | null = browserStorage()): Promise<Me> {
  let res: Response | null;
  try {
    res = await send("/api/me");
  } catch {
    res = null;
  }
  if (res?.status === 401) throw redirect("/login");
  if (res?.ok) {
    const me = (await res.json()) as Me;
    try {
      storage?.setItem(SAVED, JSON.stringify(me));
    } catch {
      // Private mode can refuse storage. The live answer is still good.
    }
    return me;
  }
  let saved: string | null = null;
  try {
    saved = storage?.getItem(SAVED) ?? null;
  } catch {
    saved = null;
  }
  if (saved) return JSON.parse(saved) as Me;
  throw new Error("Can't reach the server, and this phone hasn't signed in before.");
}

/** The signed-in person, as the app layout loaded them. Undefined outside the layout. */
export function useMe(): Me | undefined {
  return useRouteLoaderData("routes/app-layout") as Me | undefined;
}
