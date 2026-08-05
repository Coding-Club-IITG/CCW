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
import {
  FILE_MEMBER_ID,
  FILE_OTHER_MEMBER_ID,
  fileEntry,
  fileSession,
  restrictedAcl,
} from "../fixtures/files";

const getSession = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession } },
}));

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
    expect(await response.json()).toEqual({ error: "Unauthorized" });
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
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.items).toHaveLength(1);
    expect(body.items[0].storedName).toBeUndefined();
    expect(body.pagination).toMatchObject({
      page: 1,
      limit: 1,
      total: 2,
      totalPages: 2,
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
    expect(await response.json()).toEqual({ error: "Title is required." });
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
        accessControl: JSON.stringify({
          ...restrictedAcl,
          allowedModules: ["Design"],
        }),
      }),
    );
    const body = await response.json();
    const saved = await FileEntry.findById(body.file._id).lean();

    expect(response.status).toBe(201);
    expect(saved).toMatchObject({
      title: "Meeting notes",
      originalName: "notes.txt",
      mimeType: "text/plain",
      size: 12,
      uploaderModule: "Design",
      isDownloadable: true,
    });
    expect(saved?.storedName).toMatch(/^[0-9a-f-]+\.txt$/);
    expect(
      await readFile(path.join(uploadDirectory, saved!.storedName), "utf8"),
    ).toBe("hello files!");
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
    create.mockRestore();
  });
});

function uploadRequest(
  overrides: Partial<{
    title: string;
    uploaderModule: string;
    accessControl: string;
  }> = {},
) {
  const form = new FormData();
  form.set(
    "file",
    new File(["hello files!"], "notes.txt", { type: "text/plain" }),
  );
  form.set("title", overrides.title ?? "Meeting notes");
  form.set("description", "Weekly notes");
  form.set("folder", "Minutes");
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
