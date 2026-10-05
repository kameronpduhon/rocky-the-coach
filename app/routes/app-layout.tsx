import { Outlet, useMatches, useNavigation } from "react-router";
import { PendingSync } from "~/components/PendingSync";
import { TabBar } from "~/components/TabBar";

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
