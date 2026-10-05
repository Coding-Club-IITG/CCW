import { S3Client } from "@aws-sdk/client-s3";
import { NextRequest } from "next/server";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  it,
  vi,
} from "vitest";

import { MODULES } from "@/lib/constants";
import AuditLog from "@/models/AuditLog";
import FileEntry from "@/models/FileEntry";
import Recruitment from "@/models/Recruitment";

import { fileSession, FILE_OWNER_ID } from "../fixtures/files";
import { recruitmentPdf } from "../fixtures/recruitment";
import {
  startTestMongo,
  clearTestMongo,
  stopTestMongo,
} from "../utils/mongodb";
import { responseData } from "../utils/result";

const getSession = vi.hoisted(() => vi.fn());
const revalidatePath = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/server", () => ({ auth: { api: { getSession } } }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath }));

const objects = new Map<string, Buffer>();
let failDelete = false;
let reads = 0;
beforeAll(async () => {
  for (const [key, value] of Object.entries({
    UPLOAD_STORAGE: "r2",
    R2_ENDPOINT: "https://r2.example.test",
    R2_BUCKET: "ccw-uploads",
    R2_ACCESS_KEY_ID: "test-key",
    R2_SECRET_ACCESS_KEY: "test-secret",
  }))
    vi.stubEnv(key, value);
  await startTestMongo();
});
beforeEach(() => {
  getSession.mockResolvedValue(
    fileSession({ access: "Admin", id: FILE_OWNER_ID.toString() }),
  );
  // Replace the SDK transport boundary; application storage, authorization and transactions are real.
  vi.spyOn(S3Client.prototype, "send").mockImplementation((async (command: {
    constructor: { name: string };
    input: Record<string, unknown>;
  }) => {
    const { Key, Body, Range, Bucket } = command.input;
    expect(Bucket).toBe("ccw-uploads");
    const key = String(Key);
    if (command.constructor.name === "PutObjectCommand") {
      objects.set(key, Buffer.from(Body as Uint8Array));
      return {};
    }
    if (command.constructor.name === "DeleteObjectCommand") {
      if (failDelete) throw new Error("R2 removal unavailable");
      objects.delete(key);
      return {};
    }
    const bytes = objects.get(key);
    reads++;
    if (!bytes)
      throw Object.assign(new Error("missing"), { name: "NoSuchKey" });
    if (command.constructor.name === "HeadObjectCommand")
      return { ContentLength: bytes.length, LastModified: new Date() };
    if (command.constructor.name === "GetObjectCommand") {
      const match =
        typeof Range === "string" ? /^bytes=(\d+)-(\d+)$/.exec(Range) : null;
      const part = match
        ? bytes.subarray(Number(match[1]), Number(match[2]) + 1)
        : bytes;
      return {
        Body: {
          transformToWebStream: () => new Response(new Uint8Array(part)).body,
        },
      };
    }
    throw new Error("Unexpected SDK operation");
  }) as never);
});
afterEach(async () => {
  objects.clear();
  reads = 0;
  failDelete = false;
  await clearTestMongo();
});
afterAll(async () => {
  await stopTestMongo();
  vi.unstubAllEnvs();
});

const context = (id: unknown) => ({
  params: Promise.resolve({ id: String(id) }),
});
function imageRequest(size = 4, mime = "image/png") {
  const form = new FormData();
  form.set(
    "file",
    new File([new Uint8Array(size)], "image.png", { type: mime }),
  );
  return new NextRequest("http://localhost/upload", {
    method: "POST",
    body: form,
  });
}

const categories = [
  [
    "blog/",
    () => import("@/app/api/admin/blog/upload-image/route"),
    () => import("@/app/api/blog/assets/[id]/route"),
    5,
  ],
  [
    "events/",
    () => import("@/app/api/admin/events/upload-image/route"),
    () => import("@/app/api/events/assets/[id]/route"),
    10,
  ],
  [
    "projects/",
    () => import("@/app/api/admin/projects/upload-image/route"),
    () => import("@/app/api/projects/assets/[id]/route"),
    5,
  ],
  [
    "avatars/",
    () => import("@/app/api/profile/upload-image/route"),
    () => import("@/app/api/profile/assets/[id]/route"),
    2,
  ],
] as const;
it.each(categories)(
  "uploads and serves %s through existing routes with no disk files",
  async (prefix, upload, asset, limit) => {
    const { POST } = await upload();
    const { GET } = await asset();
    getSession.mockResolvedValueOnce(null);
    expect((await POST(imageRequest())).status).toBe(401);
    expect((await POST(imageRequest(limit * 1024 * 1024 + 1))).status).toBe(
      400,
    );
    expect((await POST(imageRequest(4, "text/plain"))).status).toBe(400);
    expect(objects.size).toBe(0);
    const response = await POST(imageRequest());
    expect(response.status).toBe(201);
    const body = await responseData(response);
    expect(objects.has(`${prefix}${body.filename}`)).toBe(true);
    const served = await GET(
      new NextRequest(`http://localhost${body.url}`),
      context(body.filename),
    );
    expect(served.status).toBe(200);
    expect(served.headers.get("cache-control")).toContain("immutable");
    expect((await served.arrayBuffer()).byteLength).toBe(4);
    objects.clear();
    expect(
      (
        await GET(
          new NextRequest(`http://localhost${body.url}`),
          context(body.filename),
        )
      ).status,
    ).toBe(404);
  },
);

it("removes an R2 image after an audit failure", async () => {
  const { POST } = await import("@/app/api/admin/blog/upload-image/route");
  vi.spyOn(AuditLog, "create").mockRejectedValueOnce(
    new Error("audit unavailable"),
  );
  expect((await POST(imageRequest())).status).toBe(500);
  expect(objects.size).toBe(0);
});

function fileRequest() {
  const form = new FormData();
  form.set(
    "file",
    new File(["private file"], "file.txt", { type: "text/plain" }),
  );
  form.set("title", "Private file");
  form.append("tags", "Notes");
  form.set("isDownloadable", "true");
  return new NextRequest("http://localhost/api/files", {
    method: "POST",
    body: form,
  });
}
it("keeps a committed file if post-commit invalidation fails, and preserves it on failed deletion", async () => {
  const { POST } = await import("@/app/api/files/route");
  const { GET, DELETE } = await import("@/app/api/files/[id]/route");
  revalidatePath.mockImplementationOnce(() => {
    throw new Error("invalidation failed");
  });
  expect((await POST(fileRequest())).status).toBe(201);
  const file = (await FileEntry.findOne().lean())!;
  const request = new NextRequest(`http://localhost/api/files/${file._id}`);
  getSession.mockResolvedValueOnce(fileSession());
  expect((await GET(request, context(file._id))).status).toBe(403);
  expect(reads).toBe(0);
  const result = await GET(request, context(file._id));
  expect(await result.text()).toBe("private file");
  const audit = vi
    .spyOn(AuditLog, "create")
    .mockRejectedValueOnce(new Error("audit unavailable"));
  expect((await DELETE(request, context(file._id))).status).toBe(500);
  expect(await FileEntry.findById(file._id)).not.toBeNull();
  expect(objects.has(`files/${file.storedName}`)).toBe(true);
  audit.mockRestore();
  failDelete = true;
  expect((await DELETE(request, context(file._id))).status).toBe(200);
  expect(await FileEntry.findById(file._id)).toBeNull();
  expect(await AuditLog.countDocuments({ operation: "files.delete" })).toBe(1);
  expect(objects.size).toBe(1); // private orphan; logged best-effort cleanup
});

it("cleans a new file object when its metadata transaction fails", async () => {
  const { POST } = await import("@/app/api/files/route");
  vi.spyOn(AuditLog, "create").mockRejectedValueOnce(
    new Error("audit unavailable"),
  );
  expect((await POST(fileRequest())).status).toBe(500);
  expect(objects.size).toBe(0);
  expect(await FileEntry.countDocuments()).toBe(0);
});

it("retains PDF publication timing, byte ranges and replacement rollback on R2", async () => {
  const { POST } =
    await import("@/app/api/admin/recruitment/[id]/documents/route");
  const { GET } = await import("@/app/api/recruitment/documents/[id]/route");
  const edition = await Recruitment.create({
    year: 2026,
    season: "Winter",
    createdBy: FILE_OWNER_ID,
  });
  const upload = () => {
    const form = new FormData();
    form.set("module", MODULES[0]);
    form.set("kind", "resources");
    form.set(
      "file",
      new File([new Uint8Array(recruitmentPdf())], "guide.pdf", {
        type: "application/pdf",
      }),
    );
    return POST(
      new NextRequest("http://localhost/documents", {
        method: "POST",
        body: form,
      }),
      context(edition._id),
    );
  };
  expect((await upload()).status).toBe(201);
  const updated = (await Recruitment.findById(edition._id))!;
  const document = updated.modules[0].resources.document!;
  const request = (range?: string) =>
    new NextRequest("http://localhost/pdf", {
      headers: range ? { range } : {},
    });
  expect((await GET(request(), context(document._id))).status).toBe(404);
  expect(reads).toBe(0);
  updated.status = "published";
  updated.publishedAt = new Date(0);
  updated.modules[0].resources.releaseAt = new Date(0);
  await updated.save();
  const partial = await GET(request("bytes=0-4"), context(document._id));
  expect(partial.status).toBe(206);
  expect(await partial.text()).toBe("%PDF-");
  expect(
    (await GET(request("bytes=9999999-"), context(document._id))).status,
  ).toBe(416);
  const audit = vi
    .spyOn(AuditLog, "create")
    .mockRejectedValueOnce(new Error("audit unavailable"));
  expect((await upload()).status).toBe(500);
  audit.mockRestore();
  expect([...objects.keys()]).toEqual([
    `files/recruitment/${document.storedName}`,
  ]);
  expect((await upload()).status).toBe(201);
  expect(objects.has(`files/recruitment/${document.storedName}`)).toBe(false);
  expect(objects.size).toBe(1);
});
