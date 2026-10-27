import { NavLink, useNavigation } from "react-router";

const TABS = [
  { to: "/", label: "Today" },
  { to: "/plan", label: "Plan" },
  { to: "/progress", label: "Progress" },
  { to: "/library", label: "Library" },
] as const;

export function TabBar() {
  // Light the tapped tab at once instead of after its data arrives, and only that one.
  const pending = useNavigation().location?.pathname;
  const pendingTab = pending ? TABS.find((t) => (t.to === "/" ? pending === "/" : pending.startsWith(t.to)))?.to : undefined;
  return (
    <>
      {/* The bar is fixed, so the page keeps its height in flow and the last row scrolls clear. */}
      <div aria-hidden="true" className="h-[calc(58px+env(safe-area-inset-bottom))] flex-none min-[900px]:hidden" />
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t-2 border-ink bg-paper px-2 pt-1 pb-[env(safe-area-inset-bottom)] font-num text-[15px] font-bold uppercase tracking-[0.04em]
          min-[900px]:inset-y-0 min-[900px]:right-auto min-[900px]:w-60 min-[900px]:grid-cols-1 min-[900px]:content-start min-[900px]:border-t-0 min-[900px]:border-r-2 min-[900px]:px-6 min-[900px]:pt-8"
      >
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.to === "/"}
            className={({ isActive }) =>
              `flex h-[52px] items-center justify-center min-[900px]:justify-start ${(pendingTab ? pendingTab === t.to : isActive) ? "text-red" : "text-muted"}`
            }
          >
            {t.label}
          </NavLink>
        ))}
      </nav>
    </>
  );
}
