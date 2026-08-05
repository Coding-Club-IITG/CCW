import { Types } from "mongoose";

export const FILE_OWNER_ID = new Types.ObjectId();
export const FILE_MEMBER_ID = new Types.ObjectId();
export const FILE_OTHER_MEMBER_ID = new Types.ObjectId();

export const restrictedAcl = {
  allMembers: false,
  allowedModules: [],
  allowedClubPositions: [],
  allowedModulePositions: [],
  allowedUsers: [],
};

export function fileEntry(overrides: Record<string, unknown> = {}) {
  return {
    title: "Club handbook",
    description: "Internal reference",
    originalName: "handbook.txt",
    storedName: `${new Types.ObjectId().toString()}.txt`,
    mimeType: "text/plain",
    size: 13,
    folder: "General",
    uploadedBy: FILE_OWNER_ID,
    uploadedByName: "File Owner",
    uploaderModule: null,
    isDownloadable: true,
    accessControl: restrictedAcl,
    ...overrides,
  };
}

export function fileSession(overrides: Record<string, unknown> = {}) {
  return {
    user: {
      id: FILE_MEMBER_ID.toString(),
      name: "Test Member",
      email: "member@example.test",
      access: "Member",
      managedModules: [],
      roles: [],
      ...overrides,
    },
    session: {
      id: "file-session",
      userId: FILE_MEMBER_ID.toString(),
      expiresAt: new Date("2030-01-01T00:00:00.000Z"),
    },
  };
}
