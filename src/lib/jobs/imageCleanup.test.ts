import { mkdtemp, readdir, rm, utimes, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import {
  cleanupDirectory,
  extractFilenames,
  ORPHAN_IMAGE_RETENTION_MS,
} from "./imageCleanup";

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
      directory,
      new Set(["referenced.png"]),
      "Test",
      now,
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
