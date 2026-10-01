/**
 * Member-facing social links
 */

const GITHUB_HANDLE = /^[\w.-]{1,50}$/;

export function githubProfileUrl(handle?: string | null): string | null {
  const value = handle?.trim() ?? "";
  if (!value || !GITHUB_HANDLE.test(value)) return null;
  return `https://github.com/${value}`;
}

export function normalizeLinkedInUrl(value?: string | null): string | null {
  const raw = value?.trim() ?? "";
  if (!raw) return null;
  if (raw.length > 200) return null;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  if (url.protocol !== "https:") return null;

  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const isLinkedIn = host === "linkedin.com" || host.endsWith(".linkedin.com");
  if (!isLinkedIn) return null;

  // A bare host carries no profile
  if (url.pathname === "/" || url.pathname === "") return null;

  url.hash = "";
  url.search = "";
  return url.toString().replace(/\/$/, "");
}
