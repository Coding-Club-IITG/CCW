import { NextRequest } from "next/server";
import { responseData } from "../utils/result";
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
import { blogPost } from "../fixtures/blogs";

vi.mock("@/lib/cache", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/cache")>("@/lib/cache");
  return {
    ...actual,
    cachedFetch: vi.fn(
      async (_key: string, _ttl: number, loader: () => Promise<unknown>) =>
        loader(),
    ),
  };
});

describe("public blog routes", () => {
  beforeAll(startTestMongo);
  afterEach(clearTestMongo);
  afterAll(stopTestMongo);

  it("lists only published posts newest first with published tags", async () => {
    const BlogPost = (await import("@/models/BlogPost")).default;
    const { GET } = await import("@/app/api/blog/route");
    await BlogPost.create([
      blogPost({
        title: "Older",
        slug: "older",
        tags: ["Tutorial"],
        publishedAt: new Date("2030-01-01T00:00:00.000Z"),
      }),
      blogPost({
        title: "Newer",
        slug: "newer",
        tags: ["General"],
        publishedAt: new Date("2030-01-03T00:00:00.000Z"),
      }),
      blogPost({
        title: "Draft",
        slug: "draft",
        tags: ["Secret"],
        status: "draft",
        publishedAt: null,
      }),
    ]);

    const response = await GET(
      new NextRequest("http://localhost/api/blog?page=1&limit=10"),
    );
    const body = await responseData(response);

    expect(response.status).toBe(200);
    expect(body.items.map((post: { title: string }) => post.title)).toEqual([
      "Newer",
      "Older",
    ]);
    expect(body.availableTags).toEqual(
      expect.arrayContaining(["Tutorial", "General"]),
    );
    expect(body.availableTags).not.toContain("Secret");
  });

  it("combines tag filtering with literal title search and pagination", async () => {
    const BlogPost = (await import("@/models/BlogPost")).default;
    const { GET } = await import("@/app/api/blog/route");
    await BlogPost.create([
      blogPost({ title: "Literal [guide]", slug: "literal", tags: ["Design"] }),
      blogPost({ title: "Literal g", slug: "regex-like", tags: ["Design"] }),
      blogPost({ title: "Literal [guide]", slug: "wrong-tag", tags: ["ML"] }),
    ]);

    const response = await GET(
      new NextRequest(
        "http://localhost/api/blog?tag=Design&search=%5Bguide%5D&page=1&limit=1",
      ),
    );
    const body = await responseData(response);

    expect(body.items).toHaveLength(1);
    expect(body.items[0].slug).toBe("literal");
    expect(body.pagination).toMatchObject({ total: 1, totalPages: 1 });
  });

  it("serves published details and conceals drafts", async () => {
    const BlogPost = (await import("@/models/BlogPost")).default;
    const { GET } = await import("@/app/api/blog/[slug]/route");
    await BlogPost.create([
      blogPost({ slug: "public-post" }),
      blogPost({ slug: "private-draft", status: "draft", publishedAt: null }),
    ]);

    const published = await GET(
      new NextRequest("http://localhost/api/blog/public-post"),
      context("public-post"),
    );
    expect(published.status).toBe(200);
    expect((await responseData(published)).post.slug).toBe("public-post");

    const draft = await GET(
      new NextRequest("http://localhost/api/blog/private-draft"),
      context("private-draft"),
    );
    expect(draft.status).toBe(404);
  });
});

function context(slug: string) {
  return { params: Promise.resolve({ slug }) };
}
