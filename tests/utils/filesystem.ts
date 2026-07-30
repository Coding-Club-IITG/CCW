import { mkdtemp, readdir, rm } from "fs/promises";
import path from "path";
import os from "os";

const TEST_DIRECTORY_PREFIX = path.join(os.tmpdir(), "ccw-files-test-");
const BLOG_TEST_DIRECTORY_PREFIX = path.join(os.tmpdir(), "ccw-blog-test-");

export async function startTestUploadDirectory(): Promise<string> {
  const directory = await mkdtemp(TEST_DIRECTORY_PREFIX);
  process.env.FILE_UPLOAD_DIR = directory;
  return directory;
}

export async function listTestUploads(directory: string): Promise<string[]> {
  assertTestUploadDirectory(directory);
  return readdir(directory);
}

export async function stopTestUploadDirectory(
  directory: string,
): Promise<void> {
  assertTestUploadDirectory(directory);
  await rm(directory, { recursive: true, force: true });
  delete process.env.FILE_UPLOAD_DIR;
}

export async function startTestBlogDirectory(): Promise<string> {
  const directory = await mkdtemp(BLOG_TEST_DIRECTORY_PREFIX);
  process.env.BLOG_UPLOAD_DIR = directory;
  return directory;
}

export async function listTestBlogUploads(
  directory: string,
): Promise<string[]> {
  assertTestBlogDirectory(directory);
  return readdir(directory);
}

export async function stopTestBlogDirectory(directory: string): Promise<void> {
  assertTestBlogDirectory(directory);
  await rm(directory, { recursive: true, force: true });
  delete process.env.BLOG_UPLOAD_DIR;
}

function assertTestUploadDirectory(directory: string): void {
  const resolved = path.resolve(directory);
  if (!resolved.startsWith(TEST_DIRECTORY_PREFIX)) {
    throw new Error(
      "Refusing to clean a directory outside the test namespace.",
    );
  }
}

function assertTestBlogDirectory(directory: string): void {
  const resolved = path.resolve(directory);
  if (!resolved.startsWith(BLOG_TEST_DIRECTORY_PREFIX)) {
    throw new Error(
      "Refusing to clean a blog directory outside the test namespace.",
    );
  }
}
