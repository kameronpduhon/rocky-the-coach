// The Scan view's states once the camera has stopped, as pure copy and buttons, so each one can be tested.
import { groupDigits } from "~/ai/barcode";
import { APP_NAME } from "~/brand";

export type ScanState =
  | { kind: "camera" }
  /** The person said no to the camera. */
  | { kind: "blocked" }
  /** The decoder (or its wasm) didn't load, or the camera failed for another reason. */
  | { kind: "noScanner" }
  | { kind: "looking"; code: string }
  | { kind: "notFound"; code: string }
  /** Open Food Facts was down or too slow, or there was no signal: the product may well be there. */
  | { kind: "down"; code: string }
  | { kind: "reading" }
  | { kind: "unreadable" };

export type Ended = Extract<ScanState, { kind: "blocked" | "noScanner" | "notFound" | "down" | "unreadable" }>;

const ENDED = new Set<ScanState["kind"]>(["blocked", "noScanner", "notFound", "down", "unreadable"]);

/** The camera has stopped and the view shows a line and its buttons. */
export const isEnded = (s: ScanState): s is Ended => ENDED.has(s.kind);

/** What a button does: look the same code up again, restart the camera, scan another code, photograph the label, or type. */
export type ScanDo = "retry" | "camera" | "scan" | "label" | "type";

export interface ScanAction {
  do: ScanDo;
  label: string;
  /** The one outlined button; the rest are quiet links. */
  main: boolean;
}

export interface ScanOutcome {
  heading: string | null;
  line: string;
  actions: ScanAction[];
}

/** Only a refused permission is the camera being off. Anything else thrown while starting is the scanner not loading. */
export function scanFailure(err: unknown): "blocked" | "noScanner" {
  return (err as { name?: unknown } | null)?.name === "NotAllowedError" ? "blocked" : "noScanner";
}

function actions(list: [ScanDo, string][]): ScanAction[] {
  return list.map(([what, label], i) => ({ do: what, label, main: i === 0 }));
}

export function scanOutcome(state: Ended, ai: boolean): ScanOutcome {
  const type: [ScanDo, string] = ["type", "Type the numbers"];
  switch (state.kind) {
    case "notFound": {
      const code = groupDigits(state.code);
      return {
        heading: "Not in Open Food Facts.",
        line: ai ? `Barcode ${code} has no listing. A photo of the nutrition label works instead.` : `Barcode ${code} has no listing.`,
        actions: actions([...(ai ? [["label", "Read the label instead"] as [ScanDo, string]] : []), ["scan", "Scan again"], type]),
      };
    }
    case "down":
      return {
        heading: "Open Food Facts didn't answer.",
        line: `Barcode ${groupDigits(state.code)} couldn't be looked up just now.`,
        actions: actions([["retry", "Try again"], ...(ai ? [["label", "Read the label instead"] as [ScanDo, string]] : []), ["scan", "Scan again"], type]),
      };
    case "noScanner":
      return { heading: null, line: "The scanner didn't load. Check your signal and try again.", actions: actions([["camera", "Try again"], ...(ai ? [["label", "Read the label"] as [ScanDo, string]] : []), type]) };
    case "blocked":
      return {
        heading: null,
        line: `The camera is off for ${APP_NAME}. Allow it in your iPhone's settings, or type the numbers.`,
        actions: actions([...(ai ? [["label", "Read the label"] as [ScanDo, string]] : []), type]),
      };
    case "unreadable":
      return { heading: null, line: "Couldn't read that label. Try again with the panel flat and in focus.", actions: actions([["label", "Take another photo"], type]) };
  }
}
