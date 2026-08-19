import { readdir, unlink } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import dbConnect from "@/lib/mongodb";
import BlogPost from "@/models/BlogPost";
import Event from "@/models/Event";
import Project from "@/models/Project";
import { logger } from "@/lib/utils";
import { ALLOWED_IMAGE_EXTENSIONS } from "@/lib/constants";
import { workerEnv } from "@/lib/env/worker";

const BLOG_UPLOAD_DIR = path.resolve(workerEnv.BLOG_UPLOAD_DIR);

const EVENT_UPLOAD_DIR = path.resolve(workerEnv.EVENT_UPLOAD_DIR);

const PROJECT_UPLOAD_DIR = path.resolve(workerEnv.PROJECT_UPLOAD_DIR);

const BLOG_ASSET_PATTERN = /\/api\/blog\/assets\/([0-9a-f-]+\.\w+)/g;
const EVENT_ASSET_PATTERN = /\/api\/events\/assets\/([0-9a-f]+\.\w+)/g;
const PROJECT_ASSET_PATTERN = /\/api\/projects\/assets\/([0-9a-f]+\.\w+)/g;

const ALLOWED_EXTENSIONS_SET = new Set<string>(ALLOWED_IMAGE_EXTENSIONS);

function extractFilenames(sources: string[], pattern: RegExp): Set<string> {
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
async function cleanupDirectory(
  uploadDir: string,
  referencedFiles: Set<string>,
  label: string,
): Promise<number> {
  if (!existsSync(uploadDir)) {
    logger.info(`[ImageCleanup] ${label}: directory does not exist, skipping.`);
    return 0;
  }

  const entries = await readdir(uploadDir, { withFileTypes: true });
  const imageFiles = entries.filter(
    (entry) =>
      entry.isFile() &&
      ALLOWED_EXTENSIONS_SET.has(path.extname(entry.name).toLowerCase()),
  );

  if (imageFiles.length === 0) {
    logger.info(`[ImageCleanup] ${label}: no image files on disk.`);
    return 0;
  }

  const orphans = imageFiles.filter(
    (entry) => !referencedFiles.has(entry.name),
  );

  if (orphans.length === 0) {
    logger.info(`[ImageCleanup] ${label}: no orphaned images found.`);
    return 0;
  }

  logger.info(
    `[ImageCleanup] ${label}: found ${orphans.length} orphaned image(s). Deleting...`,
  );

  let deleted = 0;
  for (const entry of orphans) {
    try {
      await unlink(path.join(uploadDir, entry.name));
      deleted++;
    } catch (err) {
      logger.error(
        `[ImageCleanup] ${label}: failed to delete ${entry.name}:`,
        err,
      );
    }
  }

  logger.info(
    `[ImageCleanup] ${label}: deleted ${deleted}/${orphans.length} orphaned image(s).`,
  );

  return deleted;
}

/**
 * Removes orphaned images from blog, event, and project upload directories
 */
export async function cleanupOrphanedImages() {
  logger.info("[ImageCleanup] Starting orphaned image cleanup...");

  await dbConnect();

  // Blog images
  const posts = await BlogPost.find({}).select("content coverImage").lean();
  const blogSources = (posts as any[]).flatMap((p) => [
    p.content || "",
    p.coverImage || "",
  ]);
  const referencedBlogFiles = extractFilenames(blogSources, BLOG_ASSET_PATTERN);
  await cleanupDirectory(BLOG_UPLOAD_DIR, referencedBlogFiles, "Blog");

  // Event images
  const events = await Event.find({}).select("poster description").lean();
  const eventSources = (events as any[]).flatMap((e) => [
    e.poster || "",
    e.description || "",
  ]);
  const referencedEventFiles = extractFilenames(
    eventSources,
    EVENT_ASSET_PATTERN,
  );
  await cleanupDirectory(EVENT_UPLOAD_DIR, referencedEventFiles, "Events");

  // Project images
  const projects = await Project.find({})
    .select("coverImage description")
    .lean();
  const projectSources = (projects as any[]).flatMap((p) => [
    p.coverImage || "",
    p.description || "",
  ]);
  const referencedProjectFiles = extractFilenames(
    projectSources,
    PROJECT_ASSET_PATTERN,
  );
  await cleanupDirectory(
    PROJECT_UPLOAD_DIR,
    referencedProjectFiles,
    "Projects",
  );

  logger.info("[ImageCleanup] All cleanup tasks complete.");
}
