// Barcodes: read on the phone, looked up on the Worker. Pure, so both sides share it.

/** One Open Food Facts product, as the product card shows it. */
export interface Product {
  code: string;
  name: string;
  /** "1 bottle (414 g)". Null when Open Food Facts has only per-100 g numbers. */
  servingText: string | null;
  /** Per serving, or per 100 g when `servingText` is null. */
  kcal: number;
  proteinG: number;
  /** Open Food Facts files it under beverages. */
  drink: boolean;
}

/** GS1 mod 10: weights 3 and 1 from the right, over every digit but the last. */
export function gtinValid(code: string): boolean {
  if (!/^(\d{8}|\d{12}|\d{13}|\d{14})$/.test(code)) return false;
  const digits = [...code].map(Number);
  const check = digits.pop()!;
  const sum = digits.reverse().reduce((total, d, i) => total + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

/** A UPC-E as the 12-digit UPC-A it stands for. Its check digit belongs to the UPC-A. */
export function expandUpcE(code: string): string | null {
  if (!/^[01]\d{7}$/.test(code)) return null;
  const d = code.slice(1, 7);
  const last = d[5]!;
  let body: string;
  if (last <= "2") body = `${d.slice(0, 2)}${last}0000${d.slice(2, 5)}`;
  else if (last === "3") body = `${d.slice(0, 3)}00000${d.slice(3, 5)}`;
  else if (last === "4") body = `${d.slice(0, 4)}00000${d[4]}`;
  else body = `${d.slice(0, 5)}0000${last}`;
  return `${code[0]}${body}${code[7]}`;
}

/** The code to look up from one detector result, or null when the read is wrong and scanning should go on. */
export function scannedCode(rawValue: string, format: string): string | null {
  const code = format === "upc_e" ? expandUpcE(rawValue) : rawValue;
  return code !== null && gtinValid(code) ? code : null;
}

/** "0 85239 00417 2" for UPC-A, "3 017620 422003" for EAN-13, one run of digits otherwise. */
export function groupDigits(code: string): string {
  if (/^\d{12}$/.test(code)) return `${code[0]} ${code.slice(1, 6)} ${code.slice(6, 11)} ${code[11]}`;
  if (/^\d{13}$/.test(code)) return `${code[0]} ${code.slice(1, 7)} ${code.slice(7)}`;
  return code;
}
