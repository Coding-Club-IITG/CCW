import { readdir, readFile, unlink } from "fs/promises";
import { Types } from "mongoose";
import { NextRequest } from "next/server";
import path from "path";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { expectAppData } from "@/lib/api/result";
import { MODULES, type ModuleName } from "@/lib/constants";
import type { RecruitmentDto } from "@/lib/recruitment";
import AuditLog from "@/models/AuditLog";
import Recruitment from "@/models/Recruitment";
import { fileSession } from "../fixtures/files";
import { recruitmentPdf } from "../fixtures/recruitment";
import {
  startTestMongo,
  clearTestMongo,
  stopTestMongo,
} from "../utils/mongodb";
import {
  startTestUploadDirectory,
  stopTestUploadDirectory,
} from "../utils/filesystem";

const { getSession, cache, invalidateCache, revalidatePath } = vi.hoisted(
  () => ({
    getSession: vi.fn(),
    cache: new Map<string, unknown>(),
    invalidateCache: vi.fn(),
    revalidatePath: vi.fn(),
  }),
);
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession } } }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/cache", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/cache")>();
  return {
    ...original,
    invalidateCache,
    cachedFetch: async (
      key: string,
      _ttl: number,
      fetch: () => Promise<unknown>,
    ) => {
      if (!cache.has(key))
        cache.set(key, JSON.parse(JSON.stringify(await fetch())));
      return structuredClone(cache.get(key));
    },
  };
});

const context = (id: string) => ({ params: Promise.resolve({ id }) });
const json = (url: string, method: string, body?: unknown) =>
  new NextRequest(`http://localhost${url}`, {
    method,
    ...(body === undefined
      ? {}
      : {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
const pdf = recruitmentPdf();
const future = "2099-12-01T12:00:00.000Z";
const past = "2020-12-01T12:00:00.000Z";
let collection: typeof import("@/app/api/admin/recruitment/route");
let item: typeof import("@/app/api/admin/recruitment/[id]/route");
let documents: typeof import("@/app/api/admin/recruitment/[id]/documents/route");
let stream: typeof import("@/app/api/recruitment/documents/[id]/route");
let server: typeof import("@/lib/recruitment.server");

function uploadRequest(
  module: ModuleName = MODULES[0],
  kind = "resources",
  bytes = pdf,
  type = "application/pdf",
) {
  const body = new FormData();
  body.set("module", module);
  body.set("kind", kind);
  body.set("file", new File([new Uint8Array(bytes)], "Guide.pdf", { type }));
  return new NextRequest(
    "http://localhost/api/admin/recruitment/test/documents",
    { method: "POST", body },
  );
}
async function create(year = 2026, season = "Winter") {
  return expectAppData<RecruitmentDto>(
    await collection.POST(
      json("/api/admin/recruitment", "POST", { year, season }),
    ),
  );
}
async function patch(id: string, body: unknown) {
  return expectAppData<RecruitmentDto>(
    await item.PATCH(
      json(`/api/admin/recruitment/${id}`, "PATCH", body),
      context(id),
    ),
  );
}
async function upload(
  id: string,
  module: ModuleName = MODULES[0],
  kind = "resources",
) {
  return expectAppData<RecruitmentDto>(
    await documents.POST(uploadRequest(module, kind), context(id)),
  );
}
const requestPdf = (id: string, headers?: HeadersInit, query = "") =>
  stream.GET(
    new NextRequest(
      `http://localhost/api/recruitment/documents/${id}${query}`,
      { headers },
    ),
    context(id),
  );

describe("recruitment editions and public PDF boundary", () => {
  let directory: string;
  beforeAll(async () => {
    directory = await startTestUploadDirectory();
    await startTestMongo();
    await Recruitment.init();
    collection = await import("@/app/api/admin/recruitment/route");
    item = await import("@/app/api/admin/recruitment/[id]/route");
    documents =
      await import("@/app/api/admin/recruitment/[id]/documents/route");
    stream = await import("@/app/api/recruitment/documents/[id]/route");
    server = await import("@/lib/recruitment.server");
    invalidateCache.mockImplementation(() => {
      cache.clear();
    });
    getSession.mockResolvedValue(fileSession({ access: "Admin" }));
  });
  afterEach(async () => {
    await clearTestMongo();
    cache.clear();
    for (const file of await readdir(path.join(directory, "recruitment")).catch(
      () => [],
    ))
      await unlink(path.join(directory, "recruitment", file));
    getSession.mockResolvedValue(fileSession({ access: "Admin" }));
  });
  afterAll(async () => {
    await stopTestMongo();
    await stopTestUploadDirectory(directory);
  });

  it("authorizes every admin endpoint before parsing inputs", async () => {
    for (const [access, status] of [
      [null, 401],
      ["Member", 403],
    ] as const) {
      getSession.mockResolvedValue(access ? fileSession({ access }) : null);
      const results = [
        await collection.GET(json("/api/admin/recruitment", "GET")),
        await collection.POST(json("/api/admin/recruitment", "POST", {})),
        await item.PATCH(
          json("/api/admin/recruitment/bad", "PATCH", {}),
          context("bad"),
        ),
        await item.DELETE(
          json("/api/admin/recruitment/bad", "DELETE"),
          context("bad"),
        ),
        await documents.POST(uploadRequest(), context("bad")),
        await documents.DELETE(
          json("/documents", "DELETE", {}),
          context("bad"),
        ),
      ];
      expect(results.map((response) => response.status)).toEqual(
        Array(6).fill(status),
      );
    }
    expect(await AuditLog.countDocuments()).toBe(0);
  });

  it("lets Heads edit any module, creates empty drafts and rejects duplicate editions", async () => {
    getSession.mockResolvedValue(
      fileSession({ access: "Head", managedModules: ["Design"] }),
    );
    const edition = await create();
    expect(edition.status).toBe("draft");
    expect(edition.modules).toHaveLength(5);
    expect(await server.getPublishedRecruitments()).toEqual([]);
    const updated = await patch(edition._id, {
      modules: [{ module: MODULES[0], submissionDeadline: future }],
    });
    expect(updated.modules[0].submissionDeadline).toBe(future);
    expect(
      (
        await collection.POST(
          json("/api/admin/recruitment", "POST", {
            year: 2026,
            season: "Winter",
          }),
        )
      ).status,
    ).toBe(409);
    expect(await AuditLog.countDocuments()).toBe(2);
  });

  it("keeps every published edition in chronological order and invalidates both caches", async () => {
    const winter = await create();
    const summer = await create(2026, "Summer");
    const earlier = await create(2025, "Winter");
    for (const edition of [winter, summer, earlier])
      await patch(edition._id, { status: "published" });
    expect(
      (await server.getPublishedRecruitments()).map((edition) => edition.slug),
    ).toEqual(["2026-winter", "2026-summer", "2025-winter"]);
    expect(invalidateCache).toHaveBeenCalledWith("recruitment:public:v1");
    expect(revalidatePath).toHaveBeenCalledWith("/recruitment");
    expect(revalidatePath).toHaveBeenCalledWith("/sitemap.xml");
    expect(
      await AuditLog.countDocuments({
        category: "recruitment",
        action: "publish",
      }),
    ).toBe(3);
  });

  it("refuses draft, unscheduled and future PDFs even when their IDs are known", async () => {
    const edition = await create();
    const uploaded = await upload(edition._id);
    const id = uploaded.modules[0].resources.document!._id;
    expect((await requestPdf(id)).status).toBe(404);
    await patch(edition._id, { status: "published" });
    expect((await requestPdf(id)).status).toBe(404);
    await patch(edition._id, {
      modules: [{ module: MODULES[0], resourcesReleaseAt: future }],
    });
    const response = await requestPdf(id, { Range: "bytes=0-4" });
    expect(response.status).toBe(404);
    expect(response.headers.get("Content-Type")).not.toBe("application/pdf");
    const listed = await server.getPublishedRecruitments();
    expect(listed[0].modules[0].resources).toEqual({
      releaseAt: future,
      document: null,
    });
    expect(JSON.stringify(listed)).not.toContain(id);
  });

  it("re-evaluates scheduled releases after reading cached edition data", async () => {
    const edition = await create();
    await upload(edition._id);
    await patch(edition._id, {
      status: "published",
      modules: [{ module: MODULES[0], resourcesReleaseAt: future }],
    });
    expect(
      (await server.getPublishedRecruitments(new Date("2099-11-01")))[0]
        .modules[0].resources.document,
    ).toBeNull();
    expect(
      (await server.getPublishedRecruitments(new Date(future)))[0].modules[0]
        .resources.document,
    ).not.toBeNull();
  });

  it("streams released PDFs anonymously, permits navigation/download and supports native byte ranges", async () => {
    const edition = await create();
    const uploaded = await upload(edition._id);
    await patch(edition._id, {
      status: "published",
      modules: [
        {
          module: MODULES[0],
          resourcesReleaseAt: past,
          submissionDeadline: past,
        },
      ],
    });
    const id = uploaded.modules[0].resources.document!._id;
    getSession.mockResolvedValue(null);
    const response = await requestPdf(id, {
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Content-Disposition")).toMatch(/^inline;/);
    expect(Buffer.from(await response.arrayBuffer())).toEqual(pdf);
    const uppercase = await requestPdf(id.toUpperCase());
    expect(uppercase.status).toBe(200);
    expect(Buffer.from(await uppercase.arrayBuffer())).toEqual(pdf);
    const download = await requestPdf(id, undefined, "?download=1");
    expect(download.headers.get("Content-Disposition")).toMatch(/^attachment;/);
    await download.arrayBuffer();
    const part = await requestPdf(id, { Range: "bytes=0-4" });
    expect(part.status).toBe(206);
    expect(await part.text()).toBe("%PDF-");
    const suffix = await requestPdf(id, { Range: "bytes=-6" });
    expect(Buffer.from(await suffix.arrayBuffer())).toEqual(pdf.subarray(-6));
    expect((await requestPdf(id, { Range: "bytes=9999999-" })).status).toBe(
      416,
    );
    expect((await requestPdf(id, { Range: "bytes=-0" })).status).toBe(416);
    expect((await requestPdf("bad")).status).toBe(400);
    expect((await requestPdf(String(new Types.ObjectId()))).status).toBe(404);
  });

  it("saves and clears dates independently of uploads and other modules", async () => {
    const edition = await create();
    await patch(edition._id, {
      modules: [
        { module: MODULES[0], resourcesReleaseAt: past },
        { module: MODULES[1], submissionDeadline: future },
      ],
    });
    const uploaded = await upload(edition._id);
    expect(uploaded.modules[0].resources.releaseAt).toBe(past);
    const cleared = await patch(edition._id, {
      modules: [{ module: MODULES[0], resourcesReleaseAt: null }],
    });
    expect(cleared.modules[0].resources.document).not.toBeNull();
    expect(cleared.modules[1].submissionDeadline).toBe(future);
    await patch(edition._id, {
      modules: [{ module: MODULES[0], resourcesReleaseAt: past }],
    });
    const removed = await expectAppData<RecruitmentDto>(
      await documents.DELETE(
        json("/documents", "DELETE", { module: MODULES[0], kind: "resources" }),
        context(edition._id),
      ),
    );
    expect(removed.modules[0].resources).toEqual({
      releaseAt: past,
      document: null,
    });
    expect(await readdir(path.join(directory, "recruitment"))).toEqual([]);
  });

  it("preserves unrelated fields when Heads edit concurrently", async () => {
    const edition = await create();
    await Promise.all([
      patch(edition._id, {
        modules: [{ module: MODULES[0], resourcesReleaseAt: past }],
      }),
      patch(edition._id, {
        modules: [{ module: MODULES[1], taskReleaseAt: future }],
      }),
    ]);
    const saved = await server.getAdminRecruitment(edition._id);
    expect(saved?.modules[0].resources.releaseAt).toBe(past);
    expect(saved?.modules[1].task.releaseAt).toBe(future);
  });

  it("replaces PDFs with new IDs and cleans up old files after commit", async () => {
    const edition = await create();
    const first = await upload(edition._id);
    await patch(edition._id, {
      status: "published",
      modules: [{ module: MODULES[0], resourcesReleaseAt: past }],
    });
    const second = await upload(edition._id);
    expect(second.modules[0].resources.document!._id).not.toBe(
      first.modules[0].resources.document!._id,
    );
    expect(second.modules[0].resources.releaseAt).toBe(past);
    expect(
      (await requestPdf(first.modules[0].resources.document!._id)).status,
    ).toBe(404);
    expect(await readdir(path.join(directory, "recruitment"))).toHaveLength(1);
  });

  it("rejects disguised non-PDF uploads without writing files", async () => {
    const edition = await create();
    expect(
      (
        await documents.POST(
          uploadRequest(MODULES[0], "task", pdf, "text/plain"),
          context(edition._id),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await documents.POST(
          uploadRequest(MODULES[0], "task", Buffer.from("not a PDF")),
          context(edition._id),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await documents.POST(
          uploadRequest(MODULES[0], "other"),
          context(edition._id),
        )
      ).status,
    ).toBe(400);
    expect(
      await readdir(path.join(directory, "recruitment")).catch(() => []),
    ).toEqual([]);
  });

  it("rolls back failed audited replacement and deletion without losing the original PDF", async () => {
    const edition = await create();
    const first = await upload(edition._id);
    const names = await readdir(path.join(directory, "recruitment"));
    const fail = vi
      .spyOn(AuditLog, "create")
      .mockRejectedValue(new Error("audit unavailable"));
    expect(
      (await documents.POST(uploadRequest(), context(edition._id))).status,
    ).toBe(500);
    expect(
      (
        await documents.DELETE(
          json("/documents", "DELETE", {
            module: MODULES[0],
            kind: "resources",
          }),
          context(edition._id),
        )
      ).status,
    ).toBe(500);
    expect(
      (await item.DELETE(json("/edition", "DELETE"), context(edition._id)))
        .status,
    ).toBe(500);
    fail.mockRestore();
    expect(await readdir(path.join(directory, "recruitment"))).toEqual(names);
    expect(
      await readFile(path.join(directory, "recruitment", names[0])),
    ).toEqual(pdf);
    expect(
      (await server.getAdminRecruitment(edition._id))?.modules[0].resources
        .document?._id,
    ).toBe(first.modules[0].resources.document!._id);
    expect(await AuditLog.countDocuments()).toBe(2);
  });

  it("revokes access on unpublish and removes every file on edition deletion", async () => {
    const edition = await create();
    const uploaded = await upload(edition._id);
    await upload(edition._id, MODULES[2], "task");
    await patch(edition._id, {
      status: "published",
      modules: [{ module: MODULES[0], resourcesReleaseAt: past }],
    });
    await patch(edition._id, { status: "draft" });
    expect(await server.getPublishedRecruitments()).toEqual([]);
    expect(
      (await requestPdf(uploaded.modules[0].resources.document!._id)).status,
    ).toBe(404);
    expect(
      (await item.DELETE(json("/edition", "DELETE"), context(edition._id)))
        .status,
    ).toBe(200);
    expect(await readdir(path.join(directory, "recruitment"))).toEqual([]);
    expect(await Recruitment.countDocuments()).toBe(0);
    expect(
      await AuditLog.findOne({ operation: "recruitment.delete" }),
    ).not.toBeNull();
  });
});
