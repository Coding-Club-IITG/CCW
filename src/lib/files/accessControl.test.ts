import { describe, expect, it } from "vitest";

import {
  fileAccessControlSchema,
  shareFileSchema,
} from "@/lib/api/schemas/files";
import { EMPTY_ACL, normalizeAccessControl } from "./accessControl";

describe("sharing changes", () => {
  it("treats legacy files without groups as having no group grants", () => {
    expect(
      normalizeAccessControl({ allowedUsers: [{ toString: () => "user" }] }),
    ).toEqual({ ...EMPTY_ACL, allowedUsers: ["user"] });
    expect(
      fileAccessControlSchema.parse({ allowedModules: ["Design"] }),
    ).toMatchObject({ allowedGroups: [], allowedModules: ["Design"] });
  });

  it.each([
    { allowedGroups: ["not-an-id"] },
    { allMembers: "true" },
    { allowedModules: ["unknown"] },
    { allowedUsers: { $ne: null } },
    { allowedGroups: Array(101).fill("0123456789abcdef01234567") },
    { allowedRoles: ["Admin"] },
  ])("rejects malformed ACLs: %j", (value) => {
    expect(fileAccessControlSchema.safeParse(value).success).toBe(false);
  });

  it("requires a timestamp and explicit download permission and rejects metadata in sharing", () => {
    const sharing = {
      updatedAt: "2026-10-02T00:00:00.000Z",
      isDownloadable: true,
      accessControl: EMPTY_ACL,
    };
    expect(shareFileSchema.safeParse(sharing).success).toBe(true);
    for (const change of [
      { updatedAt: undefined },
      { updatedAt: "yesterday" },
      { isDownloadable: undefined },
      { isDownloadable: "yes" },
      { title: "Unexpected metadata edit" },
      { files: [] },
    ]) {
      expect(shareFileSchema.safeParse({ ...sharing, ...change }).success).toBe(
        false,
      );
    }
  });
});
