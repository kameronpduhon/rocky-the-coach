import { useEffect } from "react";
import { Navigate, Outlet, useLocation, useMatches, useNavigation } from "react-router";
import type { Route } from "./+types/app-layout";
import { PendingSync } from "~/components/PendingSync";
import { SyncNotice } from "~/components/SyncNotice";
import { TabBar } from "~/components/TabBar";
import { isPlanOnly, loadMe } from "~/me";
import { SyncProvider } from "~/sync/react";

// onINP can't be unregistered, so a second effect run (StrictMode in dev) would report every tap twice.
let reportingInp = false;

export async function clientLoader() {
  return loadMe();
}

// Who is signed in only changes with a full page load (sign in, sign out), so tab taps don't wait on the network.
export function shouldRevalidate() {
  return false;
}

export default function AppLayout({ loaderData }: Route.ComponentProps) {
  const { pathname } = useLocation();
  const hideTabBar = useMatches().some((m) => (m.handle as { hideTabBar?: boolean } | undefined)?.hideTabBar);
  const loading = useNavigation().state === "loading";
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
  // The redirect runs here, not in the loader, because the loader runs once per page load.
  if (!loaderData.hasPlan && isPlanOnly(pathname)) return <Navigate to="/" replace />;
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
