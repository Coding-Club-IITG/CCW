import { Types } from "mongoose";
import { describe, expect, it } from "vitest";

import {
  buildAccessFilter,
  canAccessFile,
  canManageFile,
  canUploadFiles,
} from "./fileAccess";
import type { IFileEntry } from "@/models/FileEntry";

const ownerId = new Types.ObjectId();
const memberId = new Types.ObjectId();

function file(
  overrides: Partial<IFileEntry> = {},
): IFileEntry {
  return {
    uploadedBy: ownerId,
    uploaderModule: "Competitive Programming",
    accessControl: {
      allMembers: false,
      allowedModules: [],
      allowedGlobalRoles: [],
      allowedModuleRoles: [],
      allowedUsers: [],
    },
    ...overrides,
  } as IFileEntry;
}

describe("file access control", () => {
  it.each(["Secretary", "OC", "Projects Head", "Head"])(
    "allows %s to upload files",
    (role) => {
      expect(canUploadFiles(role)).toBe(true);
    },
  );

  it.each(["Core Team", "Member", ""])(
    "does not allow %s to upload files",
    (role) => {
      expect(canUploadFiles(role)).toBe(false);
    },
  );

  it("allows global admins to manage every file", () => {
    expect(canManageFile(memberId.toString(), "Secretary", [], file())).toBe(
      true,
    );
  });

  it("allows a head to manage files uploaded under their module", () => {
    expect(
      canManageFile(
        memberId.toString(),
        "Head",
        [{ module: "Competitive Programming" }],
        file(),
      ),
    ).toBe(true);
  });

  it("allows upload-capable owners to manage their own files", () => {
    expect(canManageFile(ownerId.toString(), "Head", [], file())).toBe(true);
  });

  it("does not allow an unrelated member to manage a file", () => {
    expect(canManageFile(memberId.toString(), "Member", [], file())).toBe(
      false,
    );
  });

  it.each([
    {
      label: "all members",
      role: "Member",
      moduleRoles: [],
      accessControl: { allMembers: true },
    },
    {
      label: "global role",
      role: "Core Team",
      moduleRoles: [],
      accessControl: { allowedGlobalRoles: ["Core Team"] },
    },
    {
      label: "module",
      role: "Member",
      moduleRoles: [{ module: "Design", role: "Member" }],
      accessControl: { allowedModules: ["Design"] },
    },
    {
      label: "module role",
      role: "Member",
      moduleRoles: [{ module: "Design", role: "Coordinator" }],
      accessControl: { allowedModuleRoles: ["Coordinator"] },
    },
    {
      label: "specific user",
      role: "Member",
      moduleRoles: [],
      accessControl: { allowedUsers: [memberId] },
    },
  ])("grants access through $label ACLs", ({ role, moduleRoles, accessControl }) => {
    expect(
      canAccessFile(
        memberId.toString(),
        role,
        moduleRoles,
        file({
          accessControl: {
            allMembers: false,
            allowedModules: [],
            allowedGlobalRoles: [],
            allowedModuleRoles: [],
            allowedUsers: [],
            ...accessControl,
          } as IFileEntry["accessControl"],
        }),
      ),
    ).toBe(true);
  });

  it("denies access when no management or ACL rule matches", () => {
    expect(
      canAccessFile(
        memberId.toString(),
        "Member",
        [{ module: "Design", role: "Member" }],
        file(),
      ),
    ).toBe(false);
  });
});

describe("file access query filter", () => {
  it("does not constrain global administrators", () => {
    expect(buildAccessFilter(memberId.toString(), "OC", [])).toEqual({});
  });

  it("includes ownership and every applicable ACL branch", () => {
    expect(
      buildAccessFilter(memberId.toString(), "Member", [
        { module: "Design", role: "Coordinator" },
      ]),
    ).toEqual({
      $or: [
        { uploadedBy: memberId.toString() },
        { "accessControl.allMembers": true },
        { "accessControl.allowedGlobalRoles": "Member" },
        { "accessControl.allowedUsers": memberId.toString() },
        { "accessControl.allowedModules": { $in: ["Design"] } },
        {
          "accessControl.allowedModuleRoles": { $in: ["Coordinator"] },
        },
      ],
    });
  });

  it("adds module ownership for heads without adding absent ACL dimensions", () => {
    expect(
      buildAccessFilter(memberId.toString(), "Head", [
        { module: "Competitive Programming" },
      ]),
    ).toEqual({
      $or: [
        { uploadedBy: memberId.toString() },
        { "accessControl.allMembers": true },
        { "accessControl.allowedGlobalRoles": "Head" },
        { "accessControl.allowedUsers": memberId.toString() },
        {
          uploaderModule: { $in: ["Competitive Programming"] },
        },
        {
          "accessControl.allowedModules": {
            $in: ["Competitive Programming"],
          },
        },
      ],
    });
  });
});
