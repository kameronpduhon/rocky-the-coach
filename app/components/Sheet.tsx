import { useEffect, type ReactNode } from "react";
import { Icon } from "~/components/ui";
import { btn } from "~/ui/button";

/**
 * A bottom sheet. Done is the v1 glass button the older sheets keep. The swap sheet's mock has a quiet Cancel, and the
 * close-out sheet closes with its own "Not now".
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  dismiss = "done",
  onBack,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  dismiss?: "done" | "cancel" | "none";
  onBack?: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center min-[900px]:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-ink/50 active:opacity-100" />
      <div className="sheet-panel relative max-h-[85dvh] w-full max-w-[520px] overflow-y-auto rounded-t-[6px] p-5 pb-[max(20px,env(safe-area-inset-bottom))] min-[900px]:rounded-[6px]">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            {onBack && (
              <button type="button" aria-label="Back" onClick={onBack} className="flex size-11 flex-none items-center justify-center rounded-[6px] border-[1.5px] border-border">
                <Icon name="back" size={20} strokeWidth={2.4} />
              </button>
            )}
            <h2 className="truncate font-display text-[28px] uppercase">{title}</h2>
          </div>
          {dismiss === "done" && (
            <button type="button" onClick={onClose} className="glass h-11 rounded-full px-[18px] text-[15px] font-semibold">
              Done
            </button>
          )}
          {dismiss === "cancel" && (
            <button type="button" onClick={onClose} className={btn.quiet}>
              Cancel
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}
