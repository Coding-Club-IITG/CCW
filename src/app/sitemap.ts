import type { MetadataRoute } from "next";
import dbConnect from "@/lib/mongodb";
import { SITE_URL } from "@/lib/seo";
import { errorToLogMetadata, logger } from "@/lib/utils";
import BlogPost from "@/models/BlogPost";
import Event from "@/models/Event";

export const revalidate = 3600;

const staticPages: MetadataRoute.Sitemap = [
  { url: SITE_URL, changeFrequency: "weekly", priority: 1 },
  { url: `${SITE_URL}/team`, changeFrequency: "monthly", priority: 0.8 },
  { url: `${SITE_URL}/blog`, changeFrequency: "weekly", priority: 0.9 },
  { url: `${SITE_URL}/events`, changeFrequency: "weekly", priority: 0.8 },
  { url: `${SITE_URL}/projects`, changeFrequency: "monthly", priority: 0.8 },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  try {
    await dbConnect();
    const [posts, events] = await Promise.all([
      BlogPost.find({ status: "published" }).select("slug updatedAt").lean(),
      Event.find({ status: "published", slug: { $type: "string", $ne: "" } })
        .select("slug updatedAt")
        .lean(),
    ]);
    return [
      ...staticPages,
      ...posts.map((post) => ({
        url: `${SITE_URL}/blog/${post.slug}`,
        lastModified: post.updatedAt,
        changeFrequency: "monthly" as const,
        priority: 0.7,
      })),
      ...events.map((event) => ({
        url: `${SITE_URL}/events/${event.slug}`,
        lastModified: event.updatedAt,
        changeFrequency: "monthly" as const,
        priority: 0.7,
      })),
    ];
  } catch (error) {
    logger.error("Dynamic sitemap content unavailable", {
      route: "/sitemap.xml",
      operation: "build_sitemap",
      ...errorToLogMetadata(error),
    });
    return staticPages;
  }
}
