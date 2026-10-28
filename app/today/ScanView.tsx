import { useEffect, useRef, useState } from "react";
import { groupDigits } from "~/ai/barcode";
import { findBarcode, readLabel } from "~/ai/client";
import { jpegForUpload } from "~/ai/photo";
import { loadDetector, startScanning } from "~/ai/scanner";
import { btn } from "~/ui/button";
import { cardFromProduct, labelOutcome, type CardSource, type FormValues } from "./offplan";
import { isEnded, scanFailure, scanOutcome, type ScanDo, type ScanState } from "./scan";

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
      } catch (err) {
        if (!gone) setState({ kind: scanFailure(err) });
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
      else setState({ kind: r.down ? "down" : "notFound", code: state.code });
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
  const run = (what: ScanDo) => {
    if (what === "label") pickPhoto();
    else if (what === "type") onForm();
    else if (what === "retry" && (state.kind === "down" || state.kind === "notFound")) setState({ kind: "looking", code: state.code });
    else setState({ kind: "camera" });
  };
  const ending = isEnded(state) ? scanOutcome(state, ai) : null;

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

      {ending && (
        <>
          <div className="flex flex-col gap-1">
            {ending.heading && <p className="text-[17px] font-bold">{ending.heading}</p>}
            <p className={LINE}>{ending.line}</p>
          </div>
          {ending.actions.map((a) => (
            <button key={a.do} type="button" onClick={() => run(a.do)} className={a.main ? `${btn.outline} h-14 text-[17px]` : btn.quiet}>
              {a.label}
            </button>
          ))}
        </>
      )}

      {state.kind === "reading" && (
        <p className={LINE} aria-live="polite">
          Reading the label
        </p>
      )}

    </div>
  );
}
