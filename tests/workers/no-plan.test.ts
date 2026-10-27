import { describe, expect, it } from "vitest";
import { middleware } from "~/routes/app-layout";
import { loader as todayLoader } from "~/routes/today";
import { runAsUser } from "~/server/current-user.server";
import { logWeighIn, upsertSteps } from "~/server/body.server";
import { personDb, userById } from "~/server/users.server";
import { localDate } from "~/domain/dates";
import { routeArgs } from "./helpers";

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

  it("shows Today's weigh-in and steps instead of a plan", async () => {
    const catherine = (await userById(2))!;
    await logWeighIn(personDb(catherine), localDate(), 141.4, new Date());
    await upsertSteps(personDb(catherine), localDate(), 5200, new Date());
    const data = await runAsUser(catherine, () => todayLoader(routeArgs(new Request("http://localhost/"))));
    expect(data).toEqual({ noPlan: true, name: "Catherine", date: localDate(), weighIn: 141.4, steps: 5200 });
  });
});
