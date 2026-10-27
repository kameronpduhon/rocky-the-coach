import { Icon } from "~/components/ui";

export interface StripDay {
  date: string;
  letter: string;
  name: string;
  counted: boolean;
  today: boolean;
  future: boolean;
}

export function WeekStrip({ days }: { days: StripDay[] }) {
  return (
    <ol aria-label="Days that counted this week" className="grid grid-cols-7 gap-1.5 text-center font-num text-[14px] font-bold">
      {days.map((d) => (
        <li
          key={d.date}
          aria-label={`${d.name}${d.today ? ", today" : ""}, ${d.counted ? "counted" : d.future ? "ahead" : "didn't count"}`}
          className={`flex flex-col gap-1.5 ${d.today ? "text-ink" : d.future ? "text-muted" : "text-ink-3"}`}
        >
          <span className={d.today ? "underline decoration-2 underline-offset-[3px]" : ""}>{d.letter}</span>
          {d.counted ? (
            <span className="flex h-8 items-center justify-center rounded-[3px] bg-ink text-paper">
              <Icon name="check" size={16} strokeWidth={3} />
            </span>
          ) : (
            <span className={`h-8 rounded-[3px] border-[1.5px] border-border ${d.future || d.today ? "" : "border-dashed"}`} />
          )}
        </li>
      ))}
    </ol>
  );
}
