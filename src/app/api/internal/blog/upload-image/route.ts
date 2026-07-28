import path from "path";
import { canEditBlogDraft } from "@/lib/blogAccess";
import dbConnect from "@/lib/mongodb";
import { createImageUploadHandler } from "@/lib/uploadHandler";
import BlogPost from "@/models/BlogPost";

export const runtime = "nodejs";

const BLOG_UPLOAD_DIR =
  process.env.BLOG_UPLOAD_DIR ?? path.join(process.cwd(), "uploads", "blog");

export const POST = createImageUploadHandler({
  uploadDir: BLOG_UPLOAD_DIR,
  urlPrefix: "/api/blog/assets",
  logPrefix: "[Blog Author Upload]",
  requireAdmin: false,
  authorize: async (user, request) => {
    const slug = request.nextUrl.searchParams.get("slug");
    if (!slug) return false;

    await dbConnect();
    const post = await BlogPost.findOne({ slug }).select("status authors");
    return Boolean(post && canEditBlogDraft(user as any, post));
  },
});
