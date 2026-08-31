/**
 * Reading time is derived from the post body on read
 */

const WORDS_PER_MINUTE = 220;

function toProse(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/[*_~>]/g, " ")
    .replace(/<[^>]+>/g, " ");
}

export function countWords(markdown: string): number {
  const prose = toProse(markdown ?? "").trim();
  if (!prose) return 0;
  return prose.split(/\s+/).filter(Boolean).length;
}

export function readingMinutes(markdown: string): number {
  const words = countWords(markdown);
  if (words === 0) return 0;
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}

export function readingTimeLabel(markdown: string): string {
  const minutes = readingMinutes(markdown);
  return minutes === 0 ? "" : `${minutes} min read`;
}
