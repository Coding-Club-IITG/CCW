import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { S3Client } from "@aws-sdk/client-s3";
import { afterEach, describe, expect, it, vi } from "vitest";

import { UPLOAD_PREFIXES } from "@/lib/constants";
import { parseStorageEnv } from "@/lib/env/schema";
import {
  createUploadStorage,
  ObjectNotFoundError,
  R2UploadStorage,
} from "./storage";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function localStorage() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "ccw-storage-"));
  directories.push(directory);
  return createUploadStorage(
    parseStorageEnv({
      FILE_UPLOAD_DIR: path.join(directory, "files"),
      BLOG_UPLOAD_DIR: path.join(directory, "blog"),
      EVENT_UPLOAD_DIR: path.join(directory, "events"),
      PROJECT_UPLOAD_DIR: path.join(directory, "projects"),
      AVATAR_UPLOAD_DIR: path.join(directory, "avatars"),
    }),
  );
}

describe("local upload storage", () => {
  it.each(UPLOAD_PREFIXES)(
    "writes, streams, ranges, lists and deletes %s",
    async (prefix) => {
      const storage = await localStorage();
      const key = `${prefix}example.pdf`;
      expect(await storage.list(prefix)).toEqual({ objects: [] });
      await storage.write(key, Buffer.from("%PDF-content"), "application/pdf");
      expect(await storage.metadata(key)).toMatchObject({
        key,
        size: 12,
        modifiedAt: expect.any(Date),
      });
      expect(await new Response(await storage.read(key)).text()).toBe(
        "%PDF-content",
      );
      expect(
        await new Response(
          await storage.read(key, { start: 0, end: 4 }),
        ).text(),
      ).toBe("%PDF-");
      expect(
        (await storage.list(prefix)).objects.map((entry) => entry.key),
      ).toEqual([key]);
      await storage.delete(key);
      await storage.delete(key);
      await expect(storage.read(key)).rejects.toBeInstanceOf(
        ObjectNotFoundError,
      );
      await expect(storage.metadata(key)).rejects.toBeInstanceOf(
        ObjectNotFoundError,
      );
    },
  );

  it("uses stable cursors while objects from previous pages are removed", async () => {
    const storage = await localStorage();
    await Promise.all(
      Array.from({ length: 1001 }, (_, i) =>
        storage.write(
          `blog/${String(i).padStart(4, "0")}.png`,
          Buffer.from("x"),
          "image/png",
        ),
      ),
    );
    await storage.write(
      "files/recruitment/guide.pdf",
      Buffer.from("x"),
      "application/pdf",
    );
    const first = await storage.list("blog/");
    expect(first.objects).toHaveLength(1000);
    await Promise.all(first.objects.map((entry) => storage.delete(entry.key)));
    const last = await storage.list("blog/", first.cursor);
    expect(last.objects.map((entry) => entry.key)).toEqual(["blog/1000.png"]);
    expect(last.cursor).toBeUndefined();
    expect((await storage.list("files/")).objects).toEqual([]);
  });

  it.each([
    "../secret",
    "blog/../secret",
    "blog/..",
    "blog/a\\b",
    "unknown/a",
    "blog/a\0",
  ])("rejects unsafe key %s", async (key) => {
    await expect(
      (await localStorage()).write(key, Buffer.from("x"), "text/plain"),
    ).rejects.toThrow("Invalid upload object key");
  });
});

describe("R2 upload storage at the SDK boundary", () => {
  function setup() {
    const client = new S3Client({
      region: "auto",
      credentials: { accessKeyId: "test", secretAccessKey: "test" },
    });
    const send = vi.spyOn(client, "send") as unknown as import("vitest").Mock<
      (command: { input: Record<string, unknown> }) => Promise<unknown>
    >;
    return { storage: new R2UploadStorage(client, "ccw-uploads"), send };
  }

  it.each(UPLOAD_PREFIXES)(
    "preserves object keys and streams in %s",
    async (prefix) => {
      const { storage, send } = setup();
      const key = `${prefix}abc.pdf`;
      send.mockResolvedValueOnce({});
      await storage.write(key, Buffer.from("pdf"), "application/pdf");
      expect(send.mock.calls[0][0].input).toMatchObject({
        Bucket: "ccw-uploads",
        Key: key,
        ContentType: "application/pdf",
        StorageClass: "STANDARD",
      });
      send.mockResolvedValueOnce({
        ContentLength: 9,
        LastModified: new Date(0),
      });
      expect(await storage.metadata(key)).toEqual({
        key,
        size: 9,
        modifiedAt: new Date(0),
      });
      send.mockResolvedValueOnce({
        Body: { transformToWebStream: () => new Response("part").body },
      });
      expect(
        await new Response(
          await storage.read(key, { start: 2, end: 5 }),
        ).text(),
      ).toBe("part");
      expect(send.mock.calls[2][0].input).toMatchObject({
        Key: key,
        Range: "bytes=2-5",
      });
      send.mockResolvedValueOnce({});
      await storage.delete(key);
      expect(send.mock.calls[3][0].input).toEqual({
        Bucket: "ccw-uploads",
        Key: key,
      });
    },
  );

  it("paginates only the requested prefix and passes opaque cursors", async () => {
    const { storage, send } = setup();
    send.mockResolvedValueOnce({
      Contents: [{ Key: "blog/a.png", Size: 2, LastModified: new Date(0) }],
      IsTruncated: true,
      NextContinuationToken: "opaque",
    });
    const page = await storage.list("blog/");
    expect(page.cursor).toBe("opaque");
    send.mockResolvedValueOnce({});
    expect((await storage.list("blog/", page.cursor)).objects).toEqual([]);
    expect(send.mock.calls[1][0].input).toMatchObject({
      Prefix: "blog/",
      Delimiter: "/",
      ContinuationToken: "opaque",
      MaxKeys: 1000,
    });
  });

  it("normalizes missing objects without hiding permission or network failures", async () => {
    const { storage, send } = setup();
    send.mockRejectedValueOnce(
      Object.assign(new Error(), { name: "NoSuchKey" }),
    );
    await expect(storage.read("blog/a.png")).rejects.toBeInstanceOf(
      ObjectNotFoundError,
    );
    send.mockRejectedValueOnce(
      Object.assign(new Error(), { name: "NotFound" }),
    );
    await expect(storage.metadata("blog/a.png")).rejects.toBeInstanceOf(
      ObjectNotFoundError,
    );
    send.mockRejectedValueOnce(new Error("AccessDenied"));
    await expect(
      storage.write("blog/a.png", Buffer.from("x"), "image/png"),
    ).rejects.toThrow("AccessDenied");
    send.mockRejectedValueOnce(new Error("network unavailable"));
    await expect(storage.read("blog/a.png")).rejects.toThrow(
      "network unavailable",
    );
  });
});
