import { isAdmin } from "@/lib/roles";

interface BlogAccessUser {
  id: string;
  role?: string;
}

interface BlogAccessPost {
  status: string;
  authors: Array<{ userId: unknown }>;
}

export function canEditBlogDraft(
  user: BlogAccessUser,
  post: BlogAccessPost,
): boolean {
  if (isAdmin(user.role)) return true;
  if (post.status !== "draft") return false;

  return post.authors.some(
    (author) => String(author.userId) === String(user.id),
  );
}
