import { Types } from "mongoose";
import { describe, expect, it } from "vitest";

import { serializeRevision, serializeRevisionSummary } from "./revisions";

describe("serializeRevision", () => {
  it("serializes revision document fields properly", () => {
    const fakeId = new Types.ObjectId();
    const fakePostId = new Types.ObjectId();
    const fakeUserId = new Types.ObjectId();
    const fakeAdminId = new Types.ObjectId();
    const createdAt = new Date("2026-09-01T12:00:00.000Z");

    const raw = {
      _id: fakeId,
      postId: fakePostId,
      slug: "test-post",
      version: 2,
      title: "Test Title",
      content: "# Hello World",
      excerpt: "A brief summary",
      coverImage: "https://example.com/cover.jpg",
      coverFocalPoint: { x: 0.4, y: 0.6 },
      tags: ["Dev", "Tech"],
      authors: [{ userId: fakeUserId, name: "Author One" }],
      editor: { userId: fakeUserId, name: "Author One" },
      approvedBy: { userId: fakeAdminId, name: "Admin One" },
      source: "approved_revision" as const,
      restoredFromVersion: null,
      changeSummary: "Fixed typos in section 2",
      createdAt,
    };

    const serialized = serializeRevision(raw);

    expect(serialized).toEqual({
      _id: fakeId.toString(),
      postId: fakePostId.toString(),
      slug: "test-post",
      version: 2,
      title: "Test Title",
      content: "# Hello World",
      excerpt: "A brief summary",
      coverImage: "https://example.com/cover.jpg",
      coverFocalPoint: { x: 0.4, y: 0.6 },
      tags: ["Dev", "Tech"],
      authors: [{ userId: fakeUserId.toString(), name: "Author One" }],
      editor: { userId: fakeUserId.toString(), name: "Author One" },
      approvedBy: { userId: fakeAdminId.toString(), name: "Admin One" },
      source: "approved_revision",
      restoredFromVersion: null,
      changeSummary: "Fixed typos in section 2",
      createdAt: "2026-09-01T12:00:00.000Z",
    });
  });

  it("handles null/missing optional fields and formats defaults", () => {
    const fakeId = new Types.ObjectId();
    const fakePostId = new Types.ObjectId();
    const fakeUserId = new Types.ObjectId();
    const createdAt = new Date("2026-09-01T12:00:00.000Z");

    const raw = {
      _id: fakeId,
      postId: fakePostId,
      slug: "minimal-post",
      version: 1,
      title: "Minimal Title",
      editor: { userId: fakeUserId, name: "Minimal User" },
      source: "initial_publish" as const,
      createdAt,
    };

    const serialized = serializeRevision(raw);

    expect(serialized).toEqual({
      _id: fakeId.toString(),
      postId: fakePostId.toString(),
      slug: "minimal-post",
      version: 1,
      title: "Minimal Title",
      content: "",
      excerpt: "",
      coverImage: "",
      coverFocalPoint: { x: 0.5, y: 0.5 },
      tags: [],
      authors: [],
      editor: { userId: fakeUserId.toString(), name: "Minimal User" },
      approvedBy: null,
      source: "initial_publish",
      restoredFromVersion: null,
      changeSummary: null,
      createdAt: "2026-09-01T12:00:00.000Z",
    });
  });
});

describe("serializeRevisionSummary", () => {
  it("omits Markdown and does not invent a length for projected content", () => {
    const fakeId = new Types.ObjectId();
    const fakePostId = new Types.ObjectId();
    const fakeUserId = new Types.ObjectId();
    const createdAt = new Date("2026-09-01T12:00:00.000Z");

    const raw = {
      _id: fakeId,
      postId: fakePostId,
      slug: "summary-post",
      version: 3,
      title: "Summary Title",
      excerpt: "A brief summary",
      coverImage: "",
      coverFocalPoint: { x: 0.5, y: 0.5 },
      tags: ["Dev"],
      authors: [{ userId: fakeUserId, name: "Author" }],
      editor: { userId: fakeUserId, name: "Author" },
      approvedBy: null,
      source: "admin_edit" as const,
      restoredFromVersion: null,
      changeSummary: null,
      createdAt,
    };

    const summary = serializeRevisionSummary(raw);

    expect(summary).not.toHaveProperty("content");
    expect(summary).not.toHaveProperty("contentLength");
    expect(summary.version).toBe(3);
    expect(summary.slug).toBe("summary-post");
  });
});
