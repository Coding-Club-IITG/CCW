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
  });

  it("does not allow members to edit a published post even when credited", async () => {
    const BlogPost = (await import("@/models/BlogPost")).default;
    const { PATCH } = await import("@/app/api/internal/blog/[slug]/route");
    await BlogPost.create(blogPost({ slug: "published-post" }));
    const response = await PATCH(
      jsonRequest("/api/internal/blog/published-post", {
        title: "Changed",
      }),
      context("published-post"),
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
