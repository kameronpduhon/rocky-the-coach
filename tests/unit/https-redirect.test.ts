import { describe, expect, it } from "vitest";
import { httpsRedirect } from "../../workers/https";

describe("httpsRedirect", () => {
  it("sends plain http to the same URL on https with a 301", () => {
    const res = httpsRedirect(new Request("http://kampduh.com/meal/salmon-and-rice?slot=dinner"))!;
    expect(res.status).toBe(301);
    expect(res.headers.get("Location")).toBe("https://kampduh.com/meal/salmon-and-rice?slot=dinner");
  });

  it("leaves https alone", () => {
    expect(httpsRedirect(new Request("https://kampduh.com/"))).toBeNull();
  });

  it("leaves local dev alone", () => {
    expect(httpsRedirect(new Request("http://localhost:5199/workout"))).toBeNull();
    expect(httpsRedirect(new Request("http://127.0.0.1:5173/"))).toBeNull();
  });
});
