import { writeFile } from "fs/promises";
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

import { EMPTY_ACL, normalizeAccessControl } from "@/lib/files/accessControl";
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
  startTestUploadDirectory,
  stopTestUploadDirectory,
} from "../utils/filesystem";
import {
  clearTestMongo,
  startTestMongo,
  stopTestMongo,
} from "../utils/mongodb";
import { responseData } from "../utils/result";

const getSession = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/server", () => ({ auth: { api: { getSession } } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("server-only", () => ({}));

const owner = () =>
  fileSession({
    id: String(FILE_OWNER_ID),
    access: "Head",
    managedModules: ["Design"],
  });
const context = (id: string) => ({ params: Promise.resolve({ id }) });
const request = (url: string, method = "GET", body?: unknown) =>
  new NextRequest(`http://localhost/api/files${url}`, {
    method,
    ...(body === undefined
      ? {}
      : {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
  });

async function createGroup(memberIds = [String(FILE_MEMBER_ID)]) {
  const { POST } = await import("@/app/api/files/groups/route");
  const response = await POST(
    request("/groups", "POST", {
      name: "Website Team",
      module: "Design",
      memberIds,
    }),
  );
  expect(response.status).toBe(201);
  return (await responseData<{ group: { id: string } }>(response)).group.id;
}

async function share(
  file: { _id: unknown; updatedAt: Date; isDownloadable?: boolean },
  acl: Partial<AccessControl>,
  isDownloadable = file.isDownloadable ?? true,
) {
  const { PATCH } = await import("@/app/api/files/[id]/share/route");
  return PATCH(
    request(`/${file._id}/share`, "PATCH", {
      updatedAt: file.updatedAt.toISOString(),
      accessControl: { ...EMPTY_ACL, ...acl },
      isDownloadable,
    }),
    context(String(file._id)),
  );
}

describe("file sharing groups", () => {
  let uploadDirectory: string;
  beforeAll(async () => {
    uploadDirectory = await startTestUploadDirectory();
    await startTestMongo();
  });
  beforeEach(async () => {
    getSession.mockResolvedValue(owner());
    await User.create([
      { _id: FILE_OWNER_ID, name: "Owner" },
      { _id: FILE_MEMBER_ID, name: "Member", pizza_count: 1 },
      { _id: FILE_OTHER_MEMBER_ID, name: "Other member" },
    ]);
  });
  afterEach(clearTestMongo);
  afterAll(async () => {
    await stopTestMongo();
    await stopTestUploadDirectory(uploadDirectory);
  });

  it("requires authentication and head access for creating groups", async () => {
    const { GET, POST } = await import("@/app/api/files/groups/route");
    getSession.mockResolvedValue(null);
    expect((await GET(request("/groups"))).status).toBe(401);
    expect((await POST(request("/groups", "POST", {}))).status).toBe(401);
    getSession.mockResolvedValue(fileSession());
    expect((await POST(request("/groups", "POST", {}))).status).toBe(403);
  });

  it.each(["Head", "Core Team"])(
    "validates %s module scope and real member IDs",
    async (access) => {
      getSession.mockResolvedValue(
        fileSession({ access, managedModules: ["Design"] }),
      );
      const { POST } = await import("@/app/api/files/groups/route");
      expect(
        (
          await POST(
            request("/groups", "POST", {
              name: "Wrong module",
              module: "Cybersecurity",
              memberIds: [],
            }),
          )
        ).status,
      ).toBe(403);
      expect(
        (
          await POST(
            request("/groups", "POST", {
              name: "Missing member",
              memberIds: [String(new Types.ObjectId())],
            }),
          )
        ).status,
      ).toBe(400);
      expect(await SharingGroup.countDocuments()).toBe(0);
      expect(await AuditLog.countDocuments()).toBe(0);
    },
  );

  it("lets Core Team create an audited sharing group in its module", async () => {
    getSession.mockResolvedValue(
      fileSession({ access: "Core Team", managedModules: ["Design"] }),
    );
    const id = await createGroup();
    expect(await SharingGroup.findById(id).lean()).toMatchObject({
      module: "Design",
    });
    expect(await AuditLog.countDocuments()).toBe(1);
  });

  it("lists groups with pagination and displays members without exposing account fields", async () => {
    const id = await createGroup();
    const { GET } = await import("@/app/api/files/groups/route");
    const { GET: detail } = await import("@/app/api/files/groups/[id]/route");
    getSession.mockResolvedValue(fileSession());
    const listed = await responseData(
      await GET(request("/groups?search=Website&limit=1")),
    );
    expect(listed.pagination.total).toBe(1);
    expect(listed.items[0]).toMatchObject({
      id,
      memberCount: 1,
      canManage: false,
    });
    expect(listed.items[0].memberIds).toBeUndefined();
    const body = await responseData(
      await detail(request(`/groups/${id}`), context(id)),
    );
    expect(body.group.members[0].id).toBe(String(FILE_MEMBER_ID));
    expect(body.group.members[0].email).toBeUndefined();
    expect(body.group.fileCount).toBe(0);
    expect((await AuditLog.findOne().lean())?.after).toMatchObject({
      memberCount: 1,
      memberIds: [String(FILE_MEMBER_ID)],
    });
  });

  it.each(["Head", "Core Team"])(
    "allows creator, scoped %s and admins but rejects members and unrelated modules",
    async (access) => {
      const id = await createGroup();
      const { PATCH } = await import("@/app/api/files/groups/[id]/route");
      const body = {
        name: "Renamed",
        module: "Design",
        memberIds: [String(FILE_MEMBER_ID)],
        version: 0,
      };
      getSession.mockResolvedValue(fileSession());
      expect(
        (await PATCH(request(`/groups/${id}`, "PATCH", body), context(id)))
          .status,
      ).toBe(403);
      getSession.mockResolvedValue(
        fileSession({ access, managedModules: ["Cybersecurity"] }),
      );
      expect(
        (await PATCH(request(`/groups/${id}`, "PATCH", body), context(id)))
          .status,
      ).toBe(403);
      getSession.mockResolvedValue(
        fileSession({ access, managedModules: ["Design"] }),
      );
      expect(
        (await PATCH(request(`/groups/${id}`, "PATCH", body), context(id)))
          .status,
      ).toBe(200);
      getSession.mockResolvedValue(fileSession({ access: "Admin" }));
      expect(
        (
          await PATCH(
            request(`/groups/${id}`, "PATCH", {
              ...body,
              name: "Admin edit",
              version: 1,
            }),
            context(id),
          )
        ).status,
      ).toBe(200);
      getSession.mockResolvedValue(owner());
      expect(
        (
          await PATCH(
            request(`/groups/${id}`, "PATCH", {
              ...body,
              name: "Creator edit",
              version: 2,
            }),
            context(id),
          )
        ).status,
      ).toBe(200);
      expect(
        (await PATCH(request(`/groups/${id}`, "PATCH", body), context(id)))
          .status,
      ).toBe(409);
    },
  );

  it("applies membership changes to listings, tag discovery, Atlas and file bytes immediately", async () => {
    const id = await createGroup();
    const shared = await FileEntry.create(
      fileEntry({
        title: "Group handbook",
        tags: ["Group"],
        accessControl: { ...EMPTY_ACL, allowedGroups: [id] },
      }),
    );
    await writeFile(
      path.join(uploadDirectory, shared.storedName),
      "hello group!",
    );
    const { GET: list } = await import("@/app/api/files/route");
    const { GET: bytes } = await import("@/app/api/files/[id]/route");
    const { PATCH: editGroup } =
      await import("@/app/api/files/groups/[id]/route");
    const { searchAtlas } = await import("@/lib/atlas/search.server");
    const { parseAtlasQuery } = await import("@/lib/atlas/query");
    getSession.mockResolvedValue(fileSession());
    let listed = await responseData(await list(request("")));
    expect(listed.items).toHaveLength(1);
    expect(listed.groupNames[id]).toBe("Website Team");
    expect(listed.availableTags).toEqual([{ tag: "Group", count: 1 }]);
    expect(
      (
        await searchAtlas(
          parseAtlasQuery("type:file handbook"),
          fileSession().user,
        )
      ).items,
    ).toHaveLength(1);
    const download = await bytes(
      request(`/${shared._id}`),
      context(String(shared._id)),
    );
    expect(download.status).toBe(200);
    expect(await download.text()).toBe("hello group!");

    getSession.mockResolvedValue(owner());
    expect(
      (
        await editGroup(
          request(`/groups/${id}`, "PATCH", {
            name: "Website Team",
            module: "Design",
            memberIds: [],
            version: 0,
          }),
          context(id),
        )
      ).status,
    ).toBe(200);
    getSession.mockResolvedValue(fileSession());
    listed = await responseData(await list(request("")));
    expect(listed.items).toEqual([]);
    expect(listed.availableTags).toEqual([]);
    expect(
      (
        await searchAtlas(
          parseAtlasQuery("type:file handbook"),
          fileSession().user,
        )
      ).items,
    ).toEqual([]);
    expect(
      (await bytes(request(`/${shared._id}`), context(String(shared._id))))
        .status,
    ).toBe(403);
  });

  it("keeps independent group and direct grants when another membership is removed", async () => {
    const first = await createGroup();
    const second = await createGroup();
    await FileEntry.create([
      fileEntry({
        accessControl: { ...EMPTY_ACL, allowedGroups: [first, second] },
      }),
      fileEntry({
        accessControl: {
          ...EMPTY_ACL,
          allowedGroups: [first],
          allowedUsers: [String(FILE_MEMBER_ID)],
        },
      }),
    ]);
    await SharingGroup.updateOne({ _id: first }, { $set: { memberIds: [] } });
    getSession.mockResolvedValue(fileSession());
    const { GET } = await import("@/app/api/files/route");
    expect((await responseData(await GET(request("")))).items).toHaveLength(2);
  });

  it("updates one file's sharing and download permissions without changing its metadata or another file", async () => {
    const group = await createGroup();
    const files = await FileEntry.create([
      fileEntry({
        accessControl: {
          ...EMPTY_ACL,
          allowedUsers: [String(FILE_OTHER_MEMBER_ID)],
        },
      }),
      fileEntry({ accessControl: { ...EMPTY_ACL, allMembers: true } }),
    ]);
    expect(
      (
        await share(
          files[0],
          {
            allowedGroups: [group],
            allowedUsers: [String(FILE_OTHER_MEMBER_ID)],
          },
          false,
        )
      ).status,
    ).toBe(200);
    const updated = await FileEntry.findById(files[0]._id).lean();
    expect(updated.accessControl.allowedUsers.map(String)).toEqual([
      String(FILE_OTHER_MEMBER_ID),
    ]);
    expect(updated.accessControl.allowedGroups.map(String)).toEqual([group]);
    expect(updated.title).toBe(files[0].title);
    expect(updated.description).toBe(files[0].description);
    expect(updated.tags).toEqual(files[0].tags);
    expect(updated.storedName).toBe(files[0].storedName);
    expect(updated.isDownloadable).toBe(false);
    expect(
      (await FileEntry.findById(files[1]._id).lean()).accessControl.allMembers,
    ).toBe(true);
    const audit = await AuditLog.findOne({
      operation: "files.sharing.update",
    }).lean();
    expect(audit?.after).toMatchObject({
      allowedGroups: [group],
      allMembers: false,
      allowedUsers: [String(FILE_OTHER_MEMBER_ID)],
      allowDownload: false,
    });
    expect(audit?.target).toMatchObject({
      type: "file",
      id: String(files[0]._id),
    });
  });

  it("rejects sharing by unrelated heads, ordinary members and anonymous users", async () => {
    const group = await createGroup();
    const files = await FileEntry.create([
      fileEntry(),
      fileEntry({ uploadedBy: FILE_OTHER_MEMBER_ID }),
    ]);
    expect((await share(files[1], { allowedGroups: [group] })).status).toBe(
      403,
    );
    expect(
      await FileEntry.countDocuments({ "accessControl.allowedGroups": group }),
    ).toBe(0);
    expect(
      await AuditLog.countDocuments({ operation: "files.sharing.update" }),
    ).toBe(0);
    getSession.mockResolvedValue(fileSession());
    expect((await share(files[0], { allMembers: true })).status).toBe(403);
    getSession.mockResolvedValue(null);
    expect((await share(files[0], { allMembers: true })).status).toBe(401);
  });

  it("rejects unknown groups and missing files without partial updates", async () => {
    const file = await FileEntry.create(fileEntry());
    expect(
      (await share(file, { allowedGroups: [String(new Types.ObjectId())] }))
        .status,
    ).toBe(400);
    expect(
      (
        await share(
          { _id: new Types.ObjectId(), updatedAt: new Date() },
          { allMembers: true },
        )
      ).status,
    ).toBe(404);
    expect((await FileEntry.findById(file._id)).accessControl.allMembers).toBe(
      false,
    );
  });

  it("replaces permissions explicitly and rejects stale replacement requests", async () => {
    const group = await createGroup();
    const file = await FileEntry.create(
      fileEntry({
        accessControl: {
          ...EMPTY_ACL,
          allMembers: true,
          allowedUsers: [String(FILE_MEMBER_ID)],
        },
      }),
    );
    expect((await share(file, { allowedGroups: [group] })).status).toBe(200);
    const updated = await FileEntry.findById(file._id).lean();
    expect(updated.accessControl.allMembers).toBe(false);
    expect(updated.accessControl.allowedUsers).toEqual([]);
    await FileEntry.updateOne(
      { _id: file._id },
      { $set: { updatedAt: new Date("2020-01-01") } },
      { timestamps: false },
    );
    expect((await share(file, { allMembers: true })).status).toBe(409);
    expect((await FileEntry.findById(file._id)).accessControl.allMembers).toBe(
      false,
    );
  });

  it("rejects a concurrent save instead of silently overwriting sharing", async () => {
    const file = await FileEntry.create(fileEntry());
    const responses = await Promise.all([
      share(file, { allowedUsers: [String(FILE_MEMBER_ID)] }),
      share(file, { allowedUsers: [String(FILE_OTHER_MEMBER_ID)] }),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([
      200, 409,
    ]);
    const winner = responses.findIndex((response) => response.status === 200);
    expect(
      (await FileEntry.findById(file._id)).accessControl.allowedUsers.map(
        String,
      ),
    ).toEqual([String([FILE_MEMBER_ID, FILE_OTHER_MEMBER_ID][winner])]);
  });

  it("rolls back all sharing changes if the audit write is rejected", async () => {
    const group = await createGroup();
    const file = await FileEntry.create(fileEntry());
    const db = mongoose.connection.db!;
    await db.command({
      collMod: AuditLog.collection.collectionName,
      validator: { operation: { $ne: "files.sharing.update" } },
    });
    try {
      expect((await share(file, { allowedGroups: [group] })).status).toBe(500);
      expect(
        (await FileEntry.findById(file._id)).accessControl.allowedGroups,
      ).toEqual([]);
      expect((await SharingGroup.findById(group))?.grantRevision).toBe(0);
    } finally {
      await db.command({
        collMod: AuditLog.collection.collectionName,
        validator: {},
      });
    }
  });

  it("deletes a group from restricted and all-member files while preserving other access and metadata", async () => {
    const group = await createGroup();
    const remainingGroup = await createGroup();
    const otherAccess: AccessControl = {
      ...EMPTY_ACL,
      allowedGroups: [remainingGroup],
      allowedUsers: [String(FILE_MEMBER_ID)],
      allowedModules: ["Design"],
      allowedClubPositions: ["Secretary"],
      allowedModulePositions: ["Coordinator"],
    };
    const files = await FileEntry.create([
      fileEntry({ accessControl: { ...EMPTY_ACL, allowedGroups: [group] } }),
      fileEntry({
        accessControl: {
          ...otherAccess,
          allMembers: true,
          allowedGroups: [group, remainingGroup],
        },
      }),
      fileEntry({
        uploadedBy: FILE_OTHER_MEMBER_ID,
        accessControl: {
          ...otherAccess,
          allowedGroups: [group, remainingGroup],
        },
      }),
      fileEntry(),
    ]);
    const { DELETE } = await import("@/app/api/files/groups/[id]/route");
    expect(
      (
        await DELETE(
          request(`/groups/${group}`, "DELETE", { version: 0 }),
          context(group),
        )
      ).status,
    ).toBe(200);
    expect(await SharingGroup.findById(group)).toBeNull();
    expect(await SharingGroup.findById(remainingGroup)).not.toBeNull();
    expect(
      await FileEntry.countDocuments({ "accessControl.allowedGroups": group }),
    ).toBe(0);
    for (const [index, file] of files.entries()) {
      const updated = await FileEntry.findById(file._id).lean();
      expect(updated).toMatchObject({
        title: file.title,
        description: file.description,
        tags: file.tags,
        uploadedBy: file.uploadedBy,
        storedName: file.storedName,
        isDownloadable: file.isDownloadable,
      });
      const acl = normalizeAccessControl(updated.accessControl);
      expect(acl).toEqual(
        index === 1 || index === 2
          ? { ...otherAccess, allMembers: index === 1 }
          : EMPTY_ACL,
      );
      if (index === 3) expect(updated.updatedAt).toEqual(file.updatedAt);
    }
    const audit = await AuditLog.findOne({
      operation: "files.groups.delete",
    }).lean();
    expect(audit).toMatchObject({
      target: { type: "sharing_group", id: group },
      after: { detachedFileCount: 3 },
    });
    expect(await Notification.countDocuments()).toBe(0);
    const updated = await FileEntry.findById(files[1]._id).lean();
    expect((await share(updated, otherAccess)).status).toBe(200);
    getSession.mockResolvedValue(fileSession());
    const { GET } = await import("@/app/api/files/route");
    const listed = await responseData(await GET(request("")));
    expect(
      listed.items.map((file: { _id: string }) => file._id).sort(),
    ).toEqual([String(files[1]._id), String(files[2]._id)].sort());
  });

  it("rolls back group deletion and file cleanup if the audit write fails", async () => {
    const group = await createGroup();
    const file = await FileEntry.create(
      fileEntry({
        accessControl: {
          ...EMPTY_ACL,
          allMembers: true,
          allowedGroups: [group],
        },
      }),
    );
    const { DELETE } = await import("@/app/api/files/groups/[id]/route");
    const db = mongoose.connection.db!;
    await db.command({
      collMod: AuditLog.collection.collectionName,
      validator: { operation: { $ne: "files.groups.delete" } },
    });
    try {
      expect(
        (
          await DELETE(
            request(`/groups/${group}`, "DELETE", { version: 0 }),
            context(group),
          )
        ).status,
      ).toBe(500);
      expect(await SharingGroup.findById(group)).not.toBeNull();
      const updated = await FileEntry.findById(file._id).lean();
      expect(updated.accessControl.allowedGroups.map(String)).toEqual([group]);
      expect(updated.updatedAt).toEqual(file.updatedAt);
      expect(
        await AuditLog.countDocuments({ operation: "files.groups.delete" }),
      ).toBe(0);
    } finally {
      await db.command({
        collMod: AuditLog.collection.collectionName,
        validator: {},
      });
    }
  });

  it.each(["Head", "Core Team"])(
    "rejects unauthorized %s and stale deletion without changing file references",
    async (access) => {
      const group = await createGroup();
      const file = await FileEntry.create(
        fileEntry({ accessControl: { ...EMPTY_ACL, allowedGroups: [group] } }),
      );
      const { DELETE } = await import("@/app/api/files/groups/[id]/route");
      getSession.mockResolvedValue(fileSession());
      expect(
        (
          await DELETE(
            request(`/groups/${group}`, "DELETE", { version: 0 }),
            context(group),
          )
        ).status,
      ).toBe(403);
      getSession.mockResolvedValue(
        fileSession({ access: "Head", managedModules: ["Cybersecurity"] }),
      );
      expect(
        (
          await DELETE(
            request(`/groups/${group}`, "DELETE", { version: 0 }),
            context(group),
          )
        ).status,
      ).toBe(403);
      getSession.mockResolvedValue(owner());
      expect(
        (
          await DELETE(
            request(`/groups/${group}`, "DELETE", { version: 1 }),
            context(group),
          )
        ).status,
      ).toBe(409);
      expect(await SharingGroup.findById(group)).not.toBeNull();
      expect(
        (await FileEntry.findById(file._id)).accessControl.allowedGroups.map(
          String,
        ),
      ).toEqual([group]);
    },
  );

  it("leaves no dangling group references when deletion races with sharing", async () => {
    const group = await createGroup();
    const file = await FileEntry.create(fileEntry());
    const { DELETE } = await import("@/app/api/files/groups/[id]/route");
    const [deleted, shared] = await Promise.all([
      DELETE(
        request(`/groups/${group}`, "DELETE", { version: 0 }),
        context(group),
      ),
      share(file, { allowedGroups: [group] }),
    ]);
    expect(deleted.status).toBe(200);
    expect([200, 400, 409]).toContain(shared.status);
    expect(await SharingGroup.findById(group)).toBeNull();
    expect(
      await FileEntry.countDocuments({ "accessControl.allowedGroups": group }),
    ).toBe(0);
    expect(
      (
        await share(await FileEntry.findById(file._id).orFail(), {
          allowedGroups: [group],
        })
      ).status,
    ).toBe(400);
    expect(
      await AuditLog.countDocuments({ operation: "files.groups.delete" }),
    ).toBe(1);
  });

  it("edits metadata without altering sharing and rejects permissions in the metadata endpoint", async () => {
    const group = await createGroup();
    const file = await FileEntry.create(
      fileEntry({
        accessControl: { ...EMPTY_ACL, allowedGroups: [group] },
      }),
    );
    const { PATCH } = await import("@/app/api/files/[id]/route");
    const edit = (body: unknown) =>
      PATCH(request(`/${file._id}`, "PATCH", body), context(String(file._id)));
    expect((await edit({ accessControl: EMPTY_ACL })).status).toBe(400);
    expect((await edit({ isDownloadable: false })).status).toBe(400);
    expect(
      (
        await edit({
          title: "Updated handbook",
          description: "Updated description",
          tags: ["Reference"],
          updatedAt: file.updatedAt.toISOString(),
        })
      ).status,
    ).toBe(200);
    const updated = await FileEntry.findById(file._id).lean();
    expect(updated).toMatchObject({
      title: "Updated handbook",
      description: "Updated description",
      tags: ["Reference"],
      isDownloadable: file.isDownloadable,
    });
    expect(updated.accessControl.allowedGroups.map(String)).toEqual([group]);
    expect(
      (
        await edit({
          title: "Stale title",
          updatedAt: file.updatedAt.toISOString(),
        })
      ).status,
    ).toBe(409);
  });
});
