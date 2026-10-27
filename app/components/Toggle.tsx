/** The Settings mock's switch: ink when on, an outline when off. The button is a full 44 px target. */
export function Toggle({ on, label, onChange }: { on: boolean; label: string; onChange?: (on: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange?.(!on)} className="flex h-11 w-[50px] flex-none items-center">
      <span
        className={`flex h-[30px] w-[50px] rounded-full ${on ? "justify-end bg-ink p-[3px]" : "justify-start border-[1.5px] border-border p-[2px]"}`}
      >
        <span className={`rounded-full ${on ? "size-6 bg-paper" : "size-[23px] bg-border"}`} />
      </span>
    </button>
  );
}
