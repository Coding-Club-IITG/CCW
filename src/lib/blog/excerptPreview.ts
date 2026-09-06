export function excerptPreview(excerpt: string, maxLength = 160): string {
  const text = excerpt.trim().replace(/\s+/g, " ");
  if (text.length <= maxLength) return text;

  const suffix = " ...";
  const limit = maxLength - suffix.length;
  const wordEnd = text.lastIndexOf(" ", limit);
  const preview = text
    .slice(0, wordEnd > 0 ? wordEnd : limit)
    .replace(/[\s,.;:!?…—–-]+$/u, "");

  return `${preview}${suffix}`;
}
