import { NextRequest } from "next/server";
import path from "path";
import { readFile, unlink } from "fs/promises";
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
  listTestBlogUploads,
  startTestBlogDirectory,
  stopTestBlogDirectory,
} from "../utils/filesystem";
import {
  BLOG_AUTHOR_ID,
  BLOG_OTHER_ID,
  blogPost,
  blogSession,
} from "../fixtures/blogs";

const getSession = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession } } }));

describe("blog image uploads and assets", () => {
  let uploadDirectory: string;

  beforeAll(async () => {
    uploadDirectory = await startTestBlogDirectory();
    await startTestMongo();
    getSession.mockResolvedValue(
      blogSession({ role: "Secretary", id: BLOG_AUTHOR_ID.toString() }),
    );
  });

  afterEach(async () => {
    await clearTestMongo();
    for (const name of await listTestBlogUploads(uploadDirectory)) {
      await unlink(path.join(uploadDirectory, name));
    }
    getSession.mockResolvedValue(
      blogSession({ role: "Secretary", id: BLOG_AUTHOR_ID.toString() }),
    );
  });

  afterAll(async () => {
    await stopTestMongo();
    await stopTestBlogDirectory(uploadDirectory);
  });

  it("requires an authenticated administrator for admin uploads", async () => {
    const { POST } = await import("@/app/api/admin/blog/upload-image/route");
    getSession.mockResolvedValueOnce(null);
    expect((await POST(uploadRequest())).status).toBe(401);

    getSession.mockResolvedValueOnce(blogSession({ role: "Member" }));
    expect((await POST(uploadRequest())).status).toBe(403);
    expect(await listTestBlogUploads(uploadDirectory)).toEqual([]);
  });

  it.each([
    ["text/plain", "image.png", "Not a supported image file format"],
    ["image/png", "image.exe", "Unsupported image file type"],
  ])("rejects invalid %s / %s uploads", async (mime, name, error) => {
    const { POST } = await import("@/app/api/admin/blog/upload-image/route");
    const response = await POST(uploadRequest({ mime, name }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error });
    expect(await listTestBlogUploads(uploadDirectory)).toEqual([]);
  });

  it("rejects images larger than five megabytes before writing to disk", async () => {
    const { POST } = await import("@/app/api/admin/blog/upload-image/route");
    const form = new FormData();
    form.set(
      "file",
      new File([new Uint8Array(5 * 1024 * 1024 + 1)], "large.png", {
        type: "image/png",
      }),
    );
    const response = await POST(
      new NextRequest("http://localhost/api/admin/blog/upload-image", {
        method: "POST",
        body: form,
      }),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "File too large. Maximum size is 5MB.",
    });
    expect(await listTestBlogUploads(uploadDirectory)).toEqual([]);
  });

  it("writes a randomized image and serves it with immutable safe headers", async () => {
    const upload = await import("@/app/api/admin/blog/upload-image/route");
    const asset = await import("@/app/api/blog/assets/[id]/route");
    const response = await upload.POST(uploadRequest());
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.filename).toMatch(/^[0-9a-f]{32}\.png$/);
    expect(body.url).toBe(`/api/blog/assets/${body.filename}`);
    expect(
      await readFile(path.join(uploadDirectory, body.filename), "utf8"),
    ).toBe("image-bytes");

    const served = await asset.GET(
      new NextRequest(`http://localhost${body.url}`),
      context(body.filename),
    );
    expect(served.status).toBe(200);
    expect(served.headers.get("content-type")).toBe("image/png");
    expect(served.headers.get("cache-control")).toBe(
      "public, max-age=31536000, immutable",
    );
    expect(served.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await served.text()).toBe("image-bytes");
  });

  it("rejects traversal-shaped and missing asset IDs", async () => {
    const { GET } = await import("@/app/api/blog/assets/[id]/route");
    expect(
      (
        await GET(
          new NextRequest("http://localhost/api/blog/assets/bad"),
          context("../secret.png"),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await GET(
          new NextRequest("http://localhost/api/blog/assets/missing"),
          context("0123456789abcdef0123456789abcdef.png"),
        )
      ).status,
    ).toBe(404);
  });

  it("allows only an author or admin to upload against an editable draft", async () => {
    const BlogPost = (await import("@/models/BlogPost")).default;
    const { POST } = await import("@/app/api/internal/blog/upload-image/route");
    await BlogPost.create([
      blogPost({ slug: "my-draft", status: "draft", publishedAt: null }),
      blogPost({
        slug: "other-draft",
        status: "draft",
        publishedAt: null,
        authors: [{ userId: BLOG_OTHER_ID, name: "Other" }],
      }),
      blogPost({ slug: "published-post" }),
    ]);
    getSession.mockResolvedValue(blogSession({ role: "Member" }));

    expect((await POST(uploadRequest({ slug: "my-draft" }))).status).toBe(201);
    expect((await POST(uploadRequest({ slug: "other-draft" }))).status).toBe(
      403,
    );
    expect((await POST(uploadRequest({ slug: "published-post" }))).status).toBe(
      403,
    );
  });
});

function uploadRequest(
  overrides: Partial<{ mime: string; name: string; slug: string }> = {},
) {
  const form = new FormData();
  form.set(
    "file",
    new File(["image-bytes"], overrides.name ?? "cover.png", {
      type: overrides.mime ?? "image/png",
    }),
  );
  const slug = overrides.slug ? `?slug=${overrides.slug}` : "";
  return new NextRequest(
    `http://localhost/api/admin/blog/upload-image${slug}`,
    { method: "POST", body: form },
  );
}

function context(id: string) {
  return { params: Promise.resolve({ id }) };
}
