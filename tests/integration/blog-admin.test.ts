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

import AuditLog from "@/models/AuditLog";
import {
  clearTestMongo,
  startTestMongo,
  stopTestMongo,
} from "../utils/mongodb";
import { BLOG_ADMIN_ID, BLOG_AUTHOR_ID, blogPost } from "../fixtures/blogs";
import { responseData, responseError } from "../utils/result";

const getSession = vi.hoisted(() => vi.fn());
const invalidateCache = vi.hoisted(() => vi.fn());
const revalidatePath = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession } } }));
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
    getSession.mockResolvedValue({
      user: {
        id: BLOG_ADMIN_ID.toString(),
        name: "Blog Admin",
        access: "Head",
      },
    });
  });
  afterEach(async () => {
    await clearTestMongo();
    getSession.mockResolvedValue({
      user: {
        id: BLOG_ADMIN_ID.toString(),
        name: "Blog Admin",
        access: "Head",
      },
    });
    revalidatePath.mockClear();
    invalidateCache.mockReset();
    vi.useRealTimers();
  });
  afterAll(stopTestMongo);

  it("distinguishes unauthenticated and non-admin access", async () => {
    const { GET, POST } = await import("@/app/api/admin/blog/route");
    getSession.mockResolvedValueOnce(null);
    expect(
      (await GET(new NextRequest("http://localhost/api/admin/blog"))).status,
    ).toBe(401);
    getSession.mockResolvedValueOnce({
      user: { id: "member", access: "Member" },
    });
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
    expect(await responseError(response)).toMatchObject({ message: error });
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
    const body = await responseData(response);
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
    expect(invalidateCache).toHaveBeenCalledWith("home");
    expect(revalidatePath).toHaveBeenCalledWith("/");
    expect(revalidatePath).toHaveBeenCalledWith("/sitemap.xml");
    const audit = await AuditLog.findOne().lean();
    expect(audit).toMatchObject({
      category: "blog",
      action: "create",
      operation: "blog.create",
      before: {},
      after: { title: "Hello, World!", bodyLength: 4, excerptLength: 7 },
    });
    const serialized = JSON.stringify(audit);
    expect(serialized).not.toContain('"content":"Body"');
    expect(serialized).not.toContain("member@example");
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
    const body = await responseData(response);

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
    expect(await AuditLog.findOne()).toMatchObject({
      category: "blog",
      action: "publish",
      operation: "blog.admin.update",
      before: { title: "Draft title", status: "draft" },
      after: { title: "Taken", status: "published" },
    });
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
    expect((await responseData(listed)).items).toHaveLength(1);

    const deleted = await item.DELETE(
      new NextRequest("http://localhost/api/admin/blog/draft", {
        method: "DELETE",
      }),
      context("draft"),
    );
    expect(deleted.status).toBe(200);
    expect(await BlogPost.findOne({ slug: "draft" })).toBeNull();
    expect(revalidatePath).toHaveBeenCalledWith("/sitemap.xml");
    expect(await AuditLog.findOne()).toMatchObject({
      category: "blog",
      action: "delete",
      operation: "blog.delete",
      after: {},
    });
  });

  it("allows admin to approve a staged blog revision, applying it to the live post", async () => {
    const BlogPost = (await import("@/models/BlogPost")).default;
    const revisionRoute =
      await import("@/app/api/admin/blog/[slug]/revision/route");
    await BlogPost.create(
      blogPost({
        slug: "post-with-revision",
        title: "Old Live Title",
        content: "Old Live Content",
        status: "published",
        pendingRevision: {
          title: "Approved New Title",
          content: "Approved New Content",
          excerpt: "New excerpt",
          coverImage: "",
          coverFocalPoint: { x: 0.5, y: 0.5 },
          tags: ["Tutorial"],
          updatedAt: new Date(),
          submittedAt: new Date(),
          submittedBy: BLOG_AUTHOR_ID,
        },
      }),
    );

    const response = await revisionRoute.POST(
      jsonRequest("/api/admin/blog/post-with-revision/revision", "POST", {
        action: "approve",
      }),
      context("post-with-revision"),
    );
    expect(response.status).toBe(200);

    const updated = await BlogPost.findOne({
      slug: "post-with-revision",
    }).lean();
    expect(updated?.title).toBe("Approved New Title");
    expect(updated?.content).toBe("Approved New Content");
    expect(updated?.pendingRevision).toBeNull();
    expect(revalidatePath).toHaveBeenCalledWith("/blog/post-with-revision");
    expect(
      await AuditLog.findOne({ operation: "blog.revision.approve" }),
    ).toMatchObject({
      category: "blog",
      action: "update",
      operation: "blog.revision.approve",
      actor: { userId: BLOG_ADMIN_ID.toString(), access: "Head" },
    });
  });

  it("allows admin to reject a staged blog revision", async () => {
    const BlogPost = (await import("@/models/BlogPost")).default;
    const revisionRoute =
      await import("@/app/api/admin/blog/[slug]/revision/route");
    await BlogPost.create(
      blogPost({
        slug: "rejected-revision-post",
        title: "Original Live Title",
        content: "Original Live Content",
        status: "published",
        pendingRevision: {
          title: "Bad Proposal",
          content: "Bad Content",
          excerpt: "",
          coverImage: "",
          coverFocalPoint: { x: 0.5, y: 0.5 },
          tags: [],
          updatedAt: new Date(),
          submittedAt: new Date(),
          submittedBy: BLOG_AUTHOR_ID,
        },
      }),
    );

    const response = await revisionRoute.POST(
      jsonRequest("/api/admin/blog/rejected-revision-post/revision", "POST", {
        action: "reject",
      }),
      context("rejected-revision-post"),
    );
    expect(response.status).toBe(200);

    const updated = await BlogPost.findOne({
      slug: "rejected-revision-post",
    }).lean();
    expect(updated?.title).toBe("Original Live Title");
    expect(updated?.content).toBe("Original Live Content");
    expect(updated?.pendingRevision).toBeNull();
    expect(
      await AuditLog.findOne({ operation: "blog.revision.reject" }),
    ).toMatchObject({
      category: "blog",
      action: "delete",
      operation: "blog.revision.reject",
      actor: { userId: BLOG_ADMIN_ID.toString(), access: "Head" },
    });
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
