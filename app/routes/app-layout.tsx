import { Outlet, redirect, useMatches, useNavigation } from "react-router";
import type { Route } from "./+types/app-layout";
import { PendingSync } from "~/components/PendingSync";
import { TabBar } from "~/components/TabBar";
import { currentUser } from "~/server/current-user.server";

// Screens that only make sense with a plan. Library and Settings work for everyone.
const PLAN_ONLY = /^\/(plan|progress|workout|meal|check-in|groceries)(\/|\.data|$)/;

export const middleware: Route.MiddlewareFunction[] = [
  async ({ request }, next) => {
    if (!currentUser().planKey && PLAN_ONLY.test(new URL(request.url).pathname)) throw redirect("/");
    return next();
  },
];

export default function AppLayout() {
  const hideTabBar = useMatches().some((m) => (m.handle as { hideTabBar?: boolean } | undefined)?.hideTabBar);
  const loading = useNavigation().state === "loading";
  return (
    <div className={hideTabBar ? "" : "min-[900px]:pl-60"}>
      {loading && <div aria-hidden="true" className="nav-progress fixed inset-x-0 top-[env(safe-area-inset-top)] z-50 h-[3px] bg-protein" />}
      <PendingSync />
      <Outlet />
      {!hideTabBar && <TabBar />}
    </div>
  );
}
