/** iOS-style switch. The button is a full 44 px target; the 52 x 32 track sits inside it. */
export function Toggle({ on, label, onChange }: { on: boolean; label: string; onChange?: (on: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange?.(!on)} className="flex h-11 w-[52px] flex-none items-center">
      <span className={`flex h-8 w-[52px] rounded-full p-0.5 transition-colors ${on ? "justify-end bg-steps" : "justify-start bg-[var(--toggle-off)]"}`}>
        <span className="size-7 rounded-full bg-white shadow-[0_2px_6px_rgba(0,0,0,0.3)]" />
      </span>
    </button>
  );
}
