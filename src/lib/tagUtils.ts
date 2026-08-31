export const DEFAULT_TAG_MAX_LENGTH = 50;

export type TagValidationResult =
  | { ok: true; tags: string[] }
  | { ok: false; error: string };

export function normalizeTag(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function normalizeTags(values: readonly unknown[]): string[] {
  const tags: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    if (typeof value !== "string") continue;
    const tag = normalizeTag(value);
    const key = tag.toLowerCase();
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
  }

  return tags;
}

export function parseTagList(value: string): string[] {
  return normalizeTags(value.split(","));
}

export function validateTags(
  value: unknown,
  options: {
    minTags?: number;
    maxTags?: number;
    maxLength?: number;
  } = {},
): TagValidationResult {
  const minTags = options.minTags ?? 0;
  const maxTags = options.maxTags ?? Number.POSITIVE_INFINITY;
  const maxLength = options.maxLength ?? DEFAULT_TAG_MAX_LENGTH;

  if (!Array.isArray(value) || value.some((tag) => typeof tag !== "string")) {
    return { ok: false, error: "Tags must be an array of strings." };
  }

  const tags = normalizeTags(value);
  const tooLong = tags.find((tag) => tag.length > maxLength);
  if (tooLong) {
    return {
      ok: false,
      error: `Each tag must be ${maxLength} characters or fewer.`,
    };
  }
  if (tags.length < minTags) {
    return {
      ok: false,
      error:
        minTags === 1
          ? "At least one tag is required."
          : `At least ${minTags} tags are required.`,
    };
  }
  if (tags.length > maxTags) {
    return {
      ok: false,
      error: `No more than ${maxTags} tags are allowed.`,
    };
  }

  return { ok: true, tags };
}
