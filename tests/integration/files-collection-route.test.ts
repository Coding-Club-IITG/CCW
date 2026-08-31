import { NextRequest } from "next/server";
import path from "path";
import { readFile } from "fs/promises";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import AuditLog from "@/models/AuditLog";
import {
  FILE_MEMBER_ID,
  FILE_OTHER_MEMBER_ID,
  fileEntry,
  fileSession,
  restrictedAcl,
} from "../fixtures/files";
import {
  clearTestMongo,
  startTestMongo,
  stopTestMongo,
} from "../utils/mongodb";
import {
  listTestUploads,
  startTestUploadDirectory,
  stopTestUploadDirectory,
} from "../utils/filesystem";
import { responseData, responseError } from "../utils/result";

const getSession = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession } },
}));

vi.mock("server-only", () => ({}));

describe("files collection route", () => {
  let uploadDirectory: string;

  beforeAll(async () => {
    uploadDirectory = await startTestUploadDirectory();
    await startTestMongo();
    getSession.mockResolvedValue(fileSession());
  });

  afterEach(async () => {
    await clearTestMongo();
    for (const name of await listTestUploads(uploadDirectory)) {
      await import("fs/promises").then(({ unlink }) =>
        unlink(path.join(uploadDirectory, name)),
      );
    }
    getSession.mockResolvedValue(fileSession());
  });

  afterAll(async () => {
    await stopTestMongo();
    await stopTestUploadDirectory(uploadDirectory);
  });

  it("rejects listing files without a session", async () => {
    const { GET } = await import("@/app/api/files/route");
    getSession.mockResolvedValueOnce(null);

    const response = await GET(new NextRequest("http://localhost/api/files"));

    expect(response.status).toBe(401);
    expect(await responseError(response)).toMatchObject({
      code: "UNAUTHENTICATED",
      message: "Unauthorized",
    });
  });

  it("lists only ACL-accessible files with pagination and no stored names", async () => {
    const FileEntry = (await import("@/models/FileEntry")).default;
    const { GET } = await import("@/app/api/files/route");
    await FileEntry.create([
      fileEntry({
        title: "Public",
        accessControl: { ...restrictedAcl, allMembers: true },
      }),
      fileEntry({
        title: "Direct share",
        accessControl: {
          ...restrictedAcl,
          allowedUsers: [FILE_MEMBER_ID],
        },
      }),
      fileEntry({
        title: "Private",
        uploadedBy: FILE_OTHER_MEMBER_ID,
      }),
    ]);

    const response = await GET(
      new NextRequest("http://localhost/api/files?page=1&limit=1"),
    );
    const body = await responseData(response);

    expect(response.status).toBe(200);
    expect(body.items).toHaveLength(1);
    expect(body.items[0].storedName).toBeUndefined();
    expect(body.items[0].folder).toBeUndefined();
    expect(body.pagination).toMatchObject({
      page: 1,
      limit: 1,
      total: 2,
      totalPages: 2,
    });
    expect(body.availableTags).toEqual([{ tag: "General", count: 2 }]);
  });

  it("searches literally and applies AND tag filters before pagination", async () => {
    const FileEntry = (await import("@/models/FileEntry")).default;
    const { GET } = await import("@/app/api/files/route");
    const visible = { ...restrictedAcl, allMembers: true };
    await FileEntry.create([
      fileEntry({
        title: "Literal [guide] alpha",
        tags: ["Design", "Minutes"],
        accessControl: visible,
      }),
      fileEntry({
        title: "Literal [guide] beta",
        tags: ["design", "minutes"],
        accessControl: visible,
      }),
      fileEntry({
        title: "Literal g decoy",
        tags: ["Design"],
        accessControl: visible,
      }),
      fileEntry({
        title: "Private literal [guide]",
        tags: ["Secret"],
        uploadedBy: FILE_OTHER_MEMBER_ID,
      }),
    ]);

    const response = await GET(
      new NextRequest(
        "http://localhost/api/files?search=%5Bguide%5D&tag=Design&tag=Minutes&page=2&limit=1",
      ),
    );
    const body = await responseData(response);

    expect(body.items).toHaveLength(1);
    expect(body.pagination).toMatchObject({ total: 2, totalPages: 2, page: 2 });
    expect(body.availableTags).toEqual([
      { tag: "Design", count: 3 },
      { tag: "Minutes", count: 2 },
    ]);
  });

  it("derives tag discovery only from ACL-accessible files", async () => {
    const FileEntry = (await import("@/models/FileEntry")).default;
    const { GET } = await import("@/app/api/files/route");
    await FileEntry.create([
      fileEntry({
        tags: ["Shared"],
        accessControl: { ...restrictedAcl, allMembers: true },
      }),
      fileEntry({
        tags: ["Direct"],
        accessControl: { ...restrictedAcl, allowedUsers: [FILE_MEMBER_ID] },
      }),
      fileEntry({
        tags: ["Secret"],
        uploadedBy: FILE_OTHER_MEMBER_ID,
      }),
    ]);

    const body = await responseData(
      await GET(new NextRequest("http://localhost/api/files?tag=Shared")),
    );

    expect(body.availableTags).toEqual([
      { tag: "Direct", count: 1 },
      { tag: "Shared", count: 1 },
    ]);
  });

  it("searches and filters file tags in Atlas without bypassing ACLs", async () => {
    const FileEntry = (await import("@/models/FileEntry")).default;
    const { parseAtlasQuery } = await import("@/lib/atlas/query");
    const { searchAtlas } = await import("@/lib/atlas/search.server");
    await FileEntry.create([
      fileEntry({
        title: "Design handbook",
        tags: ["Design", "Minutes"],
        accessControl: { ...restrictedAcl, allMembers: true },
      }),
      fileEntry({
        title: "Private handbook",
        tags: ["Minutes"],
        uploadedBy: FILE_OTHER_MEMBER_ID,
      }),
    ]);

    const result = await searchAtlas(
      parseAtlasQuery("type:file tag:Minutes handbook"),
      fileSession().user,
    );

    expect(result.partialFailures).toEqual([]);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      kind: "file",
      title: "Design handbook",
      tags: ["Design", "Minutes"],
    });
  });

  it("rejects uploads from members who cannot upload", async () => {
    const { POST } = await import("@/app/api/files/route");

    const response = await POST(uploadRequest());

    expect(response.status).toBe(403);
    expect(await listTestUploads(uploadDirectory)).toEqual([]);
  });

  it("validates required upload metadata before touching disk", async () => {
    const { POST } = await import("@/app/api/files/route");
    getSession.mockResolvedValueOnce(fileSession({ access: "Admin" }));

    const response = await POST(uploadRequest({ title: "   " }));

    expect(response.status).toBe(400);
    expect(await responseError(response)).toMatchObject({
      message: "Title is required.",
    });
    expect(await listTestUploads(uploadDirectory)).toEqual([]);
  });

  it("requires 1-10 valid tags on upload", async () => {
    const { POST } = await import("@/app/api/files/route");
    getSession.mockResolvedValue(fileSession({ access: "Admin" }));

    const missing = await POST(uploadRequest({ tags: [] }));
    const tooMany = await POST(
      uploadRequest({
        tags: Array.from({ length: 11 }, (_, index) => `Tag ${index}`),
      }),
    );
    const tooLong = await POST(uploadRequest({ tags: ["x".repeat(51)] }));

    expect(missing.status).toBe(400);
    expect(tooMany.status).toBe(400);
    expect(tooLong.status).toBe(400);
    expect(await listTestUploads(uploadDirectory)).toEqual([]);
  });

  it("prevents module heads from uploading under another module", async () => {
    const { POST } = await import("@/app/api/files/route");
    getSession.mockResolvedValueOnce(
      fileSession({
        access: "Head",
        managedModules: ["Design"],
      }),
    );

    const response = await POST(
      uploadRequest({ uploaderModule: "Competitive Programming" }),
    );

    expect(response.status).toBe(403);
    expect(await listTestUploads(uploadDirectory)).toEqual([]);
  });

  it("persists valid metadata and file bytes in the isolated directory", async () => {
    const FileEntry = (await import("@/models/FileEntry")).default;
    const { POST } = await import("@/app/api/files/route");
    getSession.mockResolvedValueOnce(
      fileSession({
        access: "Head",
        managedModules: ["Design"],
      }),
    );

    const response = await POST(
      uploadRequest({
        uploaderModule: "Design",
        tags: [" Minutes  ", "minutes", "Meeting   Notes"],
        accessControl: JSON.stringify({
          ...restrictedAcl,
          allowedModules: ["Design"],
        }),
      }),
    );
    const body = await responseData(response);
    const saved = await FileEntry.findById(body.file._id).lean();

    expect(response.status).toBe(201);
    expect(body.file.storedName).toBeUndefined();
    expect(body.file.folder).toBeUndefined();
    expect(saved).toMatchObject({
      title: "Meeting notes",
      originalName: "notes.txt",
      mimeType: "text/plain",
      size: 12,
      tags: ["Minutes", "Meeting Notes"],
      uploaderModule: "Design",
      isDownloadable: true,
    });
    expect(saved?.storedName).toMatch(/^[0-9a-f-]+\.txt$/);
    expect(
      await readFile(path.join(uploadDirectory, saved!.storedName), "utf8"),
    ).toBe("hello files!");
    const audit = await AuditLog.findOne().lean();
    expect(audit).toMatchObject({
      category: "files",
      action: "upload",
      operation: "files.upload",
      after: {
        title: "Meeting notes",
        tags: ["Minutes", "Meeting Notes"],
        mimeType: "text/plain",
        size: 12,
        allowDownload: true,
      },
    });
    const serialized = JSON.stringify(audit);
    expect(serialized).not.toContain("notes.txt");
    expect(serialized).not.toContain(uploadDirectory);
  });

  it("removes the disk file when metadata persistence fails", async () => {
    const FileEntry = (await import("@/models/FileEntry")).default;
    const { POST } = await import("@/app/api/files/route");
    getSession.mockResolvedValueOnce(fileSession({ access: "Admin" }));
    const create = vi
      .spyOn(FileEntry, "create")
      .mockRejectedValueOnce(new Error("database unavailable"));

    const response = await POST(uploadRequest());

    expect(response.status).toBe(500);
    expect(await listTestUploads(uploadDirectory)).toEqual([]);
    expect(await AuditLog.countDocuments()).toBe(0);
    create.mockRestore();
  });
});

function uploadRequest(
  overrides: Partial<{
    title: string;
    uploaderModule: string;
    accessControl: string;
    tags: string[];
  }> = {},
) {
  const form = new FormData();
  form.set(
    "file",
    new File(["hello files!"], "notes.txt", { type: "text/plain" }),
  );
  form.set("title", overrides.title ?? "Meeting notes");
  form.set("description", "Weekly notes");
  for (const tag of overrides.tags ?? ["Minutes"]) form.append("tags", tag);
  form.set("isDownloadable", "true");
  form.set("uploaderModule", overrides.uploaderModule ?? "null");
  form.set(
    "accessControl",
    overrides.accessControl ??
      JSON.stringify({ ...restrictedAcl, allMembers: true }),
  );
  return new NextRequest("http://localhost/api/files", {
    method: "POST",
    body: form,
  });
}
