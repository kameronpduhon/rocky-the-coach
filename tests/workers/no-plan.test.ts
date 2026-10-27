import { describe, expect, it } from "vitest";
import { middleware } from "~/routes/app-layout";
import { runAsUser } from "~/server/current-user.server";
import { userById } from "~/server/users.server";

const next = async () => new Response("ok");

async function gate(path: string) {
  const catherine = (await userById(2))!;
  try {
    return await runAsUser(catherine, () => middleware[0]({ request: new Request(`http://localhost${path}`) } as any, next as any));
  } catch (e) {
    return e as Response;
  }
}

describe("without a plan", () => {
  it("sends plan-only screens back to Today", async () => {
    for (const path of ["/plan", "/progress", "/workout", "/meal/chicken-and-rice-bowl", "/check-in", "/groceries", "/plan.data"]) {
      const res = (await gate(path)) as Response;
      expect(res.status, path).toBe(302);
      expect(res.headers.get("Location"), path).toBe("/");
    }
  });

  it("lets Today, Library and Settings open", async () => {
    for (const path of ["/", "/library", "/settings"]) expect(((await gate(path)) as Response).status, path).toBe(200);
  });
});
