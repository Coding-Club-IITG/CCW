export function deriveUploadedImageAltText(filename: string): string {
  const normalized = filename
    .replace(/\.[^.]*$/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return normalized || "Uploaded image";
}

export function replaceSelectionWithMarkdown(
  value: string,
  start: number,
  end: number,
  markdown: string,
) {
  return {
    value: value.slice(0, start) + markdown + value.slice(end),
    caret: start + markdown.length,
  };
}
