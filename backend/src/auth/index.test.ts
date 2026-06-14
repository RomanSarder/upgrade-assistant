import { describe, it, expect } from "vitest";
import { buildApp, mockDb, mockDbMulti } from "../test-utils";
import authPlugin from "./index";

const USER = {
  id: "00000000-0000-0000-0000-000000000001",
  email: "test@example.com",
  createdAt: new Date(),
};

const MAGIC_LINK = {
  token: "validtoken123456789012",
  userId: USER.id,
  expiresAt: new Date(Date.now() + 900_000),
};

function build(db: any) {
  const app = buildApp(db);
  app.register(authPlugin);
  return app;
}

describe("POST /auth/sign-in", () => {
  it("returns 200 for a valid email", async () => {
    // DB calls: insert users → [user], insert magic_link_tokens → [magicLink]
    const app = build(mockDbMulti([USER], [MAGIC_LINK]));
    const res = await app.inject({
      method: "POST",
      url: "/auth/sign-in",
      payload: { email: USER.email },
    });
    expect(res.statusCode).toBe(200);
  });

  it("returns 400 for an invalid email format", async () => {
    const app = build(mockDb([]));
    const res = await app.inject({
      method: "POST",
      url: "/auth/sign-in",
      payload: { email: "not-an-email" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 when email is missing", async () => {
    const app = build(mockDb([]));
    const res = await app.inject({
      method: "POST",
      url: "/auth/sign-in",
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("POST /auth/token/verify", () => {
  it("returns 200 and sets cookie for a valid token", async () => {
    // DB calls: select magic_link_tokens → [magicLink], insert sessions → [], delete magic_link_tokens → []
    const app = build(mockDbMulti([MAGIC_LINK], [], []));
    const res = await app.inject({
      method: "POST",
      url: "/auth/token/verify",
      query: { token: MAGIC_LINK.token },
    });
    expect(res.statusCode).toBe(200);
    const setCookie = res.headers["set-cookie"] as string;
    expect(setCookie).toMatch(/upgrade_advisor_token=/);
    const cookieValue = setCookie.split("upgrade_advisor_token=")[1].split(";")[0];
    expect(cookieValue.split(".")).toHaveLength(2);
    expect(setCookie).toMatch(/HttpOnly/i);
  });

  it("returns 401 when token is not found", async () => {
    // DB call: select magic_link_tokens → []
    const app = build(mockDbMulti([]));
    const res = await app.inject({
      method: "POST",
      url: "/auth/token/verify",
      query: { token: "nonexistenttoken12345" },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().message).toBe("Invalid credentials");
  });

  it("returns 400 when token query param is missing", async () => {
    const app = build(mockDb([]));
    const res = await app.inject({
      method: "POST",
      url: "/auth/token/verify",
    });
    expect(res.statusCode).toBe(400);
  });
});
