import { describe, expect, it } from "vitest";
import { expandUpcE, groupDigits, gtinValid, scannedCode } from "~/ai/barcode";

describe("gtinValid", () => {
  it("passes a good check digit at each GTIN length", () => {
    expect(gtinValid("96385074")).toBe(true); // GTIN-8
    expect(gtinValid("036000291452")).toBe(true); // UPC-A
    expect(gtinValid("4006381333931")).toBe(true); // EAN-13
    expect(gtinValid("10012345678902")).toBe(true); // GTIN-14
  });

  it("fails a bad check digit, a wrong length or a letter", () => {
    expect(gtinValid("036000291453")).toBe(false);
    expect(gtinValid("12345")).toBe(false);
    expect(gtinValid("0360002914521")).toBe(false);
    expect(gtinValid("03600029145a")).toBe(false);
  });
});

describe("expandUpcE", () => {
  it("expands each UPC-E pattern to the UPC-A it stands for", () => {
    expect(expandUpcE("01234565")).toBe("012345000065");
    expect(expandUpcE("04252614")).toBe("042100005264");
    expect(expandUpcE("00123457")).toBe("001234000057");
  });

  it("refuses anything that isn't an 8-digit UPC-E", () => {
    expect(expandUpcE("21234565")).toBeNull();
    expect(expandUpcE("0123456")).toBeNull();
  });
});

describe("scannedCode", () => {
  it("keeps a good EAN-13 and UPC-A as read", () => {
    expect(scannedCode("4006381333931", "ean_13")).toBe("4006381333931");
    expect(scannedCode("036000291452", "upc_a")).toBe("036000291452");
  });

  it("looks up a UPC-E as its UPC-A", () => {
    expect(scannedCode("01234565", "upc_e")).toBe("012345000065");
  });

  it("reads an EAN-13 with a leading 0 as the UPC-A printed on the package", () => {
    expect(scannedCode("0811620021982", "ean_13")).toBe("811620021982");
    expect(scannedCode("0089876543217", "ean_13")).toBe("089876543217");
  });

  it("drops a read with a bad check digit, so scanning goes on", () => {
    expect(scannedCode("036000291453", "upc_a")).toBeNull();
    expect(scannedCode("01234564", "upc_e")).toBeNull();
  });
});

describe("groupDigits", () => {
  it("groups UPC-A 1-5-5-1 and EAN-13 1-6-6", () => {
    expect(groupDigits("085239004172")).toBe("0 85239 00417 2");
    expect(groupDigits("3017620422003")).toBe("3 017620 422003");
  });

  it("leaves anything else as one run", () => {
    expect(groupDigits("96385074")).toBe("96385074");
    expect(groupDigits("10012345678902")).toBe("10012345678902");
  });
});
