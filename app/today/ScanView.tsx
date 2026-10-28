import { useEffect, useRef, useState } from "react";
import { APP_NAME } from "~/brand";
import { groupDigits } from "~/ai/barcode";
import { findBarcode, readLabel } from "~/ai/client";
import { jpegForUpload } from "~/ai/photo";
import { loadDetector, startScanning } from "~/ai/scanner";
import { btn } from "~/ui/button";
import { cardFromProduct, labelOutcome, type CardSource, type FormValues } from "./offplan";

type ScanState =
  | { kind: "camera" }
  | { kind: "blocked" }
  | { kind: "looking"; code: string }
  | { kind: "notFound"; code: string; down: boolean }
  | { kind: "reading" }
  | { kind: "unreadable" };

const LINE = "text-[15px] leading-[1.4] text-ink-3";

/** Option 3B's scan: a barcode first, the label when there is none (AI on), typing always. */
export function ScanView({ ai, onCard, onForm }: { ai: boolean; onCard: (card: CardSource) => void; onForm: (values?: FormValues, note?: string) => void }) {
  const [state, setState] = useState<ScanState>({ kind: "camera" });
  const video = useRef<HTMLVideoElement>(null);
  const picker = useRef<HTMLInputElement>(null);

  // The rear camera runs only while the viewfinder shows. Leaving it stops every track.
  useEffect(() => {
    if (state.kind !== "camera") return;
    let gone = false;
    let stream: MediaStream | null = null;
    let stop = () => {};
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        if (gone) return;
        const el = video.current!;
        el.srcObject = stream;
        await el.play();
        const detector = await loadDetector();
        if (gone) return;
        stop = startScanning(() => detector.detect(el), (code) => setState({ kind: "looking", code }));
      } catch {
        if (!gone) setState({ kind: "blocked" });
      }
    })();
    return () => {
      gone = true;
      stop();
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [state.kind]);

  useEffect(() => {
    if (state.kind !== "looking") return;
    let gone = false;
    void findBarcode(state.code).then((r) => {
      if (gone) return;
      if (r.found) onCard(cardFromProduct(r.product));
      else setState({ kind: "notFound", code: state.code, down: r.down });
    });
    return () => {
      gone = true;
    };
  }, [state]);

  const readPhoto = async (file: File) => {
    setState({ kind: "reading" });
    let image: string;
    try {
      image = await jpegForUpload(file);
    } catch {
      // A photo the browser can't decode reads the same as a label the model couldn't.
      setState({ kind: "unreadable" });
      return;
    }
    const outcome = labelOutcome(await readLabel(image));
    if (outcome.kind === "card") onCard(outcome.card);
    else if (outcome.kind === "form") onForm(outcome.values, outcome.note);
    else setState({ kind: "unreadable" });
  };
  const pickPhoto = () => picker.current?.click();
  const typeIt = (
    <button type="button" onClick={() => onForm()} className={btn.quiet}>
      Type the numbers
    </button>
  );

  return (
    <div className="flex flex-col gap-4">
      <input
        ref={picker}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          e.currentTarget.value = "";
          if (file) void readPhoto(file);
        }}
      />

      {state.kind === "camera" && (
        <>
          <div className="relative aspect-[4/3] overflow-hidden rounded-[6px] bg-ink">
            <video ref={video} muted playsInline autoPlay className="size-full object-cover" />
            <div aria-hidden className="absolute inset-x-[18%] inset-y-[30%] rounded-[6px] border-2 border-paper/40" />
          </div>
          {ai && (
            <button type="button" onClick={pickPhoto} className={btn.quiet}>
              No barcode? Read the label
            </button>
          )}
        </>
      )}

      {state.kind === "looking" && (
        <p className={LINE} aria-live="polite">
          Looking up {groupDigits(state.code)}
        </p>
      )}

      {state.kind === "notFound" && (
        <>
          <div className="flex flex-col gap-1">
            <p className="text-[17px] font-bold">Not in Open Food Facts.</p>
            <p className={LINE}>
              {state.down
                ? "Open Food Facts didn't answer. Try again in a minute."
                : ai
                  ? `Barcode ${groupDigits(state.code)} has no listing. A photo of the nutrition label works instead.`
                  : `Barcode ${groupDigits(state.code)} has no listing.`}
            </p>
          </div>
          {ai && (
            <button type="button" onClick={pickPhoto} className={`${btn.outline} h-14 text-[17px]`}>
              Read the label instead
            </button>
          )}
          {typeIt}
        </>
      )}

      {state.kind === "blocked" && (
        <>
          <p className={LINE}>The camera is off for {APP_NAME}. Allow it in your iPhone's settings, or type the numbers.</p>
          {ai && (
            <button type="button" onClick={pickPhoto} className={`${btn.outline} h-14 text-[17px]`}>
              Read the label
            </button>
          )}
          {typeIt}
        </>
      )}

      {state.kind === "reading" && (
        <p className={LINE} aria-live="polite">
          Reading the label
        </p>
      )}

      {state.kind === "unreadable" && (
        <>
          <p className={LINE}>Couldn't read that label. Try again with the panel flat and in focus.</p>
          <button type="button" onClick={pickPhoto} className={`${btn.outline} h-14 text-[17px]`}>
            Take another photo
          </button>
          {typeIt}
        </>
      )}
    </div>
  );
}
