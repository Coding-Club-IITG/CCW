import {
  mkdir,
  open,
  readdir,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

import { UPLOAD_PREFIXES, type UploadPrefix } from "@/lib/constants";
import { parseStorageEnv, type StorageEnv } from "@/lib/env/schema";
import { errorToLogMetadata, logger } from "@/lib/telemetry/logger";

export interface ObjectMetadata {
  key: string;
  size: number;
  modifiedAt: Date;
}

export interface ObjectPage {
  objects: ObjectMetadata[];
  cursor?: string;
}

export interface ByteRange {
  start: number;
  end: number;
}

export interface UploadStorage {
  write(key: string, body: Uint8Array, contentType: string): Promise<void>;
  metadata(key: string): Promise<ObjectMetadata>;
  read(key: string, range?: ByteRange): Promise<ReadableStream<Uint8Array>>;
  delete(key: string): Promise<void>;
  list(prefix: UploadPrefix, cursor?: string): Promise<ObjectPage>;
}

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Upload object not found");
  }
}

function splitKey(key: string) {
  const directory = key.slice(0, key.lastIndexOf("/") + 1);
  const prefix = UPLOAD_PREFIXES.find((candidate) => candidate === directory);
  const name = prefix ? key.slice(prefix.length) : "";
  if (
    !prefix ||
    !name ||
    name === "." ||
    name === ".." ||
    /[/\\\x00-\x1f]/.test(name)
  ) {
    throw new Error("Invalid upload object key");
  }
  return { prefix, name };
}

function missing(error: unknown): never {
  const detail = error as {
    code?: string;
    name?: string;
  };
  if (
    detail.code === "ENOENT" ||
    detail.name === "NoSuchKey" ||
    detail.name === "NotFound"
  ) {
    throw new ObjectNotFoundError();
  }
  throw error;
}

export class LocalUploadStorage implements UploadStorage {
  constructor(private readonly directories: Record<UploadPrefix, string>) {}

  private file(key: string) {
    const { prefix, name } = splitKey(key);
    return path.join(this.directories[prefix], name);
  }

  async write(key: string, body: Uint8Array, _contentType: string) {
    const file = this.file(key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, body, { flag: "wx" });
  }

  async metadata(key: string): Promise<ObjectMetadata> {
    try {
      const info = await stat(this.file(key));
      return { key, size: info.size, modifiedAt: info.mtime };
    } catch (error) {
      return missing(error);
    }
  }

  async read(
    key: string,
    range?: ByteRange,
  ): Promise<ReadableStream<Uint8Array>> {
    try {
      // Open before returning headers so a missing file produces a 404
      const handle = await open(this.file(key), "r");
      return Readable.toWeb(
        handle.createReadStream(range),
      ) as ReadableStream<Uint8Array>;
    } catch (error) {
      return missing(error);
    }
  }

  async delete(key: string) {
    try {
      await unlink(this.file(key));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  async list(prefix: UploadPrefix, cursor?: string): Promise<ObjectPage> {
    let entries;
    try {
      entries = await readdir(this.directories[prefix], {
        withFileTypes: true,
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT")
        return { objects: [] };
      throw error;
    }

    const keys = entries
      .filter((entry) => entry.isFile())
      .map((entry) => `${prefix}${entry.name}`)
      .filter((key) => !cursor || key > cursor)
      .sort();
    const page = keys.slice(0, 1000);
    const objects: ObjectMetadata[] = [];

    for (const key of page) {
      try {
        objects.push(await this.metadata(key));
      } catch (error) {
        if (!(error instanceof ObjectNotFoundError)) throw error;
      }
    }

    return {
      objects,
      cursor: keys.length > page.length ? page.at(-1) : undefined,
    };
  }
}

export class R2UploadStorage implements UploadStorage {
  constructor(
    private readonly client: S3Client,
    private readonly bucket: string,
  ) {}

  private object(key: string) {
    splitKey(key);
    return { Bucket: this.bucket, Key: key };
  }

  async write(key: string, body: Uint8Array, contentType: string) {
    await this.client.send(
      new PutObjectCommand({
        ...this.object(key),
        Body: body,
        ContentType: contentType,
        StorageClass: "STANDARD",
      }),
    );
  }

  async metadata(key: string): Promise<ObjectMetadata> {
    try {
      const result = await this.client.send(
        new HeadObjectCommand(this.object(key)),
      );

      if (result.ContentLength === undefined || !result.LastModified)
        throw new Error("Invalid object metadata");

      return {
        key,
        size: result.ContentLength,
        modifiedAt: result.LastModified,
      };
    } catch (error) {
      return missing(error);
    }
  }

  async read(
    key: string,
    range?: ByteRange,
  ): Promise<ReadableStream<Uint8Array>> {
    try {
      const result = await this.client.send(
        new GetObjectCommand({
          ...this.object(key),
          Range: range ? `bytes=${range.start}-${range.end}` : undefined,
        }),
      );

      if (!result.Body) throw new Error("Missing object response body");
      return result.Body.transformToWebStream();
    } catch (error) {
      return missing(error);
    }
  }

  async delete(key: string) {
    try {
      await this.client.send(new DeleteObjectCommand(this.object(key)));
    } catch (error) {
      try {
        missing(error);
      } catch (normalized) {
        if (!(normalized instanceof ObjectNotFoundError)) throw normalized;
      }
    }
  }

  async list(prefix: UploadPrefix, cursor?: string): Promise<ObjectPage> {
    const result = await this.client.send(
      new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: prefix,
        Delimiter: "/",
        MaxKeys: 1000,
        ContinuationToken: cursor,
      }),
    );
    if (result.IsTruncated && !result.NextContinuationToken)
      throw new Error("Missing object listing cursor");
    return {
      objects: (result.Contents ?? []).map((entry) => {
        if (!entry.Key || entry.Size === undefined || !entry.LastModified)
          throw new Error("Invalid object listing metadata");
        return {
          key: entry.Key,
          size: entry.Size,
          modifiedAt: entry.LastModified,
        };
      }),
      cursor: result.IsTruncated ? result.NextContinuationToken : undefined,
    };
  }
}

export function createUploadStorage(env: StorageEnv): UploadStorage {
  if (env.UPLOAD_STORAGE === "r2") {
    if (
      !env.R2_ENDPOINT ||
      !env.R2_BUCKET ||
      !env.R2_ACCESS_KEY_ID ||
      !env.R2_SECRET_ACCESS_KEY
    )
      throw new Error("Incomplete R2 configuration");
    return new R2UploadStorage(
      new S3Client({
        region: "auto",
        endpoint: env.R2_ENDPOINT,
        credentials: {
          accessKeyId: env.R2_ACCESS_KEY_ID,
          secretAccessKey: env.R2_SECRET_ACCESS_KEY,
        },
        requestChecksumCalculation: "WHEN_REQUIRED",
        responseChecksumValidation: "WHEN_REQUIRED",
      }),
      env.R2_BUCKET,
    );
  }

  return new LocalUploadStorage({
    "files/": path.resolve(env.FILE_UPLOAD_DIR),
    "files/recruitment/": path.resolve(env.FILE_UPLOAD_DIR, "recruitment"),
    "blog/": path.resolve(env.BLOG_UPLOAD_DIR),
    "events/": path.resolve(env.EVENT_UPLOAD_DIR),
    "projects/": path.resolve(env.PROJECT_UPLOAD_DIR),
    "avatars/": path.resolve(env.AVATAR_UPLOAD_DIR),
  });
}

let storage: UploadStorage | undefined;
export function getUploadStorage(): UploadStorage {
  return (storage ??= createUploadStorage(parseStorageEnv(process.env)));
}

/** Best-effort rollback */
export async function removeUpload(key: string) {
  try {
    await getUploadStorage().delete(key);
  } catch (error) {
    logger.warn("Upload object cleanup failed", {
      operation: "remove_upload",
      key,
      ...errorToLogMetadata(error),
    });
  }
}
