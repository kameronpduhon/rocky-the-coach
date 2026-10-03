import type { ComponentProps, ReactNode } from "react";
import { Link } from "react-router";

export function Screen({ children }: { children: ReactNode }) {
  return <main className="mx-auto flex w-full max-w-[760px] flex-col gap-[18px] px-4 pb-12 pt-[54px]">{children}</main>;
}

/**
 * Floating bottom bars are fixed, so they cover whatever scrolls under them. Each one puts this spacer in the
 * page flow, the same height as the bar plus its inset, so the last row always scrolls fully clear at any width.
 */
export function BarSpacer({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`h-[calc(66px+max(28px,env(safe-area-inset-bottom)))] flex-none ${className}`} />;
}

/** The floating glass action bar at the bottom of a pushed screen, with its spacer unless the caller places one. */
export function FloatingBar({ children, className = "", spacer = true }: { children: ReactNode; className?: string; spacer?: boolean }) {
  return (
    <>
      {spacer && <BarSpacer />}
      <div className={`glass-bar fixed inset-x-4 bottom-[max(28px,env(safe-area-inset-bottom))] z-20 mx-auto max-w-[728px] rounded-[34px] p-1.5 ${className}`}>{children}</div>
    </>
  );
}

export function LargeTitle({ eyebrow, title, right }: { eyebrow?: string; title: string; right?: ReactNode }) {
  return (
    <header className="flex items-end justify-between px-1 leading-[normal]">
      <div>
        {eyebrow && <div className="text-[15px] font-semibold text-label-2">{eyebrow}</div>}
        <h1 className="mt-0.5 text-[34px] font-bold">{title}</h1>
      </div>
      {right}
    </header>
  );
}

export function Card({ children, className = "", ...rest }: ComponentProps<"section">) {
  return (
    <section {...rest} className={`rounded-[26px] bg-card ${className}`}>
      {children}
    </section>
  );
}

/** A 20 px radius figure tile: label, big value, one line under it. Green marks a good value or change. */
export function Tile({ label, value, sub, valueGood, subGood }: { label: string; value: string; sub: string; valueGood?: boolean; subGood?: boolean }) {
  return (
    <div className="rounded-[20px] bg-card p-4">
      <div className="text-[13px] font-semibold">{label}</div>
      <div className={`tabular mt-1 text-[24px] font-bold ${valueGood ? "text-steps-text" : ""}`}>{value}</div>
      <div className={`tabular mt-px text-[14px] ${subGood ? "font-semibold text-steps-text" : "text-label-2"}`}>{sub}</div>
    </div>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between px-1 pt-1.5">
      <h2 className="text-[22px] font-bold">{children}</h2>
      {right && <div className="text-[15px] text-label-2">{right}</div>}
    </div>
  );
}

export function BackButton({ to, label, onImage = false, size = 44 }: { to: string; label: string; onImage?: boolean; size?: number }) {
  return (
    <Link to={to} aria-label={label} className={`${onImage ? "glass-on-image" : "glass"} flex items-center justify-center rounded-full`} style={{ width: size, height: size }}>
      <Icon name="back" strokeWidth={2.4} />
    </Link>
  );
}

const PATHS: Record<string, ReactNode> = {
  today: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  plan: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  progress: (
    <>
      <path d="M3 17l5-5 4 3 8-8" />
      <path d="M15 7h5v5" />
    </>
  ),
  library: (
    <>
      <path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z" />
      <path d="M5 17a3 3 0 0 1 3-3h11" />
    </>
  ),
  back: <path d="M15 6l-6 6 6 6" />,
  chevron: <path d="M9 6l6 6-6 6" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  swap: <path d="M7 7h12l-3-3M17 17H5l3 3" />,
  plate: (
    <>
      <circle cx="12" cy="13" r="7" />
      <circle cx="12" cy="13" r="3.5" />
    </>
  ),
  meal: (
    <>
      <circle cx="12" cy="13" r="7" />
      <circle cx="12" cy="13" r="3.5" />
      <path d="M3 4v5M5 4v5M4 9v11M20 4c-1.5 1-2 3-2 5h2v11" />
    </>
  ),
  camera: (
    <>
      <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
      <circle cx="12" cy="13" r="3.5" />
    </>
  ),
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </>
  ),
};

export function Icon({ name, size = 20, strokeWidth = 2.2 }: { name: keyof typeof PATHS | string; size?: number; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name]}
    </svg>
  );
}
