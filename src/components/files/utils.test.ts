import { describe, expect, it } from "vitest";

import { aclSummary, canManageFile, formatBytes, isPreviewable } from "./utils";
import type { AccessControl, CurrentUser, FileEntry } from "./types";

const restrictedAcl: AccessControl = {
  allMembers: false,
  allowedModules: [],
  allowedGlobalRoles: [],
  allowedModuleRoles: [],
  allowedUsers: [],
};

const currentUser: CurrentUser = {
  id: "member-1",
  name: "Member One",
  email: "member@example.test",
  role: "Member",
  moduleRoles: [],
  canUpload: false,
  isGlobalAdmin: false,
  isAdmin: false,
  headModules: [],
};

const file = {
  _id: "file-1",
  title: "Handbook",
  description: "",
  originalName: "handbook.pdf",
  mimeType: "application/pdf",
  size: 2048,
  folder: "General",
  uploadedBy: "owner-1",
  uploadedByName: "Owner",
  uploaderModule: "Design",
  isDownloadable: false,
  accessControl: restrictedAcl,
  createdAt: "2026-01-15T00:00:00.000Z",
} satisfies FileEntry;

describe("file display utilities", () => {
  it.each([
    [0, "0 B"],
    [1023, "1023 B"],
    [1024, "1.0 KB"],
    [1536, "1.5 KB"],
    [1048576, "1.0 MB"],
  ])("formats %i bytes as %s", (bytes, expected) => {
    expect(formatBytes(bytes)).toBe(expected);
  });

  it.each([
    "application/pdf",
    "image/png",
    "text/plain",
    "video/mp4",
    "video/webm",
    "audio/mpeg",
  ])("recognizes %s as previewable", (mimeType) => {
    expect(isPreviewable(mimeType)).toBe(true);
  });

  it.each(["application/zip", "video/quicktime", "application/octet-stream"])(
    "does not claim %s is previewable",
    (mimeType) => {
      expect(isPreviewable(mimeType)).toBe(false);
    },
  );

  it("mirrors global-admin, module-head, and owner management hints", () => {
    expect(canManageFile({ ...currentUser, isGlobalAdmin: true }, file)).toBe(
      true,
    );
    expect(
      canManageFile({ ...currentUser, headModules: ["Design"] }, file),
    ).toBe(true);
    expect(canManageFile({ ...currentUser, id: "owner-1" }, file)).toBe(true);
    expect(canManageFile(currentUser, file)).toBe(false);
  });

  it("summarizes public, restricted, and targeted ACLs", () => {
    expect(aclSummary({ ...restrictedAcl, allMembers: true })).toBe(
      "All Members",
    );
    expect(aclSummary(restrictedAcl)).toBe("Restricted");
    expect(
      aclSummary({
        allMembers: false,
        allowedModules: ["Design"],
        allowedGlobalRoles: ["Head"],
        allowedModuleRoles: ["Coordinator"],
        allowedUsers: ["member-1"],
      }),
    ).toBe("1 module(s), 1 role(s), 1 module role(s), 1 user(s)");
  });
});
