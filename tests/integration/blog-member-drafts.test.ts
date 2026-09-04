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
import {
  BLOG_AUTHOR_ID,
  BLOG_OTHER_ID,
  blogPost,
  blogSession,
} from "../fixtures/blogs";

const getSession = vi.hoisted(() => vi.fn());
const invalidateCache = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession } } }));
vi.mock("@/lib/cache", () => ({ invalidateCache }));

describe("member-owned blog drafts", () => {
  beforeAll(async () => {
    await startTestMongo();
    getSession.mockResolvedValue(blogSession());
  });
  afterEach(async () => {
    await clearTestMongo();
    getSession.mockResolvedValue(blogSession());
    invalidateCache.mockReset();
  });
  afterAll(stopTestMongo);

  it("requires a session and conceals non-owned drafts", async () => {
    const BlogPost = (await import("@/models/BlogPost")).default;
    const { GET } = await import("@/app/api/internal/blog/[slug]/route");
    await BlogPost.create(
      blogPost({
        slug: "other-draft",
        status: "draft",
        publishedAt: null,
        authors: [{ userId: BLOG_OTHER_ID, name: "Other" }],
      }),
    );
    getSession.mockResolvedValueOnce(null);
    expect(
      (
        await GET(
          new NextRequest("http://localhost/api/internal/blog/other-draft"),
          context("other-draft"),
        )
      ).status,
    ).toBe(401);

    const forbidden = await GET(
      new NextRequest("http://localhost/api/internal/blog/other-draft"),
      context("other-draft"),
    );
    expect(forbidden.status).toBe(403);
  });

  it("allows an author to read and update only editable draft fields", async () => {
    const BlogPost = (await import("@/models/BlogPost")).default;
    const { GET, PATCH } = await import("@/app/api/internal/blog/[slug]/route");
    await BlogPost.create(
      blogPost({ slug: "my-draft", status: "draft", publishedAt: null }),
    );
    expect(
      (
        await GET(
          new NextRequest("http://localhost/api/internal/blog/my-draft"),
          context("my-draft"),
        )
      ).status,
    ).toBe(200);

    const response = await PATCH(
      jsonRequest("/api/internal/blog/my-draft", {
        title: " Updated draft ",
        tags: [" Design ", "", "x".repeat(51)],
        status: "published",
        authors: [{ userId: BLOG_OTHER_ID.toString(), name: "Attacker" }],
        slug: "attacker-slug",
      }),
      context("my-draft"),
    );
    const saved = await BlogPost.findOne({ slug: "my-draft" }).lean();

    expect(response.status).toBe(200);
    expect(saved).toMatchObject({
      title: "Updated draft",
      tags: ["Design"],
      status: "draft",
      publishedAt: null,
    });
    expect(saved?.authors[0].userId.toString()).toBe(BLOG_AUTHOR_ID.toString());
    expect(await AuditLog.findOne()).toMatchObject({
      category: "blog",
      action: "update",
      operation: "blog.draft.update",
      actor: { userId: BLOG_AUTHOR_ID.toString(), access: "Member" },
      before: { title: "Testing Next.js", status: "draft" },
      after: { title: "Updated draft", status: "draft" },
    });
  });

  it("allows an author to create a staged revision on a published post without altering live content", async () => {
    const BlogPost = (await import("@/models/BlogPost")).default;
    const { GET, PATCH, DELETE } =
      await import("@/app/api/internal/blog/[slug]/route");
    await BlogPost.create(
      blogPost({
        slug: "published-post",
        title: "Live Title",
        content: "Live Content",
        status: "published",
        publishedAt: new Date("2026-01-01"),
        authors: [{ userId: BLOG_AUTHOR_ID, name: "Author" }],
      }),
    );

    // Can GET published post
    const getRes = await GET(
      new NextRequest("http://localhost/api/internal/blog/published-post"),
      context("published-post"),
    );
    expect(getRes.status).toBe(200);

    // PATCH creates staged pendingRevision
    const patchRes = await PATCH(
      jsonRequest("/api/internal/blog/published-post", {
        title: "Proposed New Title",
        content: "Proposed New Content",
        requestApproval: true,
      }),
      context("published-post"),
    );
    expect(patchRes.status).toBe(200);

    const updated = await BlogPost.findOne({ slug: "published-post" }).lean();
    // Live post is completely unchanged
    expect(updated?.title).toBe("Live Title");
    expect(updated?.content).toBe("Live Content");
    expect(updated?.status).toBe("published");

    // Staged revision is created with submittedAt
    expect(updated?.pendingRevision).toMatchObject({
      title: "Proposed New Title",
      content: "Proposed New Content",
      submittedBy: BLOG_AUTHOR_ID,
    });
    expect(updated?.pendingRevision?.submittedAt).toBeDefined();

    // Audit log records revision submission
    expect(
      await AuditLog.findOne({ operation: "blog.revision.submit" }),
    ).toMatchObject({
      category: "blog",
      action: "update",
      operation: "blog.revision.submit",
      actor: { userId: BLOG_AUTHOR_ID.toString(), access: "Member" },
    });

    // Author can discard staged revision
    const deleteRes = await DELETE(
      new NextRequest("http://localhost/api/internal/blog/published-post", {
        method: "DELETE",
      }),
      context("published-post"),
    );
    expect(deleteRes.status).toBe(200);
    const afterDelete = await BlogPost.findOne({
      slug: "published-post",
    }).lean();
    expect(afterDelete?.pendingRevision).toBeNull();
  });

  it("does not allow non-authors to edit a published post", async () => {
    const BlogPost = (await import("@/models/BlogPost")).default;
    const { PATCH } = await import("@/app/api/internal/blog/[slug]/route");
    await BlogPost.create(
      blogPost({
        slug: "someone-elses-post",
        status: "published",
        authors: [{ userId: BLOG_OTHER_ID, name: "Other Author" }],
      }),
    );
    const response = await PATCH(
      jsonRequest("/api/internal/blog/someone-elses-post", {
        title: "Unauthorized Edit",
      }),
      context("someone-elses-post"),
    );
    expect(response.status).toBe(403);
  });

  it("allows an administrator through the internal draft route", async () => {
    const BlogPost = (await import("@/models/BlogPost")).default;
    const { PATCH } = await import("@/app/api/internal/blog/[slug]/route");
    await BlogPost.create(
      blogPost({
        slug: "other-draft",
        status: "draft",
        publishedAt: null,
        authors: [{ userId: BLOG_OTHER_ID, name: "Other" }],
      }),
    );
    getSession.mockResolvedValueOnce(blogSession({ access: "Admin" }));
    const response = await PATCH(
      jsonRequest("/api/internal/blog/other-draft", {
        excerpt: "Admin correction",
      }),
      context("other-draft"),
    );
    expect(response.status).toBe(200);
  });
});

function jsonRequest(path: string, body: unknown) {
  return new NextRequest(`http://localhost${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
function context(slug: string) {
  return { params: Promise.resolve({ slug }) };
}
