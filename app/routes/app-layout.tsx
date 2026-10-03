import { Outlet, useMatches } from "react-router";
import { PendingSync } from "~/components/PendingSync";
import { TabBar } from "~/components/TabBar";

export default function AppLayout() {
  const hideTabBar = useMatches().some((m) => (m.handle as { hideTabBar?: boolean } | undefined)?.hideTabBar);
  return (
    <div className={hideTabBar ? "" : "min-[900px]:pl-60"}>
      <PendingSync />
      <Outlet />
      {!hideTabBar && <TabBar />}
    </div>
  );
}
