import type { ReactNode } from "react";
import { Link } from "react-router";
import { Icon } from "~/components/ui";

/**
 * A gym screen: full height, no tab bar, and the action docked at the bottom. The dock is sticky, not fixed, so the
 * page needs no spacer and the last row always scrolls clear of it.
 */
export function GymFrame({ header, children, dock, gap = "gap-[18px]" }: { header?: ReactNode; children: ReactNode; dock: ReactNode; gap?: string }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[560px] flex-col">
      <main className={`flex flex-1 flex-col px-5 pb-6 pt-[max(20px,env(safe-area-inset-top))] ${gap}`}>
        {header && <header className="flex items-center justify-between gap-2.5">{header}</header>}
        {children}
      </main>
      <div className="sticky bottom-0 z-20">{dock}</div>
    </div>
  );
}

/** The paper bar under a gym screen: a 2 px ink rule, then a note and the one red action. */
export function Dock({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-2.5 border-t-2 border-ink bg-paper px-5 pb-[max(16px,env(safe-area-inset-bottom))] pt-3">{children}</div>;
}

/** The 44 px outlined square in a gym header: back, or the X that leaves a running workout. */
export function HeaderIcon({ to, label, icon }: { to: string; label: string; icon: "back" | "close" }) {
  return (
    <Link to={to} aria-label={label} className="flex size-11 flex-none items-center justify-center rounded-[6px] border-[1.5px] border-border">
      <Icon name={icon} size={18} strokeWidth={2.4} />
    </Link>
  );
}
