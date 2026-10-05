import { z } from "zod";

import { canEditBlogDraft } from "@/lib/access/blog";
import { parseSearchParams } from "@/lib/api/result";
import { createImageUploadHandler } from "@/lib/api/uploads/image";
import { connectMongoDB } from "@/lib/db/mongodb";

import BlogPost from "@/models/BlogPost";

export const runtime = "nodejs";

export const POST = createImageUploadHandler({
  prefix: "blog/",
  urlPrefix: "/api/blog/assets",
  logPrefix: "[Blog Author Upload]",
  requireAdmin: false,
  audit: {
    category: "blog",
    operation: "blog.asset.upload",
    targetType: "blog-asset",
    label: "Blog image",
  },
  authorize: async (user, request) => {
    const query = parseSearchParams(
      request.nextUrl.searchParams,
      z.object({ slug: z.string().trim().min(1).max(250) }),
    );
    if (!query.ok) return false;
    const slug = query.data.slug;

    await connectMongoDB();
    const post = await BlogPost.findOne({ slug }).select("status authors");
    return Boolean(post && canEditBlogDraft(user as any, post));
  },
});
