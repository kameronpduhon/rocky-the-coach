import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "~/server/password";

describe("password", () => {
  it("verifies the right password and rejects a wrong one", async () => {
    const stored = await hashPassword("correct horse");
    expect(await verifyPassword("correct horse", stored)).toBe(true);
    expect(await verifyPassword("correct hors", stored)).toBe(false);
  });

  it("stores iterations, salt and hash, and salts every hash", async () => {
    const a = await hashPassword("same");
    const b = await hashPassword("same");
    expect(a).toMatch(/^pbkdf2\$100000\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
    expect(a).not.toBe(b);
  });

  it("rejects when there is no stored hash or it is malformed", async () => {
    expect(await verifyPassword("anything", null)).toBe(false);
    expect(await verifyPassword("anything", "plain-text")).toBe(false);
  });
});
