import { useEffect, useState } from "react";
import { aiOn } from "~/settings/model";
import { useSyncStatus, useTable } from "~/sync/react";
import { aiAvailable, cachedAiStatus } from "./client";

export interface AiState {
  /** The person's switch. */
  on: boolean;
  /** Whether the server has a key; null until it has answered. */
  available: boolean | null;
  /** The status ask is still out. False once it has answered or failed, so nothing waits on a lost answer. */
  checking: boolean;
  online: boolean;
  /** An AI request can go now. Entry points that need a signal show "Needs a signal" when on and available but not ready. */
  ready: boolean;
}

export function useAi(): AiState {
  const on = aiOn(useTable("profile"));
  const online = useSyncStatus()?.online ?? true;
  const [available, setAvailable] = useState<boolean | null>(cachedAiStatus);
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    if (available !== null || !online) return;
    let live = true;
    setSettled(false);
    void aiAvailable().then((a) => {
      if (!live) return;
      setAvailable(a);
      setSettled(true);
    });
    return () => {
      live = false;
    };
  }, [available, online]);
  return { on, available, checking: available === null && online && !settled, online, ready: on && available === true && online };
}
