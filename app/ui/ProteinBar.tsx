export interface ProteinSegment {
  label: string;
  grams: number;
  state: "eaten" | "next" | "later";
}

/** Protein filling meal by meal, with the target marked in red (live state). */
export function ProteinBar({ segments, target }: { segments: ProteinSegment[]; target: number }) {
  const total = Math.max(target, segments.reduce((a, s) => a + s.grams, 0));
  const at = (target / total) * 100;
  const label = `Protein by meal: ${segments.map((s) => `${s.label} ${s.grams} grams${s.state === "eaten" ? " eaten" : ""}`).join(", ")}. Target ${target} grams.`;
  return (
    <div role="img" aria-label={label} className="relative h-[34px]">
      <div className="flex h-3.5 gap-0.5">
        {segments.map((s, i) => (
          <span
            key={i}
            style={{ flexGrow: s.grams }}
            className={`relative basis-0 overflow-hidden first:rounded-l-[2px] last:rounded-r-[2px] ${s.state === "next" ? "border-[1.5px] border-dashed border-ink" : s.state === "later" ? "border-[1.5px] border-border" : ""}`}
          >
            <span className="protein-fill absolute inset-0 bg-ink" style={{ transform: `scaleX(${s.state === "eaten" ? 1 : 0})` }} />
          </span>
        ))}
      </div>
      <span aria-hidden="true" className="absolute top-[-4px] h-[22px] w-0.5 bg-red" style={{ left: `calc(${at}% - 1px)` }} />
      <span aria-hidden="true" className="tabular absolute top-5 -translate-x-full pr-1 font-num text-[12px] font-bold text-ink-3" style={{ left: `${at}%` }}>
        {target} g
      </span>
    </div>
  );
}
