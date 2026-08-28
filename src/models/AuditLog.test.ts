import { describe, expect, it } from "vitest";

import AuditLog, { auditExpiry } from "@/models/AuditLog";

describe("AuditLog", () => {
  it("calculates six calendar months without a fixed-day approximation", () => {
    expect(
      auditExpiry(new Date("2026-02-28T12:00:00.000Z")).toISOString(),
    ).toBe("2026-08-28T12:00:00.000Z");
    expect(
      auditExpiry(new Date("2025-08-31T12:00:00.000Z")).toISOString(),
    ).toBe("2026-02-28T12:00:00.000Z");
  });

  it("rejects an oversized summary at the schema boundary", async () => {
    const event = new AuditLog({
      actor: { userId: "1", displayName: "Admin", access: "Admin" },
      category: "users",
      action: "update",
      operation: "users.update",
      target: { type: "user", id: "2", label: "Member" },
      before: { title: "x".repeat(161) },
      after: {},
      createdAt: new Date(),
      expiresAt: new Date(),
    });
    await expect(event.validate()).rejects.toThrow();
  });

  it("defines an absolute TTL index", () => {
    expect(AuditLog.schema.indexes()).toContainEqual([
      { expiresAt: 1 },
      expect.objectContaining({ expireAfterSeconds: 0 }),
    ]);
  });
});
