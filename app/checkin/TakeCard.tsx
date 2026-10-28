import { useTake } from "~/ai/use-take";
import { COACH_NAME } from "~/brand";
import type { ISODate } from "~/domain/types";
import { RockyCard } from "~/ui/RockyCard";
import type { CheckInDigest } from "./digest";
import type { Take } from "./take";

/** ROCKY'S TAKE: the AI paragraph when there is a good one, bars while it's written, else the rule take's rows. */
export function TakeCard({ week, digest, rule, writable }: { week: ISODate; digest: CheckInDigest; rule: Take; writable: boolean }) {
  const take = useTake({ week, digest, rule, writable });
  const label = `${COACH_NAME}'s take`;
  if (take.kind === "ai") return <RockyCard label={label} prose={take.text} />;
  if (take.kind === "waiting") return <RockyCard label={label} placeholder />;
  return (
    <RockyCard
      label={label}
      rows={[
        { label: "Win", text: rule.win },
        { label: "Fix", text: rule.fix },
        { label: "Call", text: rule.call },
      ]}
    />
  );
}
