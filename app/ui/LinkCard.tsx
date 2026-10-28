import { Link } from "react-router";
import { Icon } from "~/components/ui";

/** A 1.5 px ink outline card that goes somewhere: an icon, a title, a subline and a chevron. Groceries on Plan and the check-in. */
export function LinkCard({ to, icon, title, sub }: { to: string; icon: string; title: string; sub: string }) {
  return (
    <Link to={to} className="flex min-h-16 items-center gap-3 rounded-[6px] border-[1.5px] border-ink px-3.5 text-ink no-underline">
      <span aria-hidden="true" className="flex-none">
        <Icon name={icon} size={22} strokeWidth={2} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[17px] font-bold">{title}</span>
        <span className="text-[14px] text-ink-3">{sub}</span>
      </span>
      <span aria-hidden="true" className="flex-none text-ink-3">
        <Icon name="chevron" size={16} strokeWidth={2.4} />
      </span>
    </Link>
  );
}
