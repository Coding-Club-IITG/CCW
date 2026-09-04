import { isHead } from "@/lib/access/roles";

export interface BlogAccessUser {
  id: string;
  access?: string;
}

export interface BlogAccessPost {
  status?: string;
  authors: Array<{ userId: unknown }>;
}

export function isBlogAuthor(
  user: BlogAccessUser,
  post: { authors: Array<{ userId: unknown }> },
): boolean {
  return post.authors.some(
    (author) => String(author.userId) === String(user.id),
  );
}

export function canAccessBlogEditor(
  user: BlogAccessUser,
  post: BlogAccessPost,
): boolean {
  if (isHead(user.access)) return true;
  return isBlogAuthor(user, post);
}

/**
 * Checks whether a user has permission to edit a blog post or its revision.
 * Admins can edit any post directly; authors can edit drafts or stage revisions for published posts.
 */
export function canEditBlogDraft(
  user: BlogAccessUser,
  post: BlogAccessPost,
): boolean {
  return canAccessBlogEditor(user, post);
}
