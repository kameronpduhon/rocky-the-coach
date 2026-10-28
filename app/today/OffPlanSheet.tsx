import { useRef, useState } from "react";
import { useAi } from "~/ai/use-ai";
import { Sheet } from "~/components/Sheet";
import { Icon } from "~/components/ui";
import { useMutate } from "~/sync/react";
import { btn } from "~/ui/button";
import { offPlanChoices, type CardSource, type FormValues } from "./offplan";
import { ProductCard } from "./ProductCard";
import { ScanView } from "./ScanView";
import { SomethingNewForm } from "./SomethingNewForm";
import { USUALS_SHOWN, type UsualModel } from "./usuals";

const LONG_PRESS_MS = 500;

type View = { kind: "usuals" } | { kind: "form"; initial?: FormValues; note?: string } | { kind: "scan" } | { kind: "card"; card: CardSource };

const TITLE: Record<View["kind"], string> = { usuals: "Ate something else", form: "Something new", scan: "Scan", card: "Ate something else" };

/** "Ate something else": usual orders first, then Scan and typing (option 1C). Every later view has a back button. */
export function OffPlanSheet({ date, usuals, onClose }: { date: string; usuals: UsualModel[]; onClose: () => void }) {
  const [view, setView] = useState<View>({ kind: "usuals" });
  const ai = useAi();
  // The label and (in P5e) Describe it need the switch on and a key; each choice also needs a signal.
  const aiReady = ai.on && ai.available === true;
  const online = ai.online;
  const toForm = (initial?: FormValues, note?: string) => setView({ kind: "form", initial, note });

  return (
    <Sheet open onClose={onClose} title={TITLE[view.kind]} onBack={view.kind === "usuals" ? undefined : () => setView({ kind: "usuals" })}>
      {view.kind === "usuals" && (
        <div className="flex flex-col gap-6">
          <UsualOrders date={date} usuals={usuals} onLogged={onClose} />
          <section aria-labelledby="not-usual" className="flex flex-col gap-3">
            <h3 id="not-usual" className="font-num text-[16px] font-bold">
              Not in your usuals?
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {offPlanChoices({ aiReady, online }).map((c) => (
                <button
                  key={c.kind}
                  type="button"
                  disabled={c.disabled}
                  onClick={() => setView({ kind: "scan" })}
                  className="flex min-h-16 items-center gap-2.5 rounded-[6px] border-[1.5px] border-ink px-3 py-2 text-left disabled:border-border disabled:text-muted"
                >
                  <Icon name="barcode" size={20} strokeWidth={2} />
                  <span className="flex flex-col">
                    <span className="font-num text-[17px] font-bold">{c.label}</span>
                    <span className="text-[13px] text-ink-3">{c.sub}</span>
                  </span>
                </button>
              ))}
            </div>
            <button type="button" onClick={() => toForm()} className={btn.quiet}>
              Type the numbers instead
            </button>
          </section>
        </div>
      )}
      {view.kind === "form" && <SomethingNewForm date={date} initial={view.initial} note={view.note} onDone={onClose} />}
      {view.kind === "scan" && <ScanView ai={aiReady} onCard={(card) => setView({ kind: "card", card })} onForm={toForm} />}
      {view.kind === "card" && <ProductCard date={date} card={view.card} onEdit={(values) => toForm(values)} onDone={onClose} />}
    </Sheet>
  );
}

/** Usual orders, most used first, one tap each (option 3A). A long press swaps a row's Log for Remove. */
function UsualOrders({ date, usuals, onLogged }: { date: string; usuals: UsualModel[]; onLogged: () => void }) {
  const mutate = useMutate();
  const [all, setAll] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const timer = useRef<number | null>(null);
  // The press that turned Log into Remove must not also tap Remove when the finger lifts.
  const longPressed = useRef(false);
  const shown = all ? usuals : usuals.slice(0, USUALS_SHOWN);

  const release = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };
  // A long press on a usual swaps its Log for Remove, inside the sheet. No browser dialog.
  const press = (key: string) => () => {
    release();
    longPressed.current = false;
    timer.current = window.setTimeout(() => {
      longPressed.current = true;
      setRemoving(key);
    }, LONG_PRESS_MS);
  };
  const tap = (run: () => void) => () => {
    if (longPressed.current) {
      longPressed.current = false;
      return;
    }
    run();
  };

  if (usuals.length === 0) return null;
  return (
    <div className="flex flex-col">
      <ul className="flex flex-col">
        {shown.map((u) => (
          <li
            key={u.key}
            onPointerDown={press(u.key)}
            onPointerUp={release}
            onPointerLeave={release}
            onPointerCancel={release}
            onContextMenu={(e) => e.preventDefault()}
            className="flex min-h-[60px] select-none items-center gap-3 border-t border-rule [-webkit-touch-callout:none] last:border-b"
          >
            <span className="flex flex-1 flex-col">
              <span className="text-[16px]">{u.name}</span>
              <span className="text-[14px] tabular-nums text-muted">{u.sub}</span>
            </span>
            {removing === u.key ? (
              <button
                type="button"
                onClick={tap(() => {
                  void mutate("removeUsual", { key: u.key });
                  setRemoving(null);
                })}
                className={`${btn.outline} h-11 px-3.5 text-[16px]`}
              >
                Remove
              </button>
            ) : (
              <button
                type="button"
                onClick={tap(() => {
                  void mutate("logUsual", { clientId: crypto.randomUUID(), usual: u.key, date });
                  onLogged();
                })}
                className={`${btn.outline} h-11 px-3.5 text-[16px]`}
              >
                Log
              </button>
            )}
          </li>
        ))}
      </ul>
      {!all && usuals.length > USUALS_SHOWN && (
        <button type="button" onClick={() => setAll(true)} className={btn.quiet}>
          All {usuals.length} usuals
        </button>
      )}
    </div>
  );
}
