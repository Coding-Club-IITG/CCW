import { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/internal/", "/admin/"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
