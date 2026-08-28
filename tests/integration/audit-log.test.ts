import { NextRequest } from "next/server";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import AuditLog, { auditExpiry } from "@/models/AuditLog";
import Project from "@/models/Project";
import mongoose from "mongoose";
import { auditedTransaction } from "@/lib/audit";
import {
  clearTestMongo,
  startTestMongo,
  stopTestMongo,
} from "../utils/mongodb";
import { responseData, responseError } from "../utils/result";

const getSession = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession } } }));

async function event(index: number, category: "users" | "potd" = "users") {
  const createdAt = new Date(Date.UTC(2026, 7, 1, 0, index));
  return AuditLog.create({
    actor: {
      userId: `actor-${index}`,
      displayName: `Editor ${index}`,
      access: index % 2 ? "Head" : "Admin",
    },
    category,
    action: "update",
    operation: `${category}.update`,
    target: {
      type: category === "users" ? "user" : "potd-challenge",
      id: `target-${index}`,
      label: `Target ${index}`,
    },
    before: { status: "before" },
    after: { status: "after" },
    createdAt,
    expiresAt: auditExpiry(createdAt),
  });
}

describe("administrative audit log", () => {
  beforeAll(startTestMongo);
  afterEach(clearTestMongo);
  afterAll(stopTestMongo);

  it.each(["Head", "Admin"])(
    "is globally visible to %s users",
    async (access) => {
      getSession.mockResolvedValue({
        user: { id: "viewer", name: "Viewer", access },
      });
      await event(1);
      const { GET } = await import("@/app/api/admin/audit-log/route");
      const response = await GET(
        new NextRequest("http://localhost/api/admin/audit-log"),
      );
      expect(response.status).toBe(200);
      expect(
        (await responseData<{ items: unknown[] }>(response)).items,
      ).toHaveLength(1);
    },
  );

  it("rejects members and invalid date ranges", async () => {
    const { GET } = await import("@/app/api/admin/audit-log/route");
    getSession.mockResolvedValue({ user: { id: "member", access: "Member" } });
    expect(
      (await GET(new NextRequest("http://localhost/api/admin/audit-log")))
        .status,
    ).toBe(403);
    getSession.mockResolvedValue({ user: { id: "head", access: "Head" } });
    const response = await GET(
      new NextRequest(
        "http://localhost/api/admin/audit-log?from=2026-09-02T00:00:00.000Z&to=2026-09-01T00:00:00.000Z",
      ),
    );
    expect(response.status).toBe(400);
    expect((await responseError(response)).code).toBe("VALIDATION_ERROR");
  });

  it("filters and paginates newest first", async () => {
    getSession.mockResolvedValue({ user: { id: "head", access: "Head" } });
    await event(1, "users");
    await event(2, "potd");
    await event(3, "potd");
    const { GET } = await import("@/app/api/admin/audit-log/route");
    const response = await GET(
      new NextRequest(
        "http://localhost/api/admin/audit-log?category=potd&page=1&limit=1&actor=Target",
      ),
    );
    const body = await responseData<{
      items: Array<{ target: { id: string } }>;
      pagination: { total: number; totalPages: number };
    }>(response);
    expect(body.items[0].target.id).toBe("target-3");
    expect(body.pagination).toMatchObject({ total: 2, totalPages: 2 });
  });

  it("rolls back the business mutation when audit persistence fails", async () => {
    const session = await mongoose.startSession();
    try {
      await expect(
        auditedTransaction(session, async (transaction) => {
          const [project] = await Project.create(
            [
              {
                title: "Rollback",
                description: "Safe",
                repoLink: "https://example.test",
                date: new Date(),
                module: "General",
                status: "Upcoming",
                tags: [],
              },
            ],
            { session: transaction },
          );
          return {
            result: project,
            audit: {
              actor: {
                userId: "head",
                displayName: "Head",
                access: "Head" as const,
              },
              category: "projects" as const,
              action: "create" as const,
              operation: "x".repeat(200),
              target: {
                type: "project",
                id: String(project._id),
                label: project.title,
              },
              after: { title: project.title },
            },
          };
        }),
      ).rejects.toThrow();
    } finally {
      await session.endSession();
    }
    expect(await Project.countDocuments()).toBe(0);
    expect(await AuditLog.countDocuments()).toBe(0);
  });
});
