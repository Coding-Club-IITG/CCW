import { S3Client } from "@aws-sdk/client-s3";
import { mkdtemp, readdir, rm, utimes, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanupDirectory,
  extractFilenames,
  ORPHAN_IMAGE_RETENTION_MS,
} from "./imageCleanup";

import { createUploadStorage, R2UploadStorage } from "@/lib/files/storage";
import { parseStorageEnv } from "@/lib/env/schema";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function makeUploadDirectory() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "ccw-images-"));
  temporaryDirectories.push(directory);
  return directory;
}

describe("cleanupDirectory", () => {
  it("keeps referenced and recent images while deleting seven-day-old orphans", async () => {
    const directory = await makeUploadDirectory();
    const now = new Date("2026-08-30T12:00:00.000Z");
    const exactlySevenDaysOld = new Date(
      now.getTime() - ORPHAN_IMAGE_RETENTION_MS,
    );
    const recent = new Date(now.getTime() - ORPHAN_IMAGE_RETENTION_MS + 1);

    await Promise.all([
      writeFile(path.join(directory, "referenced.png"), "image"),
      writeFile(path.join(directory, "recent.png"), "image"),
      writeFile(path.join(directory, "old.png"), "image"),
      writeFile(path.join(directory, "notes.txt"), "not an image"),
    ]);
    await utimes(path.join(directory, "recent.png"), recent, recent);
    await utimes(
      path.join(directory, "old.png"),
      exactlySevenDaysOld,
      exactlySevenDaysOld,
    );

    const report = await cleanupDirectory(
      "blog/",
      new Set(["referenced.png"]),
      "Test",
      now,
      createUploadStorage(parseStorageEnv({ BLOG_UPLOAD_DIR: directory })),
    );

    expect(report).toEqual({ deleted: 1, recentlySkipped: 1, failed: 0 });
    expect((await readdir(directory)).sort()).toEqual([
      "notes.txt",
      "recent.png",
      "referenced.png",
    ]);
  });

  it("extracts content and cover references from every supplied source", () => {
    const pattern = /\/api\/blog\/assets\/([0-9a-f-]+\.\w+)/g;
    expect(
      extractFilenames(
        [
          "draft ![](/api/blog/assets/dead-beef.png)",
          "/api/blog/assets/cafe-babe.webp",
        ],
        pattern,
      ),
    ).toEqual(new Set(["dead-beef.png", "cafe-babe.webp"]));
  });
});

it("paginates R2 cleanup without widening scope and retains references and the grace period", async () => {
  const now = new Date("2026-10-05T12:00:00Z");
  const old = new Date(now.getTime() - ORPHAN_IMAGE_RETENTION_MS);
  const client = new S3Client({ region: "auto" });
  const send = vi.spyOn(client, "send") as unknown as import("vitest").Mock<
    (command: { input: Record<string, unknown> }) => Promise<unknown>
  >;
  send.mockResolvedValueOnce({
    Contents: [
      { Key: "blog/old.png", Size: 1, LastModified: old },
      { Key: "blog/reference.png", Size: 1, LastModified: old },
      { Key: "blog/new.png", Size: 1, LastModified: now },
      { Key: "blog/nested/image.png", Size: 1, LastModified: old },
      { Key: "avatars/unrelated.png", Size: 1, LastModified: old },
      { Key: "blog/document.pdf", Size: 1, LastModified: old },
    ],
    IsTruncated: true,
    NextContinuationToken: "page-two",
  });
  send.mockResolvedValueOnce({}); // delete old.png
  send.mockResolvedValueOnce({
    Contents: [{ Key: "blog/failed.png", Size: 1, LastModified: old }],
  });
  send.mockRejectedValueOnce(new Error("storage unavailable"));
  expect(
    await cleanupDirectory(
      "blog/",
      new Set(["reference.png"]),
      "Blog",
      now,
      new R2UploadStorage(client, "test"),
    ),
  ).toEqual({ deleted: 1, recentlySkipped: 1, failed: 1 });
  expect(send.mock.calls.map(([command]) => command.input)).toEqual([
    expect.objectContaining({ Prefix: "blog/" }),
    { Bucket: "test", Key: "blog/old.png" },
    expect.objectContaining({ Prefix: "blog/", ContinuationToken: "page-two" }),
    { Bucket: "test", Key: "blog/failed.png" },
  ]);
});
