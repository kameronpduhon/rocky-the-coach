import { describe, expect, it } from "vitest";
import { APP_NAME } from "~/brand";
import { scanFailure, scanOutcome } from "~/today/scan";

const CODE = "085239004172";

describe("scanFailure", () => {
  it("keeps the permission state for a camera the person said no to, and calls anything else the scanner not loading", () => {
    expect(scanFailure(new DOMException("denied", "NotAllowedError"))).toBe("blocked");
    expect(scanFailure({ name: "NotAllowedError" })).toBe("blocked");
    expect(scanFailure(new TypeError("Failed to fetch dynamically imported module"))).toBe("noScanner");
    expect(scanFailure(new Error("wasm instantiate failed"))).toBe("noScanner");
    expect(scanFailure(new DOMException("in use", "NotReadableError"))).toBe("noScanner");
  });
});

describe("scanOutcome", () => {
  it("not found: names the barcode, offers the label with the AI on, and scanning again", () => {
    expect(scanOutcome({ kind: "notFound", code: CODE }, true)).toEqual({
      heading: "Not in Open Food Facts.",
      line: "Barcode 0 85239 00417 2 has no listing. A photo of the nutrition label works instead.",
      actions: [
        { do: "label", label: "Read the label instead", main: true },
        { do: "scan", label: "Scan again", main: false },
        { do: "type", label: "Type the numbers", main: false },
      ],
    });
    expect(scanOutcome({ kind: "notFound", code: CODE }, false)).toEqual({
      heading: "Not in Open Food Facts.",
      line: "Barcode 0 85239 00417 2 has no listing.",
      actions: [
        { do: "scan", label: "Scan again", main: true },
        { do: "type", label: "Type the numbers", main: false },
      ],
    });
  });

  it("down or slow: says Open Food Facts didn't answer, never that the product isn't there", () => {
    const down = scanOutcome({ kind: "down", code: CODE }, true);
    expect(down.heading).toBe("Open Food Facts didn't answer.");
    expect(down.line).not.toContain("Not in");
    expect(down.actions).toEqual([
      { do: "retry", label: "Try again", main: true },
      { do: "label", label: "Read the label instead", main: false },
      { do: "scan", label: "Scan again", main: false },
      { do: "type", label: "Type the numbers", main: false },
    ]);
    expect(scanOutcome({ kind: "down", code: CODE }, false).actions.map((a) => a.do)).toEqual(["retry", "scan", "type"]);
  });

  it("a scanner that didn't load asks for a signal and a retry, apart from a camera that is off", () => {
    expect(scanOutcome({ kind: "noScanner" }, true)).toEqual({
      heading: null,
      line: "The scanner didn't load. Check your signal and try again.",
      actions: [
        { do: "camera", label: "Try again", main: true },
        { do: "label", label: "Read the label", main: false },
        { do: "type", label: "Type the numbers", main: false },
      ],
    });
    expect(scanOutcome({ kind: "blocked" }, true)).toEqual({
      heading: null,
      line: `The camera is off for ${APP_NAME}. Allow it in your iPhone's settings, or type the numbers.`,
      actions: [
        { do: "label", label: "Read the label", main: true },
        { do: "type", label: "Type the numbers", main: false },
      ],
    });
  });

  it("an unreadable label asks for another photo", () => {
    expect(scanOutcome({ kind: "unreadable" }, true)).toEqual({
      heading: null,
      line: "Couldn't read that label. Try again with the panel flat and in focus.",
      actions: [
        { do: "label", label: "Take another photo", main: true },
        { do: "type", label: "Type the numbers", main: false },
      ],
    });
  });
});
