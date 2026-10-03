import { Outlet, useMatches } from "react-router";
import { TabBar } from "~/components/TabBar";

export default function AppLayout() {
  const hideTabBar = useMatches().some((m) => (m.handle as { hideTabBar?: boolean } | undefined)?.hideTabBar);
  return (
    <div className={hideTabBar ? "" : "min-[900px]:pl-60"}>
      <Outlet />
      {!hideTabBar && <TabBar />}
    </div>
  );
}
