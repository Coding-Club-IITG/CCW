type QueryValue = string | number | readonly string[] | undefined;

export function queryParamsWithDefaults(
  query: Record<string, QueryValue>,
  defaults: Record<string, QueryValue>,
  current = new URLSearchParams(),
): URLSearchParams {
  const params = new URLSearchParams(current);
  for (const key of new Set([
    ...Object.keys(defaults),
    ...Object.keys(query),
  ])) {
    params.delete(key);
    const value = query[key];
    if (value === undefined || value === "" || value === defaults[key])
      continue;
    if (Array.isArray(value)) {
      for (const item of value) params.append(key, item);
    } else {
      params.set(key, String(value));
    }
  }
  return params;
}
