import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

import { proxy } from "@/proxy";

const getSession = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession,
    },
  },
}));

describe("proxy authorization", () => {
  it("redirects an unauthenticated admin request to the public home page", async () => {
    getSession.mockResolvedValue(null);

    const response = await proxy(
      new NextRequest("https://codingclub.example/admin/users"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://codingclub.example/",
    );
  });

  it("allows an authenticated member to continue to a protected route", async () => {
    getSession.mockResolvedValue({ user: { id: "member-1" } });

    const response = await proxy(
      new NextRequest("https://codingclub.example/internal/dashboard"),
    );

    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("redirects a signed-in member from home to the internal dashboard", async () => {
    getSession.mockResolvedValue({ user: { id: "member-1" } });

    const response = await proxy(
      new NextRequest("https://codingclub.example/"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://codingclub.example/internal/dashboard",
    );
  });

  it("preserves public home view mode for a signed-in member", async () => {
    getSession.mockResolvedValue({ user: { id: "member-1" } });

    const response = await proxy(
      new NextRequest("https://codingclub.example/", {
        headers: { cookie: "viewMode=public" },
      }),
    );

    expect(response.headers.get("x-middleware-next")).toBe("1");
  });
});
