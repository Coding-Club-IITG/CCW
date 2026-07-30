const REGEX_SPECIAL_CHARACTERS = /[.*+?^${}()|[\]\\]/g;

export const DEFAULT_SEARCH_MAX_LENGTH = 100;

export type PreparedSearchQuery = {
  query: string;
  pattern: string;
};

export function prepareSearchQuery(
  value: unknown,
  options: { minLength?: number; maxLength?: number } = {},
): PreparedSearchQuery | null {
  if (typeof value !== "string") return null;

  const minLength = Math.max(0, options.minLength ?? 1);
  const maxLength = Math.max(
    minLength,
    options.maxLength ?? DEFAULT_SEARCH_MAX_LENGTH,
  );
  const query = value.trim().slice(0, maxLength);

  if (query.length < minLength) return null;

  return {
    query,
    pattern: query.replace(REGEX_SPECIAL_CHARACTERS, "\\$&"),
  };
}
