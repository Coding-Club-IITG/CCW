import { readdir, unlink } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import dbConnect from "@/lib/mongodb";
import BlogPost from "@/models/BlogPost";
import { logger } from "@/lib/utils";

const BLOG_UPLOAD_DIR =
  process.env.BLOG_UPLOAD_DIR ?? path.join(process.cwd(), "uploads", "blog");

const ASSET_URL_PATTERN = /\/api\/blog\/assets\/([0-9a-f-]+\.\w+)/g;

/**
 * Extracts all blog asset filenames referenced in a post's content and coverImage
 */
function extractReferencedFiles(post: {
  content?: string;
  coverImage?: string;
}): Set<string> {
  const files = new Set<string>();

  const sources = [post.content || "", post.coverImage || ""];
  for (const source of sources) {
    let match: RegExpExecArray | null;
    const regex = new RegExp(ASSET_URL_PATTERN.source, "g");
    while ((match = regex.exec(source)) !== null) {
      files.add(match[1]);
    }
  }

  return files;
}

/**
 * Removes orphaned blog images from disk
 */
export async function cleanupOrphanedBlogImages() {
  logger.info("[BlogImageCleanup] Starting orphaned image cleanup...");

  if (!existsSync(BLOG_UPLOAD_DIR)) {
    logger.info(
      "[BlogImageCleanup] Upload directory does not exist, skipping.",
    );
    return;
  }

  await dbConnect();

  // Get all files on disk
  const filesOnDisk = await readdir(BLOG_UPLOAD_DIR);
  if (filesOnDisk.length === 0) {
    logger.info("[BlogImageCleanup] No files on disk, nothing to clean.");
    return;
  }

  // Get all referenced images from all blog posts
  const posts = await BlogPost.find({}).select("content coverImage").lean();

  const referencedFiles = new Set<string>();
  for (const post of posts as any[]) {
    const refs = extractReferencedFiles(post);
    for (const ref of refs) {
      referencedFiles.add(ref);
    }
  }

  // Find orphans
  const orphans = filesOnDisk.filter((file) => !referencedFiles.has(file));

  if (orphans.length === 0) {
    logger.info("[BlogImageCleanup] No orphaned images found.");
    return;
  }

  logger.info(
    `[BlogImageCleanup] Found ${orphans.length} orphaned image(s). Deleting...`,
  );

  let deleted = 0;
  for (const file of orphans) {
    try {
      await unlink(path.join(BLOG_UPLOAD_DIR, file));
      deleted++;
    } catch (err) {
      logger.error(`[BlogImageCleanup] Failed to delete ${file}:`, err);
    }
  }

  logger.info(
    `[BlogImageCleanup] Cleanup complete. Deleted ${deleted}/${orphans.length} orphaned image(s).`,
  );
}
