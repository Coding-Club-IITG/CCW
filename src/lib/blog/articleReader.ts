export type ArticleTextSize = "small" | "default" | "large";

export const ARTICLE_TEXT_SIZE_STORAGE_KEY = "ccw-blog-text-size";

type ClipboardWriter = Pick<Clipboard, "writeText">;

export async function writeClipboardText(
  text: string,
  clipboard: ClipboardWriter | undefined,
) {
  if (!clipboard) throw new Error("Clipboard access is unavailable");
  await clipboard.writeText(text);
}

export function isArticleTextSize(
  value: string | null,
): value is ArticleTextSize {
  return value === "small" || value === "default" || value === "large";
}

interface ReadingProgressInput {
  scrollY: number;
  articleTop: number;
  articleHeight: number;
  viewportHeight: number;
  topOffset?: number;
}

export function calculateReadingProgress({
  scrollY,
  articleTop,
  articleHeight,
  viewportHeight,
  topOffset = 0,
}: ReadingProgressInput): number {
  const distance = Math.max(articleHeight - viewportHeight, 1);
  const travelled = scrollY + topOffset - articleTop;
  return Math.min(1, Math.max(0, travelled / distance));
}

export function findActiveHeading(
  headings: Array<{ id: string; top: number }>,
  threshold: number,
): string | null {
  if (headings.length === 0) return null;
  let active = headings[0].id;
  for (const heading of headings) {
    if (heading.top > threshold) break;
    active = heading.id;
  }
  return active;
}
