import { Types } from "mongoose";

export const BLOG_ADMIN_ID = new Types.ObjectId();
export const BLOG_AUTHOR_ID = new Types.ObjectId();
export const BLOG_OTHER_ID = new Types.ObjectId();

export function blogPost(overrides: Record<string, unknown> = {}) {
  return {
    title: "Testing Next.js",
    slug: "testing-nextjs",
    content: "# Reliable tests",
    excerpt: "A practical testing guide",
    coverImage: "",
    authors: [{ userId: BLOG_AUTHOR_ID, name: "Blog Author" }],
    tags: ["Tutorial"],
    status: "published",
    publishedAt: new Date("2030-01-02T00:00:00.000Z"),
    ...overrides,
  };
}

export function blogSession(userOverrides: Record<string, unknown> = {}) {
  return {
    user: {
      id: BLOG_AUTHOR_ID.toString(),
      name: "Blog Author",
      email: "author@example.test",
      access: "Member",
      managedModules: [],
      roles: [],
      ...userOverrides,
    },
    session: {
      id: "blog-session",
      userId: BLOG_AUTHOR_ID.toString(),
      expiresAt: new Date("2031-01-01T00:00:00.000Z"),
    },
  };
}
