import { COACH_NAME } from "~/brand";
import { Icon } from "~/components/ui";

/** "Tell Rocky something" on Today's Rocky card (option 4B). Only shown with the AI on and set up. */
export function TellLine({ onTap }: { onTap: () => void }) {
  return (
    <button type="button" onClick={onTap} className="flex min-h-12 w-full items-center justify-between text-left text-[16px] font-semibold text-paper">
      <span className="underline decoration-on-ink-2 underline-offset-4">Tell {COACH_NAME} something</span>
      <Icon name="chevron" size={18} strokeWidth={2.4} />
    </button>
  );
}
