import { readdir, stat, unlink } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

import { ALLOWED_IMAGE_EXTENSIONS } from "@/lib/constants";
import { workerEnv } from "@/lib/env/worker";
import dbConnect from "@/lib/mongodb";
import { errorToLogMetadata, logger } from "@/lib/utils";
import BlogPost from "@/models/BlogPost";
import Event from "@/models/Event";
import Project from "@/models/Project";

export const ORPHAN_IMAGE_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export interface ImageCleanupReport {
  deleted: number;
  recentlySkipped: number;
  failed: number;
}

const BLOG_UPLOAD_DIR = path.resolve(workerEnv.BLOG_UPLOAD_DIR);

const EVENT_UPLOAD_DIR = path.resolve(workerEnv.EVENT_UPLOAD_DIR);

const PROJECT_UPLOAD_DIR = path.resolve(workerEnv.PROJECT_UPLOAD_DIR);

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
 * Removes orphaned images from a given upload directory
 */
export async function cleanupDirectory(
  uploadDir: string,
  referencedFiles: Set<string>,
  label: string,
  now = new Date(),
): Promise<ImageCleanupReport> {
  const report: ImageCleanupReport = {
    deleted: 0,
    recentlySkipped: 0,
    failed: 0,
  };

  if (!existsSync(uploadDir)) {
    logger.info(`[ImageCleanup] ${label}: directory does not exist, skipping.`);
    return report;
  }

  const entries = await readdir(uploadDir, { withFileTypes: true });
  const imageFiles = entries.filter(
    (entry) =>
      entry.isFile() &&
      ALLOWED_EXTENSIONS_SET.has(path.extname(entry.name).toLowerCase()),
  );

  if (imageFiles.length === 0) {
    logger.info(`[ImageCleanup] ${label}: no image files on disk.`);
    return report;
  }

  const orphans = imageFiles.filter(
    (entry) => !referencedFiles.has(entry.name),
  );

  if (orphans.length === 0) {
    logger.info(`[ImageCleanup] ${label}: no orphaned images found.`);
    return report;
  }

  logger.info(
    `[ImageCleanup] ${label}: evaluating ${orphans.length} orphaned image(s).`,
  );

  for (const entry of orphans) {
    const filePath = path.join(uploadDir, entry.name);
    let modifiedAt: number;

    try {
      modifiedAt = (await stat(filePath)).mtimeMs;
    } catch (error) {
      report.failed++;
      logger.error("Image cleanup could not read file metadata", {
        operation: "read_orphan_image_metadata",
        uploadType: label,
        filename: entry.name,
        ...errorToLogMetadata(error),
      });
      continue;
    }

    if (now.getTime() - modifiedAt < ORPHAN_IMAGE_RETENTION_MS) {
      report.recentlySkipped++;
      continue;
    }

    try {
      await unlink(filePath);
      report.deleted++;
    } catch (error) {
      report.failed++;
      logger.error("Image cleanup could not delete orphaned file", {
        operation: "delete_orphan_image",
        uploadType: label,
        filename: entry.name,
        ...errorToLogMetadata(error),
      });
    }
  }

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
 * Removes orphaned images from blog, event, and project upload directories
 */
export async function cleanupOrphanedImages(now = new Date()) {
  logger.info("[ImageCleanup] Starting orphaned image cleanup...");

  await dbConnect();

  // Blog images
  const posts = await BlogPost.find({}).select("content coverImage").lean();
  const blogSources = posts.flatMap((p) => [
    p.content || "",
    p.coverImage || "",
  ]);
  const referencedBlogFiles = extractFilenames(blogSources, BLOG_ASSET_PATTERN);
  const blogReport = await cleanupDirectory(
    BLOG_UPLOAD_DIR,
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
    EVENT_UPLOAD_DIR,
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
    PROJECT_UPLOAD_DIR,
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
