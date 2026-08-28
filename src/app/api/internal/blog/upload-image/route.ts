import path from "path";
import { z } from "zod";

import { canEditBlogDraft } from "@/lib/access/blog";
import { parseSearchParams } from "@/lib/api/result";
import { createImageUploadHandler } from "@/lib/api/uploads/image";
import { webEnv } from "@/lib/env/web";
import dbConnect from "@/lib/mongodb";
import BlogPost from "@/models/BlogPost";

export const runtime = "nodejs";

const BLOG_UPLOAD_DIR = path.resolve(webEnv.BLOG_UPLOAD_DIR);

export const POST = createImageUploadHandler({
  uploadDir: BLOG_UPLOAD_DIR,
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

    await dbConnect();
    const post = await BlogPost.findOne({ slug }).select("status authors");
    return Boolean(post && canEditBlogDraft(user as any, post));
  },
});
