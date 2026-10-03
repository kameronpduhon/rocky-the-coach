import { NavLink } from "react-router";
import { BarSpacer, Icon } from "./ui";

const TABS = [
  { to: "/", label: "Today", icon: "today" },
  { to: "/plan", label: "Plan", icon: "plan" },
  { to: "/progress", label: "Progress", icon: "progress" },
  { to: "/library", label: "Library", icon: "library" },
] as const;

export function TabBar() {
  return (
    <>
      {/* Below 900 px the tab bar floats at the bottom; at 900 and up it is a sidebar and needs no room. */}
      <BarSpacer className="min-[900px]:hidden" />
      <nav
        aria-label="Main"
        className="glass-bar fixed inset-x-5 bottom-[max(28px,env(safe-area-inset-bottom))] z-20 grid h-16 grid-cols-4 gap-0.5 rounded-full p-1.5
          min-[900px]:inset-x-auto min-[900px]:bottom-auto min-[900px]:left-6 min-[900px]:top-6 min-[900px]:h-auto min-[900px]:w-52 min-[900px]:grid-cols-1 min-[900px]:rounded-[26px] min-[900px]:p-2"
      >
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.to === "/"}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center gap-0.5 rounded-full text-[10px] font-semibold min-[900px]:h-12 min-[900px]:flex-row min-[900px]:justify-start min-[900px]:gap-3 min-[900px]:rounded-2xl min-[900px]:px-4 min-[900px]:text-[15px] ${
                isActive ? "bg-[var(--glass-selected)] text-label" : "text-label-2"
              }`
            }
          >
            <Icon name={t.icon} size={22} strokeWidth={2} />
            {t.label}
          </NavLink>
        ))}
      </nav>
    </>
  );
}
