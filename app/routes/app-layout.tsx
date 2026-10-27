import { useEffect } from "react";
import { Outlet, redirect, useMatches, useNavigation } from "react-router";
import type { Route } from "./+types/app-layout";
import { PendingSync } from "~/components/PendingSync";
import { SyncNotice } from "~/components/SyncNotice";
import { TabBar } from "~/components/TabBar";
import { mealDate, weekStart } from "~/domain/dates";
import { serverNow } from "~/server/clock.server";
import { currentUser, userDb } from "~/server/current-user.server";
import { ensureWeekPlan } from "~/server/meal-plan.server";
import { SyncProvider } from "~/sync/react";

// Screens that only make sense with a plan. Library and Settings work for everyone.
const PLAN_ONLY = /^\/(plan|progress|workout|meal|check-in|groceries)(\/|\.data|$)/;

// onINP can't be unregistered, so a second effect run (StrictMode in dev) would report every tap twice.
let reportingInp = false;

export const middleware: Route.MiddlewareFunction[] = [
  async ({ request }, next) => {
    if (!currentUser().planKey && PLAN_ONLY.test(new URL(request.url).pathname)) throw redirect("/");
    return next();
  },
];

export async function loader() {
  const user = currentUser();
  // Today reads this week's meals from the phone's copy, so they must exist in the database to sync down.
  if (user.planKey) await ensureWeekPlan(userDb(), weekStart(mealDate(serverNow())));
  return { userId: user.id, name: user.name, hasPlan: Boolean(user.planKey) };
}

const LAYOUT_KEY = "rocky-layout";

/** Offline, who is signed in has not changed, so the last answer stands in. A redirect to sign in still goes through. */
export async function clientLoader({ serverLoader }: Route.ClientLoaderArgs) {
  try {
    return await serverLoader();
  } catch (err) {
    if (err instanceof Response) throw err;
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(LAYOUT_KEY);
    } catch {
      saved = null;
    }
    if (!saved) throw err;
    return JSON.parse(saved) as Awaited<ReturnType<typeof loader>>;
  }
}

export default function AppLayout({ loaderData }: Route.ComponentProps) {
  const hideTabBar = useMatches().some((m) => (m.handle as { hideTabBar?: boolean } | undefined)?.hideTabBar);
  const loading = useNavigation().state === "loading";
  // Saved from the component, not the clientLoader, because the first load renders the server's answer without
  // running the clientLoader. An app opened offline and never navigated online would otherwise have nothing saved.
  useEffect(() => {
    try {
      localStorage.setItem(LAYOUT_KEY, JSON.stringify(loaderData));
    } catch {
      // Private mode can refuse storage. The live answer is still good.
    }
  }, [loaderData]);
  useEffect(() => {
    if (reportingInp) return;
    reportingInp = true;
    // Real tap latency from this phone, sent once per page view when the browser reports it (Safari 26.2+).
    void import("web-vitals/attribution").then(({ onINP }) =>
      onINP((m) => {
        const body = JSON.stringify({ route: location.pathname, inp: Math.round(m.value), target: m.attribution.interactionTarget?.slice(0, 200) || undefined });
        navigator.sendBeacon("/api/vitals", new Blob([body], { type: "application/json" }));
      }),
    );
  }, []);
  return (
    <SyncProvider userId={loaderData.userId}>
      <div className={hideTabBar ? "" : "min-[900px]:pl-60"}>
        {loading && <div aria-hidden="true" className="nav-progress fixed inset-x-0 top-[env(safe-area-inset-top)] z-50 h-[3px] bg-protein" />}
        <PendingSync />
        <SyncNotice />
        <Outlet />
        {!hideTabBar && <TabBar />}
      </div>
    </SyncProvider>
  );
}
