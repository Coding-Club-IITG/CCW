import { afterAll, beforeAll, expect, it, vi } from "vitest";
import mongoose from "mongoose";

import User from "@/models/User";

import { startTestMongo, stopTestMongo } from "../utils/mongodb";

vi.mock("@/lib/env/web", async () => {
  const { parseWebEnv } = await import("@/lib/env/schema");
  return {
    webEnv: parseWebEnv({
      ...process.env,
      NODE_ENV: "development",
      DEV_AUTH_ENABLED: "true",
    }),
  };
});
vi.mock("@/lib/notifications/push/config", () => ({
  webPushConfigured: false,
}));
vi.mock("@/lib/notifications/push/queue", () => ({
  pushNotificationQueue: { addBulk: vi.fn() },
}));

beforeAll(startTestMongo);
afterAll(stopTestMongo);
it("preserves the development picker's real sessions without granting production provider access", async () => {
  const user = await User.create({
    name: "Development",
    email: "development@gmail.com",
    emailVerified: true,
  });
  const { auth } = await import("@/lib/auth/server");
  expect(
    await mongoose.connection
      .db!.listCollections({ name: "account" })
      .toArray(),
  ).toEqual([]);
  const response = await auth.handler(
    new Request("http://127.0.0.1:3000/api/auth/dev/sign-in", {
      method: "POST",
      headers: {
        origin: "http://127.0.0.1:3000",
        "content-type": "application/json",
      },
      body: JSON.stringify({ userId: user.id }),
    }),
  );
  expect(response.status).toBe(200);
  const cookie = response.headers
    .getSetCookie()
    .map((part) => part.split(";")[0])
    .join("; ");
  const session = await auth.api.getSession({
    headers: new Headers({ cookie }),
  });
  expect(session?.user.id).toBe(user.id);
  expect(session?.session.authProvider).toBe("development");
  const { recentInstituteSession } = await import("@/lib/auth/loginSwitch");
  expect(recentInstituteSession(session!.session)).toBe(false);
});
