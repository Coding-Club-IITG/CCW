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
import BlogPost from "@/models/BlogPost";
import BlogPostRevision from "@/models/BlogPostRevision";
import {
  BLOG_ADMIN_ID,
  BLOG_AUTHOR_ID,
  BLOG_OTHER_ID,
  blogPost,
} from "../fixtures/blogs";
import {
  clearTestMongo,
  startTestMongo,
  stopTestMongo,
} from "../utils/mongodb";
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

describe("blog revision history lifecycle", () => {
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

  it("records version 1 snapshot on initial direct published post creation", async () => {
    const { POST } = await import("@/app/api/admin/blog/route");
    const response = await POST(
      jsonRequest("/api/admin/blog", "POST", {
        title: "Versioned Post 1",
        content: "Initial live content",
        excerpt: "Initial excerpt",
        status: "published",
        tags: ["Development"],
      }),
    );
    expect(response.status).toBe(201);
    const data = await responseData(response);
    const createdPost = data.post;

    const revisions = await BlogPostRevision.find({
      postId: createdPost._id,
    }).lean();

    expect(revisions).toHaveLength(1);
    expect(revisions[0]).toMatchObject({
      version: 1,
      source: "initial_publish",
      title: "Versioned Post 1",
      content: "Initial live content",
      excerpt: "Initial excerpt",
      slug: createdPost.slug,
      editor: { userId: BLOG_ADMIN_ID, name: "Blog Admin" },
      approvedBy: null,
      restoredFromVersion: null,
    });
  });

  it("records version 1 when a draft is transitioned to published in PATCH", async () => {
    const adminRoute = await import("@/app/api/admin/blog/[slug]/route");
    const post = await BlogPost.create(
      blogPost({
        slug: "draft-to-published-post",
        title: "Draft Title",
        content: "Draft content",
        status: "draft",
        publishedAt: null,
      }),
    );

    const patchRes = await adminRoute.PATCH(
      jsonRequest("/api/admin/blog/draft-to-published-post", "PATCH", {
        status: "published",
        content: "First published body",
      }),
      context("draft-to-published-post"),
    );
    expect(patchRes.status).toBe(200);

    const revisions = await BlogPostRevision.find({ postId: post._id }).lean();
    expect(revisions).toHaveLength(1);
    expect(revisions[0]).toMatchObject({
      version: 1,
      source: "initial_publish",
      content: "First published body",
    });
  });

  it("records version 2 on admin direct edit of published post", async () => {
    const adminRoute = await import("@/app/api/admin/blog/[slug]/route");
    const post = await BlogPost.create(
      blogPost({
        slug: "admin-editable-post",
        title: "Initial Title",
        content: "Initial Content",
        status: "published",
        publishedAt: new Date("2026-09-01T10:00:00.000Z"),
      }),
    );

    // Initial publish snapshot (Version 1)
    await BlogPostRevision.create({
      postId: post._id,
      slug: post.slug,
      version: 1,
      title: "Initial Title",
      content: "Initial Content",
      excerpt: post.excerpt,
      tags: post.tags,
      authors: post.authors,
      editor: { userId: BLOG_ADMIN_ID, name: "Blog Admin" },
      approvedBy: null,
      source: "initial_publish",
      createdAt: post.publishedAt,
    });

    const editRes = await adminRoute.PATCH(
      jsonRequest("/api/admin/blog/admin-editable-post", "PATCH", {
        content: "Updated Content by Admin",
        changeSummary: "Quick grammar fixes",
      }),
      context("admin-editable-post"),
    );
    expect(editRes.status).toBe(200);

    const revisions = await BlogPostRevision.find({ postId: post._id })
      .sort({ version: 1 })
      .lean();

    expect(revisions).toHaveLength(2);
    expect(revisions[1]).toMatchObject({
      version: 2,
      source: "admin_edit",
      content: "Updated Content by Admin",
      changeSummary: "Quick grammar fixes",
      editor: { userId: BLOG_ADMIN_ID, name: "Blog Admin" },
    });
  });

  it("records version 3 when admin approves a member staged revision", async () => {
    const revisionRoute = await import(
      "@/app/api/admin/blog/[slug]/revision/route"
    );
    const post = await BlogPost.create(
      blogPost({
        slug: "workflow-post",
        title: "Live Title",
        content: "Live Content",
        status: "published",
        publishedAt: new Date("2026-09-01T10:00:00.000Z"),
        authors: [{ userId: BLOG_AUTHOR_ID, name: "Club Author" }],
      }),
    );

    // Seed Version 1 and Version 2
    await BlogPostRevision.create([
      {
        postId: post._id,
        slug: post.slug,
        version: 1,
        title: "Live Title v1",
        content: "Live Content v1",
        authors: post.authors,
        editor: { userId: BLOG_AUTHOR_ID, name: "Club Author" },
        approvedBy: null,
        source: "initial_publish",
      },
      {
        postId: post._id,
        slug: post.slug,
        version: 2,
        title: "Live Title",
        content: "Live Content",
        authors: post.authors,
        editor: { userId: BLOG_ADMIN_ID, name: "Blog Admin" },
        approvedBy: null,
        source: "admin_edit",
      },
    ]);

    post.set({
      pendingRevision: {
        title: "Proposed Title v3",
        content: "Proposed Content v3",
        excerpt: "Proposed Excerpt",
        coverImage: "",
        coverFocalPoint: { x: 0.5, y: 0.5 },
        tags: ["Tutorial"],
        baseUpdatedAt: post.updatedAt,
        updatedAt: new Date(),
        submittedAt: new Date(),
        submittedBy: BLOG_AUTHOR_ID,
      },
    });
    await post.save({ timestamps: false });

    const approveRes = await revisionRoute.POST(
      jsonRequest("/api/admin/blog/workflow-post/revision", "POST", {
        action: "approve",
      }),
      context("workflow-post"),
    );
    expect(approveRes.status).toBe(200);

    const latestRevision = await BlogPostRevision.findOne({
      postId: post._id,
      version: 3,
    }).lean();

    expect(latestRevision).not.toBeNull();
    expect(latestRevision).toMatchObject({
      version: 3,
      source: "approved_revision",
      title: "Proposed Title v3",
      content: "Proposed Content v3",
      editor: { userId: BLOG_AUTHOR_ID, name: "Club Author" },
      approvedBy: { userId: BLOG_ADMIN_ID, name: "Blog Admin" },
    });
  });

  it("supports listing revisions and fetching specific version via admin endpoint", async () => {
    const revisionsRoute = await import(
      "@/app/api/admin/blog/[slug]/revisions/route"
    );
    const post = await BlogPost.create(
      blogPost({
        slug: "list-revisions-post",
        title: "Live Post",
        status: "published",
      }),
    );

    await BlogPostRevision.create([
      {
        postId: post._id,
        slug: post.slug,
        version: 1,
        title: "Version 1 Title",
        content: "Version 1 Content",
        editor: { userId: BLOG_ADMIN_ID, name: "Admin" },
        source: "initial_publish",
      },
      {
        postId: post._id,
        slug: post.slug,
        version: 2,
        title: "Version 2 Title",
        content: "Version 2 Content",
        editor: { userId: BLOG_ADMIN_ID, name: "Admin" },
        source: "admin_edit",
      },
    ]);

    const listRes = await revisionsRoute.GET(
      new NextRequest("http://localhost/api/admin/blog/list-revisions-post/revisions"),
      context("list-revisions-post"),
    );
    expect(listRes.status).toBe(200);
    const listData = await responseData(listRes);
    expect(listData.revisions).toHaveLength(2);
    expect(listData.revisions[0].version).toBe(2);
    expect(listData.revisions[1].version).toBe(1);
    expect(listData.revisions[0]).not.toHaveProperty("content");

    const detailRes = await revisionsRoute.GET(
      new NextRequest(
        "http://localhost/api/admin/blog/list-revisions-post/revisions?version=1",
      ),
      context("list-revisions-post"),
    );
    expect(detailRes.status).toBe(200);
    const detailData = await responseData(detailRes);
    expect(detailData.revision).toMatchObject({
      version: 1,
      title: "Version 1 Title",
      content: "Version 1 Content",
    });
  });

  it("allows admin to restore live post to an earlier version", async () => {
    const restoreRoute = await import(
      "@/app/api/admin/blog/[slug]/revisions/[version]/restore/route"
    );
    const post = await BlogPost.create(
      blogPost({
        slug: "restore-post",
        title: "Current v2 Title",
        content: "Current v2 Content",
        status: "published",
      }),
    );

    await BlogPostRevision.create([
      {
        postId: post._id,
        slug: post.slug,
        version: 1,
        title: "Original v1 Title",
        content: "Original v1 Content",
        excerpt: "Original Excerpt",
        tags: ["Legacy"],
        editor: { userId: BLOG_ADMIN_ID, name: "Admin" },
        source: "initial_publish",
      },
      {
        postId: post._id,
        slug: post.slug,
        version: 2,
        title: "Current v2 Title",
        content: "Current v2 Content",
        excerpt: "Updated Excerpt",
        tags: ["Modern"],
        editor: { userId: BLOG_ADMIN_ID, name: "Admin" },
        source: "admin_edit",
      },
    ]);

    const response = await restoreRoute.POST(
      new NextRequest(
        "http://localhost/api/admin/blog/restore-post/revisions/1/restore",
        { method: "POST" },
      ),
      { params: Promise.resolve({ slug: "restore-post", version: "1" }) },
    );
    expect(response.status).toBe(200);

    const updatedPost = await BlogPost.findOne({ slug: "restore-post" }).lean();
    expect(updatedPost?.title).toBe("Original v1 Title");
    expect(updatedPost?.content).toBe("Original v1 Content");
    expect(updatedPost?.tags).toEqual(["Legacy"]);

    const newRevision = await BlogPostRevision.findOne({
      postId: post._id,
      version: 3,
    }).lean();

    expect(newRevision).toMatchObject({
      version: 3,
      source: "rollback",
      restoredFromVersion: 1,
      content: "Original v1 Content",
    });

    expect(
      await AuditLog.findOne({ operation: "blog.revision.restore" }),
    ).toMatchObject({
      category: "blog",
      action: "update",
      operation: "blog.revision.restore",
    });
  });

  it("allows author to load historical version into draft staging without affecting live post", async () => {
    const internalRevisionsRoute = await import(
      "@/app/api/internal/blog/[slug]/revisions/route"
    );
    const internalRestoreRoute = await import(
      "@/app/api/internal/blog/[slug]/revisions/[version]/restore/route"
    );

    const post = await BlogPost.create(
      blogPost({
        slug: "author-restore-post",
        title: "Live Version 2 Title",
        content: "Live Version 2 Content",
        status: "published",
        authors: [{ userId: BLOG_AUTHOR_ID, name: "Club Author" }],
      }),
    );

    await BlogPostRevision.create([
      {
        postId: post._id,
        slug: post.slug,
        version: 1,
        title: "Author Version 1 Title",
        content: "Author Version 1 Content",
        tags: ["Intro"],
        editor: { userId: BLOG_AUTHOR_ID, name: "Club Author" },
        source: "initial_publish",
      },
      {
        postId: post._id,
        slug: post.slug,
        version: 2,
        title: "Live Version 2 Title",
        content: "Live Version 2 Content",
        tags: ["Advanced"],
        editor: { userId: BLOG_ADMIN_ID, name: "Admin" },
        source: "admin_edit",
      },
    ]);

    // Switch session to author
    getSession.mockResolvedValue({
      user: {
        id: BLOG_AUTHOR_ID.toString(),
        name: "Club Author",
        access: "Member",
      },
    });

    const listRes = await internalRevisionsRoute.GET(
      new NextRequest("http://localhost/api/internal/blog/author-restore-post/revisions"),
      context("author-restore-post"),
    );
    expect(listRes.status).toBe(200);

    const restoreRes = await internalRestoreRoute.POST(
      new NextRequest(
        "http://localhost/api/internal/blog/author-restore-post/revisions/1/restore",
        { method: "POST" },
      ),
      {
        params: Promise.resolve({
          slug: "author-restore-post",
          version: "1",
        }),
      },
    );
    expect(restoreRes.status).toBe(200);

    // Verify live post is unchanged
    const livePost = await BlogPost.findOne({ slug: "author-restore-post" }).lean();
    expect(livePost?.title).toBe("Live Version 2 Title");
    expect(livePost?.content).toBe("Live Version 2 Content");

    // Verify draft revision staging has version 1 content
    expect(livePost?.pendingRevision).toMatchObject({
      title: "Author Version 1 Title",
      content: "Author Version 1 Content",
      tags: ["Intro"],
      submittedAt: null,
      submittedBy: BLOG_AUTHOR_ID,
    });
  });

  it("denies access to non-authors and non-admins", async () => {
    const internalRevisionsRoute = await import(
      "@/app/api/internal/blog/[slug]/revisions/route"
    );
    await BlogPost.create(
      blogPost({
        slug: "protected-post",
        status: "published",
        authors: [{ userId: BLOG_AUTHOR_ID, name: "Author" }],
      }),
    );

    // Non-author member
    getSession.mockResolvedValue({
      user: {
        id: BLOG_OTHER_ID.toString(),
        name: "Other Member",
        access: "Member",
      },
    });

    const res = await internalRevisionsRoute.GET(
      new NextRequest("http://localhost/api/internal/blog/protected-post/revisions"),
      context("protected-post"),
    );
    expect(res.status).toBe(403);
  });

  it("cascades revision deletion when a blog post is deleted", async () => {
    const adminRoute = await import("@/app/api/admin/blog/[slug]/route");
    const post = await BlogPost.create(
      blogPost({
        slug: "post-to-delete",
        status: "published",
      }),
    );

    await BlogPostRevision.create([
      {
        postId: post._id,
        slug: post.slug,
        version: 1,
        title: "Version 1",
        editor: { userId: BLOG_ADMIN_ID, name: "Admin" },
        source: "initial_publish",
      },
      {
        postId: post._id,
        slug: post.slug,
        version: 2,
        title: "Version 2",
        editor: { userId: BLOG_ADMIN_ID, name: "Admin" },
        source: "admin_edit",
      },
    ]);

    const deleteRes = await adminRoute.DELETE(
      new NextRequest("http://localhost/api/admin/blog/post-to-delete", {
        method: "DELETE",
      }),
      context("post-to-delete"),
    );
    expect(deleteRes.status).toBe(200);

    const remainingRevisions = await BlogPostRevision.find({
      postId: post._id,
    }).lean();
    expect(remainingRevisions).toHaveLength(0);
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
