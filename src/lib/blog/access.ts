import { canEditBlogDraft } from "@/lib/access/blog";
import { requireSession } from "@/lib/api/auth";
import { err, ok } from "@/lib/api/result";
import dbConnect from "@/lib/mongodb";
import BlogPost from "@/models/BlogPost";

export async function requireBlogEditor(request: Request, slug: string) {
  const session = await requireSession(request);
  if (!session.ok) return session;

  await dbConnect();
  const post = await BlogPost.findOne({ slug });
  if (!post) return err("NOT_FOUND", "Post not found.");

  const { user } = session.data;
  if (!canEditBlogDraft(user, post)) return err("FORBIDDEN", "Forbidden");
  return ok({ post, user });
}
