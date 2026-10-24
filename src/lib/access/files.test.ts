import { Types } from "mongoose";
import { describe, expect, it } from "vitest";

import {
  buildAccessFilter,
  canAccessFile,
  canManageFile,
  canUploadFiles,
} from "./files";
import type { IFileEntry } from "@/models/FileEntry";

const ownerId = new Types.ObjectId();
const memberId = new Types.ObjectId();
const groupId = new Types.ObjectId();
function file(accessControl: Partial<IFileEntry["accessControl"]> = {}) {
  return {
    uploadedBy: ownerId,
    uploaderModule: "Design",
    accessControl: {
      allMembers: false,
      allowedModules: [],
      allowedClubPositions: [],
      allowedModulePositions: [],
      allowedUsers: [],
      allowedGroups: [],
      ...accessControl,
    },
  } as IFileEntry;
}

describe("file access", () => {
  it("accepts live group membership without granting management", () => {
    const shared = file({ allowedGroups: [groupId] });
    expect(
      canAccessFile(String(memberId), "Member", [], shared, [String(groupId)]),
    ).toBe(true);
    expect(canAccessFile(String(memberId), "Member", [], shared)).toBe(false);
    expect(canManageFile(String(memberId), "Head", shared)).toBe(false);
    expect(
      buildAccessFilter(String(memberId), "Member", [], [groupId]),
    ).toMatchObject({
      $or: expect.arrayContaining([
        { "accessControl.allowedGroups": { $in: [groupId] } },
      ]),
    });
  });

  it.each(["Head", "Core Team"])(
    "allows %s to manage only files shared with a managed group",
    (access) => {
      const shared = file({ allowedGroups: [groupId] });
      expect(canUploadFiles(access)).toBe(true);
      expect(
        canManageFile(String(memberId), access, shared, [String(groupId)]),
      ).toBe(true);
      expect(
        canAccessFile(String(memberId), access, [], shared, [], [groupId]),
      ).toBe(true);
      expect(canManageFile(String(memberId), access, file(), [groupId])).toBe(
        false,
      );
      expect(
        canManageFile(String(memberId), access, shared, [new Types.ObjectId()]),
      ).toBe(false);
      expect(
        buildAccessFilter(String(memberId), access, [], [], [groupId]),
      ).toMatchObject({
        $or: expect.arrayContaining([
          { "accessControl.allowedGroups": { $in: [groupId] } },
        ]),
      });
    },
  );

  it("revokes delegated management after demotion and excludes module-based management", () => {
    const shared = file({ allowedGroups: [groupId] });
    expect(canManageFile(String(memberId), "Member", shared, [groupId])).toBe(
      false,
    );
    expect(
      canAccessFile(String(memberId), "Member", [], shared, [], [groupId]),
    ).toBe(false);
    expect(buildAccessFilter(String(memberId), "Head", [])).not.toMatchObject({
      $or: expect.arrayContaining([{ uploaderModule: expect.anything() }]),
    });
    expect(
      buildAccessFilter(String(memberId), "Member", [], [], [groupId]),
    ).not.toMatchObject({
      $or: expect.arrayContaining([
        { "accessControl.allowedGroups": expect.anything() },
      ]),
    });
  });

  it("retains direct grants, uploader ownership and admin access", () => {
    expect(canUploadFiles("Member")).toBe(false);
    expect(canUploadFiles("Admin")).toBe(true);
    expect(canManageFile(String(memberId), "Admin", file())).toBe(true);
    expect(canManageFile(String(ownerId), "Member", file())).toBe(true);
    expect(buildAccessFilter(String(memberId), "Admin", [])).toEqual({});
    expect(
      canAccessFile(
        String(memberId),
        "Member",
        [],
        file({ allowedUsers: [memberId], allowedGroups: [groupId] }),
      ),
    ).toBe(true);
  });

  it("preserves role-based sharing grants", () => {
    expect(
      canAccessFile(
        String(memberId),
        "Member",
        [{ module: "Web Development", position: "Head" }],
        file({ allowedModules: ["Web Development"] }),
      ),
    ).toBe(true);
    expect(
      canAccessFile(
        String(memberId),
        "Member",
        [{ position: "Operations Head" }],
        file({ allowedClubPositions: ["Operations Head"] }),
      ),
    ).toBe(true);
    expect(
      canAccessFile(
        String(memberId),
        "Member",
        [{ position: "OC" }],
        file({ allowedClubPositions: ["OC"] }),
      ),
    ).toBe(true);
    expect(
      canAccessFile(
        String(memberId),
        "Member",
        [{ module: "Design", position: "Coordinator" }],
        file({ allowedModulePositions: ["Coordinator"] }),
      ),
    ).toBe(true);
    expect(
      buildAccessFilter(String(memberId), "Member", [
        { module: "Design", position: "Coordinator" },
      ]),
    ).toMatchObject({
      $or: expect.arrayContaining([
        { "accessControl.allowedModules": { $in: ["Design"] } },
        { "accessControl.allowedModulePositions": { $in: ["Coordinator"] } },
      ]),
    });
  });
});
