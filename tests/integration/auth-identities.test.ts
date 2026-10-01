import mongoose from "mongoose";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import User from "@/models/User";
import LoginSwitchRequest from "@/models/LoginSwitchRequest";
import {
  startTestMongo,
  createTestAuthIndexes,
  clearTestMongo,
  stopTestMongo,
} from "../utils/mongodb";

const providerBoundary = vi.hoisted(() => ({
  email: "member@iitg.ac.in",
  verified: true,
  identity: "ms-identity",
  tenant: "test-tenant-id",
  validToken: true,
}));
vi.mock("better-auth/social-providers", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("better-auth/social-providers")>();
  const profile = () => ({
    user: {
      id: providerBoundary.identity,
      email: providerBoundary.email,
      emailVerified: providerBoundary.verified,
      name: "Provider name",
    },
    data: { tid: providerBoundary.tenant },
  });
  return {
    ...actual,
    microsoft: (options: Parameters<typeof actual.microsoft>[0]) => ({
      ...actual.microsoft(options),
      getUserInfo: async () => profile(),
    }),
    google: (options: Parameters<typeof actual.google>[0]) => ({
      ...actual.google(options),
      getUserInfo: async () => profile(),
      validateAuthorizationCode: async () => ({
        idToken: "verified-by-provider-boundary",
        accessToken: "discard-this-token",
      }),
    }),
    verifyGoogleIdToken: async () => (providerBoundary.validToken ? {} : null),
  };
});
vi.mock("@/lib/userRateLimit", () => ({
  consumeUserRateLimit: async () => ({ allowed: true }),
}));
vi.mock("@/lib/push/config", () => ({ webPushConfigured: false }));
vi.mock("@/lib/push/queue", () => ({
  pushNotificationQueue: { addBulk: vi.fn() },
}));

let auth: typeof import("@/lib/auth").auth;
const origin = "http://127.0.0.1:3000";
function cookieHeader(response: Response) {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .filter((cookie) => cookie.slice(cookie.indexOf("=") + 1).length > 0)
    .join("; ");
}
async function post(path: string, body: unknown, cookie = "") {
  return auth.handler(
    new Request(`${origin}/api/auth${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin, cookie },
      body: JSON.stringify(body),
    }),
  );
}
async function start(provider: "microsoft" | "google", cookie = "") {
  const response = await post(
    "/sign-in/social",
    { provider, callbackURL: "/internal/profile", errorCallbackURL: "/" },
    cookie,
  );
  const data = await response.json();
  expect(response.status, JSON.stringify(data)).toBe(200);
  const state = new URL(data.url).searchParams.get("state")!;
  return {
    state,
    cookie: [cookie, cookieHeader(response)].filter(Boolean).join("; "),
  };
}
async function finish(
  provider: string,
  flow: { state: string; cookie: string },
) {
  return auth.handler(
    new Request(
      `${origin}/api/auth/callback/${provider}?state=${flow.state}&code=mock-code`,
      { headers: { cookie: flow.cookie } },
    ),
  );
}
async function login(provider: "microsoft" | "google") {
  return finish(provider, await start(provider));
}
async function session(cookie: string) {
  return auth.api.getSession({ headers: new Headers({ cookie }) });
}

async function instituteLogin() {
  const user = await User.create({
    name: "Member",
    email: "member@iitg.ac.in",
    emailVerified: true,
  });
  const response = await login("microsoft");
  expect(response.headers.get("location")).toContain("/internal/profile");
  return { user, cookie: cookieHeader(response) };
}

describe("approved Better Auth identities and endpoints", () => {
  beforeAll(async () => {
    process.env.GOOGLE_CLIENT_ID = "test-google-client";
    process.env.GOOGLE_CLIENT_SECRET = "test-google-secret";
    await startTestMongo();
    await createTestAuthIndexes();
    await User.init();
    await LoginSwitchRequest.init();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input instanceof Request ? input.url : input);
        if (/login\.microsoftonline\.com|oauth2\.googleapis\.com/.test(url))
          return new Response(
            JSON.stringify({
              access_token: "mock-access",
              id_token: "mock-id",
              token_type: "Bearer",
              expires_in: 3600,
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        throw new Error("Unexpected OAuth network call");
      }),
    );
    ({ auth } = await import("@/lib/auth"));
  });
  afterEach(async () => {
    await clearTestMongo();
    Object.assign(providerBoundary, {
      email: "member@iitg.ac.in",
      verified: true,
      identity: "ms-identity",
      tenant: "test-tenant-id",
      validToken: true,
    });
  });
  afterAll(async () => {
    vi.unstubAllGlobals();
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    await stopTestMongo();
  });

  it.each(["microsoft", "google"] as const)(
    "attaches first %s login only to approved users and repeats without duplicate identities",
    async (provider) => {
      providerBoundary.email =
        provider === "google" ? "alumni@gmail.com" : "member@iitg.ac.in";
      providerBoundary.identity = `${provider}-identity`;
      const user = await User.create({
        name: "Approved",
        email: providerBoundary.email,
        emailVerified: true,
      });
      for (let attempt = 0; attempt < 2; attempt++) {
        const response = await login(provider);
        expect(response.headers.get("location")).toContain("/internal/profile");
        const current = await session(cookieHeader(response));
        expect(current?.user.id).toBe(user.id);
        expect(current?.session.authProvider).toBe(provider);
      }
      expect(
        await mongoose.connection
          .db!.collection("account")
          .countDocuments({ userId: user._id }),
      ).toBe(1);
      expect(await User.countDocuments()).toBe(1);
    },
  );

  it("rejects unapproved, wrong provider/domain, unverified Google and wrong tenant", async () => {
    expect((await login("microsoft")).headers.get("location")).toContain(
      "error=unapproved",
    );
    await User.create({ email: "member@iitg.ac.in", emailVerified: true });
    expect((await login("google")).headers.get("location")).toContain(
      "error=incorrect_provider",
    );
    providerBoundary.tenant = "other-tenant";
    expect((await login("microsoft")).headers.get("location")).toContain(
      "error=incorrect_provider",
    );
    providerBoundary.email = "alumni@gmail.com";
    providerBoundary.verified = false;
    await User.create({ email: "alumni@gmail.com", emailVerified: true });
    expect((await login("google")).headers.get("location")).toContain(
      "error=incorrect_provider",
    );
    providerBoundary.verified = true;
    providerBoundary.validToken = false;
    expect((await login("google")).headers.get("location")).toContain(
      "error=incorrect_provider",
    );
    expect(
      await mongoose.connection.db!.collection("session").countDocuments(),
    ).toBe(0);
  });

  it("blocks explicit signup, linking, unlinking, email changes and protected updates", async () => {
    const { user, cookie } = await instituteLogin();
    for (const [path, body] of [
      ["/sign-in/social", { provider: "google", requestSignUp: true }],
      ["/sign-in/social", { provider: "google", idToken: { token: "bypass" } }],
      ["/link-social", { provider: "google" }],
      ["/unlink-account", { providerId: "microsoft" }],
      ["/change-email", { newEmail: "different@gmail.com" }],
    ] as const)
      expect((await post(path, body, cookie)).status, path).toBe(403);
    await post(
      "/update-user",
      {
        access: "Admin",
        roles: '[{"position":"Secretary"}]',
        managedModules: '["Design"]',
        tenure: "2000-01",
        pizza_count: 999,
        instituteEmail: "fake@iitg.ac.in",
      },
      cookie,
    );
    expect(await User.findById(user.id).lean()).toMatchObject({
      access: "Member",
      roles: [],
      managedModules: [],
      pizza_count: 0,
      tenure: "2026-27",
    });
    expect(await User.findById(user.id).lean()).not.toHaveProperty(
      "instituteEmail",
    );
  });

  it("invalidates legacy Microsoft sessions after a switch and rejects in-flight old callbacks", async () => {
    const { user, cookie } = await instituteLogin();
    const store = mongoose.connection.db!;
    await store
      .collection("session")
      .updateMany({}, { $unset: { authProvider: "" } });
    expect((await session(cookie))?.user.id).toBe(user.id);
    const inflight = await start("microsoft");
    await User.updateOne(
      { _id: user._id },
      {
        $set: {
          email: "alumni@gmail.com",
          instituteEmail: "member@iitg.ac.in",
        },
      },
    );
    await store
      .collection("account")
      .updateOne(
        { userId: user._id },
        { $set: { providerId: "google", accountId: "google-new" } },
      );
    expect(await session(cookie)).toBeNull();
    expect(
      (await finish("microsoft", inflight)).headers.get("location"),
    ).toContain("error=unapproved");
    expect(await store.collection("session").countDocuments()).toBe(0);
  });

  it("rejects stale-provider sessions on direct Better Auth endpoints", async () => {
    const { user, cookie } = await instituteLogin();
    await User.updateOne(
      { _id: user._id },
      { $set: { email: "alumni@gmail.com" } },
    );
    const response = await post(
      "/update-user",
      { name: "Should not change" },
      cookie,
    );
    expect(response.status).toBe(401);
    expect((await User.findById(user.id))?.name).toBe("Member");
  });

  it("binds switch verification to one session and purpose, consumes state once and never logs in Google", async () => {
    const { user, cookie } = await instituteLogin();
    const response = await post("/login-switch/start", {}, cookie);
    const data = await response.json();
    expect(data).toMatchObject({ ok: true, data: { reauthenticate: false } });
    const url = new URL(data.data.url);
    expect(url.searchParams.get("redirect_uri")).toBe(
      `${origin}/api/auth/login-switch/callback`,
    );
    expect(url.searchParams.has("code_challenge")).toBe(true);
    providerBoundary.email = "alumni@gmail.com";
    providerBoundary.identity = "google-new";
    const flowCookie = [cookie, cookieHeader(response)].join("; ");
    const callback = `${origin}/api/auth/login-switch/callback?state=${url.searchParams.get("state")}&code=mock-code`;
    const verified = await auth.handler(
      new Request(callback, { headers: { cookie: flowCookie } }),
    );
    expect(verified.headers.get("location")).toBe("/internal/profile");
    expect((await session(cookie))?.user.id).toBe(user.id);
    expect((await session(cookie))?.session.authProvider).toBe("microsoft");
    expect(await LoginSwitchRequest.countDocuments({ status: "draft" })).toBe(
      1,
    );
    expect(await User.countDocuments()).toBe(1);
    expect((await User.findById(user.id))?.email).toBe("member@iitg.ac.in");
    const replay = await auth.handler(
      new Request(callback, { headers: { cookie: flowCookie } }),
    );
    expect(replay.headers.get("location")).toContain("switchError");
    expect(await LoginSwitchRequest.countDocuments()).toBe(1);
    expect(
      await mongoose.connection
        .db!.collection("account")
        .countDocuments({ providerId: "google" }),
    ).toBe(0);
  });

  it("requires fresh sessions and rejects expired state, login state or another session for switch verification", async () => {
    const { cookie } = await instituteLogin();
    const loginFlow = await start("google", cookie);
    const invalid = await auth.handler(
      new Request(
        `${origin}/api/auth/login-switch/callback?state=${loginFlow.state}&code=mock-code`,
        { headers: { cookie: loginFlow.cookie } },
      ),
    );
    expect(invalid.headers.get("location")).toContain("switchError");
    const response = await post("/login-switch/start", {}, cookie);
    const data = await response.json();
    const state = new URL(data.data.url).searchParams.get("state");
    const anonymous = await auth.handler(
      new Request(
        `${origin}/api/auth/login-switch/callback?state=${state}&code=mock-code`,
        { headers: { cookie: cookieHeader(response) } },
      ),
    );
    expect(anonymous.headers.get("location")).toContain("switchError");
    const expiring = await post("/login-switch/start", {}, cookie);
    const expiringData = await expiring.json();
    const expiringState = new URL(expiringData.data.url).searchParams.get(
      "state",
    );
    const clock = vi.spyOn(Date, "now").mockReturnValue(Date.now() + 600001);
    try {
      const expired = await auth.handler(
        new Request(
          `${origin}/api/auth/login-switch/callback?state=${expiringState}&code=mock-code`,
          { headers: { cookie: [cookie, cookieHeader(expiring)].join("; ") } },
        ),
      );
      expect(expired.headers.get("location")).toContain("switchError");
    } finally {
      clock.mockRestore();
    }
    await mongoose.connection
      .db!.collection("session")
      .updateMany({}, { $set: { createdAt: new Date(Date.now() - 600001) } });
    expect(
      await (await post("/login-switch/start", {}, cookie)).json(),
    ).toMatchObject({ ok: true, data: { reauthenticate: true } });
    expect(await LoginSwitchRequest.countDocuments()).toBe(0);
  });
});
