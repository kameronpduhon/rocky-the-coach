import { useEffect, useRef, useState } from "react";

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/**
 * The dark rest panel. It ticks itself, so the 250 ms tick redraws the panel and not the screen, and calls onDone
 * once at 0:00.
 */
export function RestPanel({
  endsAt,
  total,
  line,
  onAdjust,
  onSkip,
  onDone,
}: {
  endsAt: number;
  total: number;
  line: string;
  onAdjust: (seconds: number) => void;
  onSkip: () => void;
  onDone: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(t);
  }, []);
  const left = Math.max(0, Math.ceil((endsAt - now) / 1000));
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    if (left === 0) done.current();
  }, [left]);
  const pct = total > 0 ? Math.min(100, (left / total) * 100) : 0;
  const quiet = "h-14 rounded-[6px] border-[1.5px] border-muted font-num text-[19px] font-bold text-paper";
  return (
    <section role="timer" aria-label={`Rest, ${Math.floor(left / 60)} minutes ${left % 60} seconds left`} className="flex flex-col gap-3.5 rounded-t-[14px] bg-ink px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-5 text-paper">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-num text-[16px] font-bold tracking-[0.04em] text-coral">REST</span>
        <span className="text-right text-[14px] text-on-ink-2">{line}</span>
      </div>
      <div aria-hidden="true" className="tabular text-center font-display text-[104px] leading-[0.9]">
        {clock(left)}
      </div>
      <div aria-hidden="true" className="h-2 rounded-[4px] bg-ink-2">
        <div className="h-2 rounded-[4px] bg-red" style={{ width: `${pct}%` }} />
      </div>
      <div className="grid grid-cols-3 gap-2.5">
        <button type="button" onClick={() => onAdjust(-15)} className={quiet}>
          −15 s
        </button>
        <button type="button" onClick={() => onAdjust(15)} className={quiet}>
          +15 s
        </button>
        <button type="button" onClick={onSkip} className="h-14 rounded-[6px] bg-paper font-num text-[19px] font-bold text-ink">
          Skip
        </button>
      </div>
    </section>
  );
}
