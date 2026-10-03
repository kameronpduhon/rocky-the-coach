import { expect, it } from "vitest";
it("runs unit tests in node", () => {
  expect(typeof process.versions.node).toBe("string");
});
