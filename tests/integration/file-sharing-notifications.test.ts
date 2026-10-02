import { unlink } from "fs/promises";
import path from "path";
import mongoose, { Types } from "mongoose";
import { NextRequest } from "next/server";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { EMPTY_ACL } from "@/lib/files/accessControl";
import type { AccessControl } from "@/lib/files/types";
import AuditLog from "@/models/AuditLog";
import FileEntry from "@/models/FileEntry";
import Notification from "@/models/Notification";
import SharingGroup from "@/models/SharingGroup";
import User from "@/models/User";

import {
  FILE_MEMBER_ID,
  FILE_OTHER_MEMBER_ID,
  FILE_OWNER_ID,
  fileEntry,
  fileSession,
} from "../fixtures/files";
import {
  listTestUploads,
  startTestUploadDirectory,
  stopTestUploadDirectory,
} from "../utils/filesystem";
import {
  clearTestMongo,
  startTestMongo,
  stopTestMongo,
} from "../utils/mongodb";

const { getSession, addBulk } = vi.hoisted(() => ({
  getSession: vi.fn(),
  addBulk: vi.fn(),
}));
vi.mock("@/lib/auth/server", () => ({ auth: { api: { getSession } } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/notifications/push/config", () => ({ webPushConfigured: true }));
vi.mock("@/lib/notifications/push/queue", () => ({
  PUSH_JOB_NAME: "deliver_notification",
  pushNotificationQueue: { addBulk },
}));

const memberId = String(FILE_MEMBER_ID);
const otherId = String(FILE_OTHER_MEMBER_ID);
const ownerId = String(FILE_OWNER_ID);
const context = (id: string) => ({ params: Promise.resolve({ id }) });
const request = (url: string, body: unknown) =>
  new NextRequest(`http://localhost/api/files${url}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

async function share(
  id: unknown,
  accessControl: Partial<AccessControl>,
  isDownloadable = true,
) {
  const { PATCH } = await import("@/app/api/files/[id]/share/route");
  const file = await FileEntry.findById(id).lean();
  return PATCH(
    request(`/${id}/share`, {
      updatedAt: file.updatedAt.toISOString(),
      isDownloadable,
      accessControl: { ...EMPTY_ACL, ...accessControl },
    }),
    context(String(id)),
  );
}

async function group(memberIds: string[] = []) {
  return SharingGroup.create({
    name: "Website Team",
    memberIds,
    createdBy: FILE_OWNER_ID,
  });
}

async function addMembers(id: unknown, memberIds: string[]) {
  const { PATCH } = await import("@/app/api/files/groups/[id]/route");
  return PATCH(
    request(`/groups/${id}`, { name: "Website Team", memberIds, version: 0 }),
    context(String(id)),
  );
}

async function upload(accessControl: Partial<AccessControl>) {
  const { POST } = await import("@/app/api/files/route");
  const body = new FormData();
  body.set(
    "file",
    new File(["New file"], "handbook.txt", { type: "text/plain" }),
  );
  body.set("title", "Club handbook");
  body.append("tags", "General");
  body.set("isDownloadable", "true");
  body.set("accessControl", JSON.stringify({ ...EMPTY_ACL, ...accessControl }));
  return POST(
    new NextRequest("http://localhost/api/files", { method: "POST", body }),
  );
}

async function recipients() {
  return (await Notification.find().lean())
    .map((notification) => notification.userId)
    .sort();
}

describe("file-sharing notifications", () => {
  let uploadDirectory: string;
  const pushSnapshots: { notifications: number; audits: number }[] = [];
  beforeAll(async () => {
    uploadDirectory = await startTestUploadDirectory();
    await startTestMongo();
    await Promise.all([Notification.init(), AuditLog.init()]);
  });
  beforeEach(async () => {
    pushSnapshots.length = 0;
    getSession.mockResolvedValue(
      fileSession({
        id: ownerId,
        name: "Owner",
        pizza_count: 1,
        access: "Head",
        managedModules: ["Design"],
      }),
    );
    await User.create([
      {
        _id: FILE_OWNER_ID,
        name: "Owner",
        access: "Head",
        managedModules: ["Design"],
      },
      { _id: FILE_MEMBER_ID, name: "Member" },
      { _id: FILE_OTHER_MEMBER_ID, name: "Other" },
    ]);
    addBulk.mockImplementation(
      async (jobs: { data: { notificationId: string } }[]) => {
        // A query without the mutation's session sees only committed rows.
        pushSnapshots.push({
          notifications: await Notification.countDocuments({
            _id: { $in: jobs.map((job) => job.data.notificationId) },
          }),
          audits: await AuditLog.countDocuments(),
        });
        return [];
      },
    );
  });
  afterEach(async () => {
    await clearTestMongo();
    for (const name of await listTestUploads(uploadDirectory))
      await unlink(path.join(uploadDirectory, name));
  });
  afterAll(async () => {
    await stopTestMongo();
    await stopTestUploadDirectory(uploadDirectory);
  });

  it("deduplicates people and groups, excludes the actor and existing access, and queues only after commit", async () => {
    const team = await group([memberId, otherId, ownerId]);
    const file = await FileEntry.create(
      fileEntry({ accessControl: { ...EMPTY_ACL, allowedUsers: [otherId] } }),
    );
    expect(
      (
        await share(file._id, {
          allowedUsers: [memberId, otherId, ownerId],
          allowedGroups: [String(team._id)],
        })
      ).status,
    ).toBe(200);
    expect(await recipients()).toEqual([memberId]);
    const notification = await Notification.findOne().lean();
    expect(notification).toMatchObject({
      type: "file_shared",
      title: "File shared with you",
      read: false,
      message: "Owner 🍕 shared “Club handbook” with you.",
      link: "/internal/files",
    });
    expect(addBulk).toHaveBeenCalledOnce();
    expect(pushSnapshots).toEqual([{ notifications: 1, audits: 1 }]);
    expect(addBulk).toHaveBeenCalledWith([
      expect.objectContaining({
        data: { notificationId: String(notification._id) },
        opts: { jobId: String(notification._id) },
      }),
    ]);
  });

  it.each([
    [{ allMembers: true }, [memberId, otherId]],
    [{ allowedModules: ["Design"] }, [memberId]],
    [{ allowedClubPositions: ["Secretary"] }, [otherId]],
    [{ allowedModulePositions: ["Coordinator"] }, [memberId]],
  ] satisfies [Partial<AccessControl>, string[]][])(
    "notifies newly matching recipients for broad sharing: %j",
    async (acl, expected) => {
      await User.updateOne(
        { _id: FILE_MEMBER_ID },
        { roles: [{ module: "Design", position: "Coordinator" }] },
      );
      await User.updateOne(
        { _id: FILE_OTHER_MEMBER_ID },
        { roles: [{ position: "Secretary" }] },
      );
      await User.create({ name: "Admin", access: "Admin" });
      const file = await FileEntry.create(fileEntry());
      expect((await share(file._id, acl)).status).toBe(200);
      expect(await recipients()).toEqual([...expected].sort());
    },
  );

  it.each(["group", "all"])(
    "notifies the selected audience when uploading a file shared with %s",
    async (audience) => {
      const team = await group([memberId, ownerId]);
      const admin = await User.create({ name: "Admin", access: "Admin" });
      const acl =
        audience === "all"
          ? { allMembers: true }
          : { allowedGroups: [String(team._id)], allowedUsers: [memberId] };
      expect((await upload(acl)).status).toBe(201);
      expect(await recipients()).toEqual(
        (audience === "all"
          ? [memberId, otherId, String(admin._id)]
          : [memberId]
        ).sort(),
      );
      expect(addBulk).toHaveBeenCalledOnce();
    },
  );

  it("does not alert for overlapping grants, metadata, downloading, repeated saves or removal", async () => {
    const team = await group([memberId]);
    const acl = { ...EMPTY_ACL, allowedGroups: [String(team._id)] };
    const file = await FileEntry.create(fileEntry({ accessControl: acl }));
    expect(
      (await share(file._id, { ...acl, allowedUsers: [memberId] })).status,
    ).toBe(200);
    expect(
      (await share(file._id, { ...acl, allowedUsers: [memberId] }, false))
        .status,
    ).toBe(200);
    const { PATCH } = await import("@/app/api/files/[id]/route");
    expect(
      (
        await PATCH(
          request(`/${file._id}`, { title: "Renamed" }),
          context(String(file._id)),
        )
      ).status,
    ).toBe(200);
    expect((await share(file._id, {})).status).toBe(200);
    expect(await recipients()).toEqual([]);
    expect(addBulk).not.toHaveBeenCalled();
    expect((await share(file._id, { allowedUsers: [memberId] })).status).toBe(
      200,
    );
    expect((await share(file._id, { allowedUsers: [memberId] })).status).toBe(
      200,
    );
    expect(await recipients()).toEqual([memberId]);
  });

  it("summarizes only newly accessible files when members join a group", async () => {
    const team = await group();
    const existing = await group([memberId]);
    const admin = await User.create({ name: "Admin", access: "Admin" });
    await User.updateOne(
      { _id: FILE_MEMBER_ID },
      { roles: [{ module: "Design", position: "Coordinator" }] },
    );
    const acl = { ...EMPTY_ACL, allowedGroups: [String(team._id)] };
    await FileEntry.create([
      fileEntry({ accessControl: acl }),
      fileEntry({ accessControl: { ...acl, allowedUsers: [otherId] } }),
      fileEntry({
        accessControl: {
          ...acl,
          allowedGroups: [...acl.allowedGroups, String(existing._id)],
        },
      }),
      fileEntry({ accessControl: { ...acl, allMembers: true } }),
      fileEntry({ accessControl: { ...acl, allowedModules: ["Design"] } }),
    ]);
    expect(
      (
        await addMembers(team._id, [
          memberId,
          otherId,
          ownerId,
          String(admin._id),
        ])
      ).status,
    ).toBe(200);
    expect(await recipients()).toEqual([memberId, otherId].sort());
    expect(
      (await Notification.findOne({ userId: memberId }).lean()).message,
    ).toContain("access to 2 files");
    expect(
      (await Notification.findOne({ userId: otherId }).lean()).message,
    ).toContain("access to 3 files");
    expect(addBulk).toHaveBeenCalledOnce();
  });

  it("does not notify for creating an unshared group, empty additions, renaming or removing members", async () => {
    const { POST } = await import("@/app/api/files/groups/route");
    const response = await POST(
      new NextRequest("http://localhost/api/files/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "New team", memberIds: [memberId] }),
      }),
    );
    expect(response.status).toBe(201);
    const empty = await group();
    expect((await addMembers(empty._id, [memberId])).status).toBe(200);
    const team = await group([memberId]);
    await FileEntry.create(
      fileEntry({
        accessControl: { ...EMPTY_ACL, allowedGroups: [String(team._id)] },
      }),
    );
    const { PATCH } = await import("@/app/api/files/groups/[id]/route");
    expect(
      (
        await PATCH(
          request(`/groups/${team._id}`, {
            name: "Renamed team",
            memberIds: [memberId],
            version: 0,
          }),
          context(String(team._id)),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await PATCH(
          request(`/groups/${team._id}`, {
            name: "Renamed team",
            memberIds: [],
            version: 1,
          }),
          context(String(team._id)),
        )
      ).status,
    ).toBe(200);
    expect(await recipients()).toEqual([]);
    expect(addBulk).not.toHaveBeenCalled();
  });

  it.each(["share", "join", "upload"])(
    "rolls back notifications and %s changes if auditing fails",
    async (operation) => {
      const team = await group();
      const file = await FileEntry.create(
        fileEntry({
          accessControl: { ...EMPTY_ACL, allowedGroups: [String(team._id)] },
        }),
      );
      const db = mongoose.connection.db!;
      await db.command({
        collMod: AuditLog.collection.collectionName,
        validator: { category: { $ne: "files" } },
      });
      try {
        const response =
          operation === "share"
            ? await share(file._id, { allowedUsers: [memberId] })
            : operation === "join"
              ? await addMembers(team._id, [memberId])
              : await upload({ allowedUsers: [memberId] });
        expect(response.status).toBe(500);
        expect(await recipients()).toEqual([]);
        expect(addBulk).not.toHaveBeenCalled();
        expect((await SharingGroup.findById(team._id))?.memberIds).toEqual([]);
        expect(
          (await FileEntry.findById(file._id)).accessControl.allowedUsers,
        ).toEqual([]);
        expect(await FileEntry.countDocuments()).toBe(1);
        expect(await listTestUploads(uploadDirectory)).toEqual([]);
      } finally {
        await db.command({
          collMod: AuditLog.collection.collectionName,
          validator: {},
        });
      }
    },
  );

  it("rolls back the grant if notification persistence fails", async () => {
    const file = await FileEntry.create(fileEntry());
    const db = mongoose.connection.db!;
    await db.command({
      collMod: Notification.collection.collectionName,
      validator: { type: { $ne: "file_shared" } },
    });
    try {
      expect((await share(file._id, { allowedUsers: [memberId] })).status).toBe(
        500,
      );
      expect(
        (await FileEntry.findById(file._id)).accessControl.allowedUsers,
      ).toEqual([]);
      expect(await AuditLog.countDocuments()).toBe(0);
      expect(await recipients()).toEqual([]);
      expect(addBulk).not.toHaveBeenCalled();
    } finally {
      await db.command({
        collMod: Notification.collection.collectionName,
        validator: {},
      });
    }
  });

  it("keeps sharing and in-app notifications when push queueing fails", async () => {
    const file = await FileEntry.create(fileEntry());
    addBulk.mockRejectedValueOnce(new Error("Redis unavailable"));
    expect((await share(file._id, { allowedUsers: [memberId] })).status).toBe(
      200,
    );
    expect(await recipients()).toEqual([memberId]);
    expect(
      (await FileEntry.findById(file._id)).accessControl.allowedUsers.map(
        String,
      ),
    ).toEqual([memberId]);
  });

  it("does not duplicate notifications when simultaneous shares conflict", async () => {
    const file = await FileEntry.create(fileEntry());
    const { PATCH } = await import("@/app/api/files/[id]/share/route");
    const body = {
      updatedAt: file.updatedAt.toISOString(),
      isDownloadable: true,
      accessControl: { ...EMPTY_ACL, allowedUsers: [memberId] },
    };
    const responses = await Promise.all(
      [0, 1].map(() =>
        PATCH(request(`/${file._id}/share`, body), context(String(file._id))),
      ),
    );
    expect(responses.map((response) => response.status).sort()).toEqual([
      200, 409,
    ]);
    expect(await recipients()).toEqual([memberId]);
    expect(addBulk).toHaveBeenCalledOnce();
  });

  it("does not send notifications for unauthorized or invalid sharing", async () => {
    const file = await FileEntry.create(fileEntry());
    expect(
      (await share(file._id, { allowedGroups: [String(new Types.ObjectId())] }))
        .status,
    ).toBe(400);
    getSession.mockResolvedValue(fileSession());
    expect((await share(file._id, { allowedUsers: [otherId] })).status).toBe(
      403,
    );
    expect(await recipients()).toEqual([]);
    expect(addBulk).not.toHaveBeenCalled();
  });
});
