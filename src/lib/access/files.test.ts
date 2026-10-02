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
      ...accessControl,
    },
  } as IFileEntry;
}
describe("file access", () => {
  it("accepts live group membership without granting management", () => {
    const groupId = new Types.ObjectId();
    const shared = file({ allowedGroups: [groupId] });
    expect(
      canAccessFile(memberId.toString(), "Member", [], [], shared, [
        String(groupId),
      ]),
    ).toBe(true);
    expect(
      canAccessFile(memberId.toString(), "Member", [], [], shared, []),
    ).toBe(false);
    expect(canManageFile(memberId.toString(), "Member", [], shared)).toBe(
      false,
    );
    expect(
      buildAccessFilter(memberId.toString(), "Member", [], [], [groupId]),
    ).toMatchObject({
      $or: expect.arrayContaining([
        { "accessControl.allowedGroups": { $in: [groupId] } },
      ]),
    });
  });

  it("retains independent direct grants after group membership is removed", () => {
    expect(
      canAccessFile(
        memberId.toString(),
        "Member",
        [],
        [],
        file({
          allowedUsers: [memberId],
          allowedGroups: [new Types.ObjectId()],
        }),
        [],
      ),
    ).toBe(true);
  });
  it("uses Access for management", () => {
    expect(canUploadFiles("Head")).toBe(true);
    expect(canUploadFiles("Admin")).toBe(true);
    expect(canUploadFiles("Member")).toBe(false);
    expect(canManageFile(memberId.toString(), "Admin", [], file())).toBe(true);
    expect(canManageFile(memberId.toString(), "Head", ["Design"], file())).toBe(
      true,
    );
    expect(
      canManageFile(memberId.toString(), "Head", ["Cybersecurity"], file()),
    ).toBe(false);
  });
  it("evaluates club and module positions", () => {
    expect(
      canAccessFile(
        memberId.toString(),
        "Member",
        [],
        [{ position: "OC" }],
        file({ allowedClubPositions: ["OC"] }),
      ),
    ).toBe(true);
    expect(
      canAccessFile(
        memberId.toString(),
        "Member",
        [],
        [{ module: "Design", position: "Coordinator" }],
        file({ allowedModulePositions: ["Coordinator"] }),
      ),
    ).toBe(true);
  });
  it("builds role-based database branches", () => {
    expect(buildAccessFilter(memberId.toString(), "Admin", [], [])).toEqual({});
    expect(
      buildAccessFilter(
        memberId.toString(),
        "Member",
        [],
        [{ module: "Design", position: "Coordinator" }],
      ),
    ).toMatchObject({
      $or: expect.arrayContaining([
        { "accessControl.allowedModules": { $in: ["Design"] } },
        { "accessControl.allowedModulePositions": { $in: ["Coordinator"] } },
      ]),
    });
  });
});
