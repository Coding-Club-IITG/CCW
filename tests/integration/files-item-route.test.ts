import { NextRequest } from "next/server";
import { responseData, responseError } from "../utils/result";
import path from "path";
import { writeFile } from "fs/promises";
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
  FILE_OWNER_ID,
  fileEntry,
  fileSession,
  restrictedAcl,
} from "../fixtures/files";

const getSession = vi.hoisted(() => vi.fn());
const invalidateCache = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession } },
}));

vi.mock("@/lib/cache", () => ({
  invalidateCache,
}));

describe("individual file route", () => {
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
    invalidateCache.mockReset();
  });

  afterAll(async () => {
    await stopTestMongo();
    await stopTestUploadDirectory(uploadDirectory);
  });

  it("rejects requests without a session before resolving file data", async () => {
    const { GET } = await import("@/app/api/files/[id]/route");
    getSession.mockResolvedValueOnce(null);

    const response = await GET(fileRequest("missing"), context("invalid-id"));

    expect(response.status).toBe(401);
  });

  it("rejects malformed file IDs", async () => {
    const { GET } = await import("@/app/api/files/[id]/route");

    const response = await GET(fileRequest("bad-id"), context("bad-id"));

    expect(response.status).toBe(400);
    expect(await responseError(response)).toMatchObject({
      code: "VALIDATION_ERROR",
      fields: { id: expect.any(Array) },
    });
  });

  it("does not serve file bytes when the ACL denies access", async () => {
    const FileEntry = (await import("@/models/FileEntry")).default;
    const { GET } = await import("@/app/api/files/[id]/route");
    const saved = await FileEntry.create(fileEntry());
    await writeFile(path.join(uploadDirectory, saved.storedName), "secret");

    const response = await GET(
      fileRequest(saved._id.toString()),
      context(saved._id.toString()),
    );

    expect(response.status).toBe(403);
    expect(await responseError(response)).toMatchObject({
      message: "Forbidden.",
    });
  });

  it("blocks direct navigation to a view-only file", async () => {
    const FileEntry = (await import("@/models/FileEntry")).default;
    const { GET } = await import("@/app/api/files/[id]/route");
    const saved = await FileEntry.create(
      fileEntry({
        isDownloadable: false,
        accessControl: { ...restrictedAcl, allMembers: true },
      }),
    );
    await writeFile(path.join(uploadDirectory, saved.storedName), "view only");

    const response = await GET(
      fileRequest(saved._id.toString(), {
        "sec-fetch-dest": "document",
        "sec-fetch-mode": "navigate",
      }),
      context(saved._id.toString()),
    );

    expect(response.status).toBe(403);
    expect(await responseError(response)).toMatchObject({
      message: "This file is view-only and cannot be opened directly.",
    });
  });

  it("streams downloadable content with private attachment headers", async () => {
    const FileEntry = (await import("@/models/FileEntry")).default;
    const { GET } = await import("@/app/api/files/[id]/route");
    const content = "hello files!";
    const saved = await FileEntry.create(
      fileEntry({
        originalName: "club notes.txt",
        size: Buffer.byteLength(content),
        accessControl: { ...restrictedAcl, allMembers: true },
      }),
    );
    await writeFile(path.join(uploadDirectory, saved.storedName), content);

    const response = await GET(
      fileRequest(saved._id.toString()),
      context(saved._id.toString()),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/plain");
    expect(response.headers.get("content-disposition")).toContain("attachment");
    expect(response.headers.get("content-disposition")).toContain(
      "club%20notes.txt",
    );
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.text()).toBe(content);
  });

  it("adds restrictive embedding headers for view-only content", async () => {
    const FileEntry = (await import("@/models/FileEntry")).default;
    const { GET } = await import("@/app/api/files/[id]/route");
    const content = "read in viewer";
    const saved = await FileEntry.create(
      fileEntry({
        size: Buffer.byteLength(content),
        isDownloadable: false,
        accessControl: { ...restrictedAcl, allMembers: true },
      }),
    );
    await writeFile(path.join(uploadDirectory, saved.storedName), content);

    const response = await GET(
      fileRequest(saved._id.toString()),
      context(saved._id.toString()),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toBe("inline");
    expect(response.headers.get("x-frame-options")).toBe("SAMEORIGIN");
    expect(response.headers.get("content-security-policy")).toContain(
      "frame-ancestors 'self'",
    );
    expect(response.headers.get("cross-origin-resource-policy")).toBe(
      "same-origin",
    );
  });

  it("returns gone when accessible metadata points to missing disk data", async () => {
    const FileEntry = (await import("@/models/FileEntry")).default;
    const { GET } = await import("@/app/api/files/[id]/route");
    const saved = await FileEntry.create(
      fileEntry({
        accessControl: { ...restrictedAcl, allMembers: true },
      }),
    );

    const response = await GET(
      fileRequest(saved._id.toString()),
      context(saved._id.toString()),
    );

    expect(response.status).toBe(404);
  });

  it("prevents non-managers from editing metadata", async () => {
    const FileEntry = (await import("@/models/FileEntry")).default;
    const { PATCH } = await import("@/app/api/files/[id]/route");
    const saved = await FileEntry.create(
      fileEntry({
        accessControl: { ...restrictedAcl, allMembers: true },
      }),
    );

    const response = await PATCH(
      jsonRequest(saved._id.toString(), "PATCH", { title: "Changed" }),
      context(saved._id.toString()),
    );

    expect(response.status).toBe(403);
    expect((await FileEntry.findById(saved._id).lean())?.title).toBe(
      "Club handbook",
    );
  });

  it("validates edits and changes only whitelisted metadata", async () => {
    const FileEntry = (await import("@/models/FileEntry")).default;
    const { PATCH } = await import("@/app/api/files/[id]/route");
    getSession.mockResolvedValue(fileSession({ id: FILE_OWNER_ID.toString() }));
    const saved = await FileEntry.create(fileEntry());

    const invalid = await PATCH(
      jsonRequest(saved._id.toString(), "PATCH", {
        isDownloadable: "yes",
      }),
      context(saved._id.toString()),
    );
    expect(invalid.status).toBe(400);

    const response = await PATCH(
      jsonRequest(saved._id.toString(), "PATCH", {
        title: " Updated handbook ",
        folder: " Policies ",
        storedName: "attacker-controlled.txt",
        uploadedBy: FILE_MEMBER_ID.toString(),
      }),
      context(saved._id.toString()),
    );
    const body = await responseData(response);
    const updated = await FileEntry.findById(saved._id).lean();

    expect(response.status).toBe(200);
    expect(body.file.storedName).toBeUndefined();
    expect(updated).toMatchObject({
      title: "Updated handbook",
      folder: "Policies",
      storedName: saved.storedName,
    });
    expect(updated?.uploadedBy.toString()).toBe(FILE_OWNER_ID.toString());
  });

  it("deletes owned metadata and disk content and invalidates the file cache", async () => {
    const FileEntry = (await import("@/models/FileEntry")).default;
    const { DELETE } = await import("@/app/api/files/[id]/route");
    getSession.mockResolvedValue(fileSession({ id: FILE_OWNER_ID.toString() }));
    const saved = await FileEntry.create(fileEntry());
    await writeFile(path.join(uploadDirectory, saved.storedName), "delete me");

    const response = await DELETE(
      fileRequest(saved._id.toString(), {}, "DELETE"),
      context(saved._id.toString()),
    );

    expect(response.status).toBe(200);
    expect(await responseData(response)).toEqual({ success: true });
    expect(await FileEntry.findById(saved._id)).toBeNull();
    expect(await listTestUploads(uploadDirectory)).toEqual([]);
    expect(invalidateCache).toHaveBeenCalledWith("files");
  });
});

function context(id: string) {
  return { params: Promise.resolve({ id }) };
}

function fileRequest(
  id: string,
  headers: Record<string, string> = {},
  method = "GET",
) {
  return new NextRequest(`http://localhost/api/files/${id}`, {
    method,
    headers,
  });
}

function jsonRequest(
  id: string,
  method: string,
  body: Record<string, unknown>,
) {
  return new NextRequest(`http://localhost/api/files/${id}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
