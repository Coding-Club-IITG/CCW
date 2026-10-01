import type { Metadata } from "next";

export const SITE_URL = "https://codingclub.in";
export const SITE_NAME = "Coding Club IITG";
export const SITE_DESCRIPTION =
  "The technical community of IIT Guwahati - building projects, sharing knowledge, and growing through technology.";
export const CLUB_EMAIL = "codingclub@iitg.ac.in";
export const IITG_ADDRESS = {
  streetAddress: "Indian Institute of Technology Guwahati",
  addressLocality: "Guwahati",
  addressRegion: "Assam",
  postalCode: "781039",
  addressCountry: "IN",
} as const;
export const SOCIAL_PROFILES = [
  "https://github.com/Coding-Club-IITG",
  "https://instagram.com/codingclubiitg",
  "https://linkedin.com/company/coding-club-iitg",
] as const;

export function absoluteUrl(value?: string | null): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value, SITE_URL);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

export function plainText(
  value: string,
  fallback: string,
  limit = 160,
): string {
  const text = value
    .replace(/<[^>]*>/g, " ")
    .replace(/[#*_>`~\[\]()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const resolved = text || fallback;
  return resolved.length <= limit
    ? resolved
    : `${resolved.slice(0, limit - 1).trimEnd()}…`;
}

export type OgImageOptions = {
  media?: string | null;
  kicker?: string | null;
  meta?: string | null;
};

export function ogImage(title: string, options?: OgImageOptions): string {
  const stored = absoluteUrl(options?.media);
  if (stored) return stored;

  const params = new URLSearchParams({ title });
  if (options?.kicker) params.set("kicker", options.kicker);
  if (options?.meta) params.set("meta", options.meta);
  return `${SITE_URL}/api/og?${params.toString()}`;
}

export function pageMetadata({
  title,
  description,
  path,
  image,
  robots,
}: {
  title: string;
  description: string;
  path: string;
  image?: string;
  robots?: Metadata["robots"];
}): Metadata {
  const url = absoluteUrl(path)!;
  const preview = image ?? ogImage(title);
  return {
    title,
    description,
    alternates: { canonical: url },
    robots,
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      title,
      description,
      url,
      images: [{ url: preview, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [preview],
    },
  };
}

export function safeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
