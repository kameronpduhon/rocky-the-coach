import { useEffect, type ReactNode } from "react";

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center min-[900px]:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/50 active:opacity-100" />
      <div className="sheet-panel relative max-h-[85dvh] w-full max-w-[520px] overflow-y-auto rounded-t-[30px] p-5 pb-[max(20px,env(safe-area-inset-bottom))] min-[900px]:rounded-[30px]">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[20px] font-bold">{title}</h2>
          <button type="button" onClick={onClose} className="glass h-11 rounded-full px-[18px] text-[15px] font-semibold">
            Done
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
