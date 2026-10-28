// The barcode decoder. iOS browsers are WebKit, which has no native BarcodeDetector, so this is the barcode-detector
// ponyfill over zxing-wasm. It loads only when Scan opens.
import wasmUrl from "zxing-wasm/reader/zxing_reader.wasm?url";
import { scannedCode } from "./barcode";

const EVERY_MS = 200;
const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e"];

export interface Detected {
  rawValue: string;
  format: string;
}

/** A detector for the four retail formats. The .wasm comes from our own assets, never jsDelivr, so it works offline. */
export async function loadDetector(): Promise<{ detect: (source: HTMLVideoElement) => Promise<Detected[]> }> {
  const { BarcodeDetector, prepareZXingModule } = await import("barcode-detector/ponyfill");
  await prepareZXingModule({
    overrides: { locateFile: (path: string, prefix: string) => (path.endsWith(".wasm") ? wasmUrl : prefix + path) },
    fireImmediately: true,
  });
  return new BarcodeDetector({ formats: FORMATS as never });
}

/** Looks for a code about 5 times a second until one passes its check digit. Returns a stop function. */
export function startScanning(detect: () => Promise<Detected[]>, onCode: (code: string) => void, everyMs = EVERY_MS): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const look = async () => {
    if (stopped) return;
    let code: string | null = null;
    try {
      for (const d of await detect()) code ??= scannedCode(d.rawValue, d.format);
    } catch {
      // A frame that fails to decode is skipped.
    }
    if (stopped) return;
    if (code) {
      stopped = true;
      onCode(code);
      return;
    }
    timer = setTimeout(look, everyMs);
  };
  timer = setTimeout(look, 0);
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}
