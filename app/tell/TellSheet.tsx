import { useState } from "react";
import { postAi } from "~/ai/client";
import { FACT_LIMIT, FACT_MAX } from "~/ai/facts";
import { NO_LONGER_FITS, proposalCards, refreshCards, resultLine, runAccept, sendButton, tellContext, TELL_FAILED, type Proposal, type ProposalCard } from "~/ai/proposals";
import { useAi, type AiState } from "~/ai/use-ai";
import { PHONE_WAIT_MS } from "~/ai/waits";
import { COACH_NAME } from "~/brand";
import { Sheet } from "~/components/Sheet";
import { localDate } from "~/domain/dates";
import { useMe } from "~/me";
import { useMutate, useStoreVersion, useSyncClient, useTable } from "~/sync/react";
import { btn } from "~/ui/button";

export const TELL_PLACEHOLDER = `Sore shoulder, travelling Thursday, anything ${COACH_NAME} should know`;
/** The phone waits this long for Rocky's proposals. */
export const TELL_WAIT_MS = PHONE_WAIT_MS.tell;
const NOTE_MAX = 500;

const OUTLINE = `${btn.outline} h-11 px-4 text-[16px] disabled:opacity-50`;

/**
 * Tell Rocky (spec section 4). With the AI on and set up, Rocky reads the note and proposes; nothing changes until a
 * proposal is accepted. With the AI off or no key, the note is saved as written.
 */
export function TellSheet({ onClose }: { onClose: () => void }) {
  const ai = useAi();
  return (
    <Sheet open onClose={onClose} title={`Tell ${COACH_NAME}`}>
      {ai.on && ai.available !== false ? <AskRocky ai={ai} onClose={onClose} /> : <SaveAsWritten onClose={onClose} />}
    </Sheet>
  );
}

function NoteBox({ value, max, onChange }: { value: string; max: number; onChange: (text: string) => void }) {
  return (
    <>
      <label htmlFor="tell-note" className="sr-only">
        What should {COACH_NAME} know?
      </label>
      <textarea
        id="tell-note"
        rows={3}
        maxLength={max}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={TELL_PLACEHOLDER}
        className="min-h-[92px] rounded-[6px] border-[1.5px] border-border bg-field px-3 py-[11px] text-[17px] leading-[1.4] focus:border-2 focus:border-ink focus:outline-none"
      />
    </>
  );
}

function SaveAsWritten({ onClose }: { onClose: () => void }) {
  const mutate = useMutate();
  const full = useTable("facts").length >= FACT_LIMIT;
  const [text, setText] = useState("");
  async function save() {
    if (await mutate("rememberFact", { clientId: crypto.randomUUID(), text, dated: false })) onClose();
  }
  if (full) {
    return (
      <p className="text-[16px] leading-[1.45] text-ink-2">
        {COACH_NAME} knows {FACT_LIMIT} things. Forget one to add another.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <NoteBox value={text} max={FACT_MAX} onChange={setText} />
      <p className="text-[14px] leading-[1.4] text-ink-3">{COACH_NAME}'s AI is off, so this is saved as written.</p>
      <button type="button" disabled={!text.trim()} onClick={save} className={`${OUTLINE} self-end`}>
        Save
      </button>
    </div>
  );
}

type Phase = { kind: "edit" } | { kind: "reading" } | { kind: "failed" } | { kind: "result"; cards: ProposalCard[]; today: string };

function AskRocky({ ai, onClose }: { ai: AiState; onClose: () => void }) {
  const client = useSyncClient();
  const mutate = useMutate();
  const hasPlan = useMe()?.hasPlan ?? false;
  useStoreVersion();
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "edit" });
  const [settled, setSettled] = useState<Record<string, "done" | "gone">>({});
  const rows = (table: string) => client?.store.rows(table) ?? [];

  async function send() {
    const today = localDate();
    setPhase({ kind: "reading" });
    setSettled({});
    const reply = await postAi<{ proposals: Proposal[] | null }>("/api/ai/tell", { text, today, context: tellContext(rows, today, hasPlan) }, TELL_WAIT_MS);
    // The proposals are checked against the phone's copy as it is now, just before they show.
    setPhase(reply?.proposals ? { kind: "result", cards: proposalCards(rows, reply.proposals, today, hasPlan), today } : { kind: "failed" });
  }

  async function remember() {
    if (await mutate("rememberFact", { clientId: crypto.randomUUID(), text, dated: false })) onClose();
  }

  async function accept(card: ProposalCard) {
    if (await runAccept(card.accept, mutate)) setSettled((s) => ({ ...s, [card.id]: "done" }));
  }

  // Rebuilt from the store on every render (useStoreVersion), so a card acts on the days as an earlier Accept or a
  // sync left them, not as they were when the reply came.
  const cards = phase.kind === "result" ? refreshCards(rows, phase.cards, phase.today, hasPlan) : [];
  const reading = phase.kind === "reading";
  const sendAs = sendButton(ai, reading);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <NoteBox value={text} max={NOTE_MAX} onChange={setText} />
        <button type="button" onClick={send} disabled={sendAs.disabled || !text.trim()} className={`${OUTLINE} self-end`}>
          {sendAs.label}
        </button>
      </div>
      {phase.kind === "failed" && <KeepIt line={TELL_FAILED} text={text} onRemember={remember} />}
      {phase.kind === "result" && cards.length === 0 && <KeepIt line={resultLine(0)} text={text} onRemember={remember} />}
      {phase.kind === "result" && cards.length > 0 && (
        <>
          <p aria-live="polite" className="text-[15px] leading-[1.4] text-ink-3">
            {resultLine(cards.length)}
          </p>
          <ul className="flex flex-col gap-3">
            {cards
              .filter((c) => settled[c.id] !== "gone")
              .map((c) =>
                settled[c.id] === "done" ? (
                  <li key={c.id} className="text-[15px] text-ink-3">
                    {c.done}
                  </li>
                ) : (
                  <li key={c.id} className="flex flex-col gap-2.5 rounded-[6px] border-[1.5px] border-ink bg-raised px-4 py-3.5">
                    {c.scope && <span className="font-num text-[13px] font-bold uppercase tracking-[0.06em] text-ink-3">{c.scope}</span>}
                    <span className="text-[17px] font-bold leading-[1.3]">{c.title}</span>
                    <span className="text-[14px] leading-[1.35] text-ink-3">{c.sub}</span>
                    <span className="flex items-center gap-[18px]">
                      {c.fits ? (
                        <button type="button" onClick={() => void accept(c)} className={OUTLINE}>
                          Accept
                        </button>
                      ) : (
                        <span className="text-[15px] text-ink-3">{NO_LONGER_FITS}.</span>
                      )}
                      <button type="button" onClick={() => setSettled((s) => ({ ...s, [c.id]: "gone" }))} className={`${btn.quiet} self-center`}>
                        Dismiss
                      </button>
                    </span>
                  </li>
                ),
              )}
          </ul>
        </>
      )}
    </div>
  );
}

/** After no proposals or a fallback: keep the note as written, if it fits in What Rocky knows. */
function KeepIt({ line, text, onRemember }: { line: string; text: string; onRemember: () => void }) {
  return (
    <div className="flex flex-col gap-2.5">
      <p aria-live="polite" className="text-[15px] leading-[1.4] text-ink-3">
        {line}
      </p>
      {text.trim().length > FACT_MAX ? (
        <p className="text-[14px] leading-[1.4] text-ink-3">
          What {COACH_NAME} knows keeps {FACT_MAX} characters a note. Shorten it to keep it.
        </p>
      ) : (
        <button type="button" onClick={onRemember} className={`${OUTLINE} self-start`}>
          Remember it
        </button>
      )}
    </div>
  );
}
