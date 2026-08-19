import { isHead } from "@/lib/access/roles";

interface BlogAccessUser {
  id: string;
  access?: string;
}

interface BlogAccessPost {
  status: string;
  authors: Array<{ userId: unknown }>;
}

export function canEditBlogDraft(
  user: BlogAccessUser,
  post: BlogAccessPost,
): boolean {
  if (isHead(user.access)) return true;
  if (post.status !== "draft") return false;

  return post.authors.some(
    (author) => String(author.userId) === String(user.id),
  );
}
