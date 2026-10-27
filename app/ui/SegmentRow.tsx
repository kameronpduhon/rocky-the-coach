export type Segment = "current" | "done" | "todo";

/** One segment per lift: red is the current lift (live state), ink is done, an outline is still to do. */
export function SegmentRow({ segments }: { segments: Segment[] }) {
  const done = segments.filter((x) => x === "done").length;
  return (
    <div role="img" aria-label={`${done} of ${segments.length} lifts done`} className="grid gap-1" style={{ gridTemplateColumns: `repeat(${segments.length}, minmax(0, 1fr))` }}>
      {segments.map((x, i) => (
        <span key={i} className={`h-1.5 rounded-[2px] ${x === "current" ? "bg-red" : x === "done" ? "bg-ink" : "border-[1.5px] border-border"}`} />
      ))}
    </div>
  );
}
