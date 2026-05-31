/**
 * Fetches the Open Graph image URL from a website's meta tags
 */

import { logger } from "@/lib/utils";

export async function fetchOgImage(url: string): Promise<string> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; CCW-Bot/1.0)",
      },
    });
    clearTimeout(timeout);

    if (!res.ok) return "";

    const html = await res.text();

    // Look for og:image meta tag
    const ogMatch =
      html.match(
        /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
      ) ||
      html.match(
        /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
      );

    if (ogMatch && ogMatch[1]) {
      const imgUrl = ogMatch[1];
      // Handle relative URLs
      if (imgUrl.startsWith("http")) return imgUrl;
      try {
        const base = new URL(url);
        return new URL(imgUrl, base.origin).href;
      } catch {
        return "";
      }
    }

    // Fallback: twitter:image
    const twitterMatch =
      html.match(
        /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
      ) ||
      html.match(
        /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i,
      );

    if (twitterMatch && twitterMatch[1]) {
      const imgUrl = twitterMatch[1];
      if (imgUrl.startsWith("http")) return imgUrl;
      try {
        const base = new URL(url);
        return new URL(imgUrl, base.origin).href;
      } catch {
        return "";
      }
    }

    return "";
  } catch (err) {
    logger.warn(`[og-image] Failed to fetch OG image from ${url}:`, err);
    return "";
  }
}
