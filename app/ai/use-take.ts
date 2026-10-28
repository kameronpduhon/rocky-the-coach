import { useEffect, useMemo, useState } from "react";
import type { CheckInDigest } from "~/checkin/digest";
import type { Take } from "~/checkin/take";
import type { ISODate } from "~/domain/types";
import { voiceOf } from "~/settings/model";
import { useSyncClient, useTable } from "~/sync/react";
import { postAi } from "./client";
import { chooseTake, takeHash, takeLines, type TakeView } from "./take";
import { useAi } from "./use-ai";
import { PHONE_WAIT_MS } from "./waits";

/** The phone waits this long for a new take, then shows the rule take. */
export const TAKE_WAIT_MS = PHONE_WAIT_MS.take;

/**
 * Rocky's take for the check-in card: the stored AI take when it matches the week, a new one asked for once while the
 * check-in is open, or the rule take (spec section 2, "When it is written and shown").
 */
export function useTake({ week, digest, rule, writable }: { week: ISODate; digest: CheckInDigest; rule: Take; writable: boolean }): TakeView {
  const ai = useAi();
  const client = useSyncClient();
  const voice = voiceOf(useTable("profile"));
  const row = useTable("takes").find((r) => r.week_start === week);
  const lines = useMemo(() => takeLines(digest, rule), [digest, rule]);
  // The model is rebuilt on every store change; the key only moves when the lines or the voice really do.
  const key = JSON.stringify([voice, ...lines]);

  const [hashed, setHashed] = useState<{ key: string; hash: string } | null>(null);
  useEffect(() => {
    let live = true;
    void takeHash(lines, voice).then((hash) => {
      if (live) setHashed({ key, hash });
    });
    return () => {
      live = false;
    };
  }, [key]);
  const hash = hashed?.key === key ? hashed.hash : null;

  const [fresh, setFresh] = useState<{ text: string; hash: string } | null>(null);
  const [asked, setAsked] = useState<{ hash: string; pending: boolean } | null>(null);
  const stored = row ? { text: String(row.text), hash: String(row.hash) } : null;
  const { view, ask } = chooseTake({ aiOn: ai.on, available: ai.available, checking: ai.checking, online: ai.online, writable, hash, stored, fresh, asked }, lines);

  useEffect(() => {
    if (!ask || !hash) return;
    setAsked({ hash, pending: true });
    void postAi<{ text: string | null }>("/api/ai/take", { weekStart: week, lines, voice }, TAKE_WAIT_MS).then((reply) => {
      if (reply?.text) {
        setFresh({ text: reply.text, hash });
        // The Worker stored the row; pull it so a reload reads it at once.
        void client?.sync();
      }
      setAsked({ hash, pending: false });
    });
  }, [ask, hash]);

  return view;
}
