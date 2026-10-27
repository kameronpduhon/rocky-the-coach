import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { logWeighIn } from "~/server/body.server";
import { allUsers, credentialsFor, isLockedOut, personDb, recordFailure, userByBinding, userById, userByIngestToken } from "~/server/users.server";
import { setIngestToken, setPassword } from "./helpers";

describe("users", () => {
  it("finds people by id, binding and token", async () => {
    expect(await userById(2)).toMatchObject({ id: 2, name: "Catherine", dbBinding: "DB_CATHERINE", planKey: null });
    expect(await userByBinding("DB")).toMatchObject({ id: 1, name: "Kameron", planKey: "kameron" });
    await setIngestToken("catherine", "cat-token");
    expect((await userByIngestToken("cat-token"))?.name).toBe("Catherine");
    expect(await userByIngestToken("nope")).toBeNull();
    expect((await allUsers()).map((u) => u.name)).toEqual(["Kameron", "Catherine"]);
  });

  it("looks up credentials by name, ignoring case and spaces", async () => {
    await setPassword("kameron", "pw-kameron");
    const found = await credentialsFor("  KAMERON ");
    expect(found?.user.name).toBe("Kameron");
    expect(found?.passwordHash).toMatch(/^pbkdf2\$/);
    expect(await credentialsFor("nobody")).toBeNull();
  });

  it("keeps each person's data in their own database", async () => {
    const catherine = (await userById(2))!;
    await logWeighIn(personDb(catherine), "2026-10-27", 140.2, new Date());
    expect(await env.DB_CATHERINE.prepare("select weight_lb from weigh_ins").first()).toEqual({ weight_lb: 140.2 });
    expect(await env.DB.prepare("select count(*) as n from weigh_ins where date = '2026-10-27'").first()).toEqual({ n: 0 });
  });

  it("locks an IP out after 5 failures in 15 minutes", async () => {
    const now = new Date("2026-10-27T12:00:00Z");
    for (let i = 0; i < 5; i++) await recordFailure("192.0.2.9", now);
    expect(await isLockedOut("192.0.2.9", now)).toBe(true);
    expect(await isLockedOut("192.0.2.9", new Date("2026-10-27T12:16:00Z"))).toBe(false);
  });
});
