import path from "path";

import { ALLOWED_IMAGE_EXTENSIONS } from "@/lib/constants";
import { getUploadStorage, type UploadStorage } from "@/lib/files/storage";
import type { UploadPrefix } from "@/lib/constants";
import { connectMongoDB } from "@/lib/db/mongodb";
import { errorToLogMetadata, logger } from "@/lib/telemetry/logger";

import BlogPost from "@/models/BlogPost";
import Event from "@/models/Event";
import Project from "@/models/Project";

export const ORPHAN_IMAGE_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export interface ImageCleanupReport {
  deleted: number;
  recentlySkipped: number;
  failed: number;
}

const BLOG_ASSET_PATTERN = /\/api\/blog\/assets\/([0-9a-f-]+\.\w+)/g;
const EVENT_ASSET_PATTERN = /\/api\/events\/assets\/([0-9a-f]+\.\w+)/g;
const PROJECT_ASSET_PATTERN = /\/api\/projects\/assets\/([0-9a-f]+\.\w+)/g;

const ALLOWED_EXTENSIONS_SET = new Set<string>(ALLOWED_IMAGE_EXTENSIONS);

export function extractFilenames(
  sources: string[],
  pattern: RegExp,
): Set<string> {
  const files = new Set<string>();
  for (const source of sources) {
    const regex = new RegExp(pattern.source, "g");
    let match: RegExpExecArray | null;
    while ((match = regex.exec(source)) !== null) {
      files.add(match[1]);
    }
  }
  return files;
}

/**
 * Removes orphaned images from a paginated upload prefix
 */
export async function cleanupDirectory(
  prefix: Extract<UploadPrefix, "blog/" | "events/" | "projects/">,
  referencedFiles: Set<string>,
  label: string,
  now = new Date(),
  storage: UploadStorage = getUploadStorage(),
): Promise<ImageCleanupReport> {
  const report: ImageCleanupReport = {
    deleted: 0,
    recentlySkipped: 0,
    failed: 0,
  };

  let cursor: string | undefined;
  do {
    const page = await storage.list(prefix, cursor);
    for (const entry of page.objects) {
      const filename = entry.key.slice(prefix.length);
      if (
        !entry.key.startsWith(prefix) ||
        !filename ||
        filename.includes("/") ||
        !ALLOWED_EXTENSIONS_SET.has(path.extname(filename).toLowerCase()) ||
        referencedFiles.has(filename)
      )
        continue;
      if (
        now.getTime() - entry.modifiedAt.getTime() <
        ORPHAN_IMAGE_RETENTION_MS
      ) {
        report.recentlySkipped++;
        continue;
      }
      try {
        await storage.delete(entry.key);
        report.deleted++;
      } catch (error) {
        report.failed++;
        logger.error("Image cleanup could not delete orphaned object", {
          operation: "delete_orphan_image",
          uploadType: label,
          filename,
          ...errorToLogMetadata(error),
        });
      }
    }
    cursor = page.cursor;
  } while (cursor);

  logger.info("Image cleanup directory complete", {
    operation: "cleanup_orphan_images",
    uploadType: label,
    deleted: report.deleted,
    recentlySkipped: report.recentlySkipped,
    failed: report.failed,
  });

  return report;
}

/**
 * Removes orphaned images from blog, event, and project upload prefixes
 */
export async function cleanupOrphanedImages(now = new Date()) {
  logger.info("[ImageCleanup] Starting orphaned image cleanup...");

  await connectMongoDB();

  // Blog images
  const posts = await BlogPost.find({}).select("content coverImage").lean();
  const blogSources = posts.flatMap((p) => [
    p.content || "",
    p.coverImage || "",
  ]);
  const referencedBlogFiles = extractFilenames(blogSources, BLOG_ASSET_PATTERN);
  const blogReport = await cleanupDirectory(
    "blog/",
    referencedBlogFiles,
    "Blog",
    now,
  );

  // Event images
  const events = await Event.find({}).select("poster description").lean();
  const eventSources = events.flatMap((e) => [
    e.poster || "",
    e.description || "",
  ]);
  const referencedEventFiles = extractFilenames(
    eventSources,
    EVENT_ASSET_PATTERN,
  );
  const eventReport = await cleanupDirectory(
    "events/",
    referencedEventFiles,
    "Events",
    now,
  );

  // Project images
  const projects = await Project.find({})
    .select("coverImage description")
    .lean();
  const projectSources = projects.flatMap((p) => [
    p.coverImage || "",
    p.description || "",
  ]);
  const referencedProjectFiles = extractFilenames(
    projectSources,
    PROJECT_ASSET_PATTERN,
  );
  const projectReport = await cleanupDirectory(
    "projects/",
    referencedProjectFiles,
    "Projects",
    now,
  );

  const total = [blogReport, eventReport, projectReport].reduce(
    (summary, report) => ({
      deleted: summary.deleted + report.deleted,
      recentlySkipped: summary.recentlySkipped + report.recentlySkipped,
      failed: summary.failed + report.failed,
    }),
    { deleted: 0, recentlySkipped: 0, failed: 0 },
  );
  logger.info("Image cleanup complete", {
    operation: "cleanup_orphan_images",
    ...total,
  });
  return total;
}
