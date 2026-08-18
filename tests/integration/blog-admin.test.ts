import { NextRequest } from "next/server";
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
import { BLOG_ADMIN_ID, BLOG_AUTHOR_ID, blogPost } from "../fixtures/blogs";

const requireAdmin = vi.hoisted(() => vi.fn());
const invalidateCache = vi.hoisted(() => vi.fn());
const revalidatePath = vi.hoisted(() => vi.fn());
vi.mock("@/lib/requireAdmin", () => ({ requireAdmin }));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/cache", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/cache")>("@/lib/cache");
  return {
    ...actual,
    cachedFetch: vi.fn(
      async (_key: string, _ttl: number, loader: () => Promise<unknown>) =>
        loader(),
    ),
    invalidateCache,
  };
});

describe("admin blog routes", () => {
  beforeAll(async () => {
    await startTestMongo();
    requireAdmin.mockResolvedValue({
      id: BLOG_ADMIN_ID.toString(),
      name: "Blog Admin",
    });
  });
  afterEach(async () => {
    await clearTestMongo();
    requireAdmin.mockResolvedValue({
      id: BLOG_ADMIN_ID.toString(),
      name: "Blog Admin",
    });
    revalidatePath.mockClear();
    invalidateCache.mockReset();
    vi.useRealTimers();
  });
  afterAll(stopTestMongo);

  it("forbids non-admin listing and creation", async () => {
    const { GET, POST } = await import("@/app/api/admin/blog/route");
    requireAdmin.mockResolvedValue(null);
    expect(
      (await GET(new NextRequest("http://localhost/api/admin/blog"))).status,
    ).toBe(403);
    expect(
      (
        await POST(
          jsonRequest("/api/admin/blog", "POST", {
            title: "Unauthorized",
          }),
        )
      ).status,
    ).toBe(403);
  });

  it.each([
    [{ title: " " }, "Title is required."],
    [{ title: "x".repeat(201) }, "Title must be 200 characters or fewer."],
    [
      { title: "Valid", excerpt: "x".repeat(501) },
      "Excerpt must be 500 characters or fewer.",
    ],
  ])("validates creation input", async (body, error) => {
    const { POST } = await import("@/app/api/admin/blog/route");
    const response = await POST(jsonRequest("/api/admin/blog", "POST", body));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error });
  });

  it("creates deterministic unique slugs and normalizes draft metadata", async () => {
    const BlogPost = (await import("@/models/BlogPost")).default;
    const { POST } = await import("@/app/api/admin/blog/route");
    await BlogPost.create(blogPost({ slug: "hello-world" }));
    const response = await POST(
      jsonRequest("/api/admin/blog", "POST", {
        title: " Hello, World! ",
        content: "Body",
        excerpt: " Summary ",
        tags: [" Tutorial ", "", "x".repeat(51)],
        status: "unknown",
      }),
    );
    const body = await response.json();
    expect(response.status).toBe(201);
    expect(body.post).toMatchObject({
      slug: "hello-world-2",
      excerpt: "Summary",
      tags: ["Tutorial"],
      status: "draft",
      publishedAt: null,
      authors: [{ userId: BLOG_ADMIN_ID.toString(), name: "Blog Admin" }],
    });
    expect(invalidateCache).toHaveBeenCalledWith("blog");
    expect(invalidateCache).toHaveBeenCalledWith("admin:blog");
    expect(revalidatePath).toHaveBeenCalledWith("/sitemap.xml");
  });

  it("sets the first publication time, changes slug safely, and attributes the editor", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2030-02-01T12:00:00.000Z"));
    const BlogPost = (await import("@/models/BlogPost")).default;
    const { PATCH } = await import("@/app/api/admin/blog/[slug]/route");
    await BlogPost.create(blogPost({ title: "Taken", slug: "taken" }));
    await BlogPost.create(
      blogPost({
        title: "Draft title",
        slug: "draft-title",
        status: "draft",
        publishedAt: null,
        authors: [{ userId: BLOG_AUTHOR_ID, name: "Original" }],
      }),
    );

    const response = await PATCH(
      jsonRequest("/api/admin/blog/draft-title", "PATCH", {
        title: "Taken",
        status: "published",
        authors: [{ userId: BLOG_AUTHOR_ID.toString(), name: "Original" }],
      }),
      context("draft-title"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.post).toMatchObject({
      slug: "taken-2",
      status: "published",
    });
    expect(new Date(body.post.publishedAt).toISOString()).toBe(
      "2030-02-01T12:00:00.000Z",
    );
    expect(body.post.authors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ userId: BLOG_AUTHOR_ID.toString() }),
        expect.objectContaining({ userId: BLOG_ADMIN_ID.toString() }),
      ]),
    );
    expect(revalidatePath).toHaveBeenCalledWith("/sitemap.xml");
  });

  it("filters admin listing and deletes the selected post", async () => {
    const BlogPost = (await import("@/models/BlogPost")).default;
    const collection = await import("@/app/api/admin/blog/route");
    const item = await import("@/app/api/admin/blog/[slug]/route");
    await BlogPost.create([
      blogPost({ slug: "published" }),
      blogPost({ slug: "draft", status: "draft", publishedAt: null }),
    ]);
    const listed = await collection.GET(
      new NextRequest("http://localhost/api/admin/blog?status=draft"),
    );
    expect((await listed.json()).items).toHaveLength(1);

    const deleted = await item.DELETE(
      new NextRequest("http://localhost/api/admin/blog/draft", {
        method: "DELETE",
      }),
      context("draft"),
    );
    expect(deleted.status).toBe(200);
    expect(await BlogPost.findOne({ slug: "draft" })).toBeNull();
    expect(revalidatePath).toHaveBeenCalledWith("/sitemap.xml");
  });
});

function jsonRequest(path: string, method: string, body: unknown) {
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
function context(slug: string) {
  return { params: Promise.resolve({ slug }) };
}
