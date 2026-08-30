export interface RelatedPostCandidate {
  _id: string;
  status: string;
  tags: string[];
  publishedAt: string | null;
}

export function rankRelatedPosts<T extends RelatedPostCandidate>(
  posts: T[],
  currentPostId: string,
  currentTags: string[],
  limit = 3,
): T[] {
  const tagSet = new Set(currentTags);

  return posts
    .filter(
      (post) =>
        post._id !== currentPostId &&
        post.status === "published" &&
        post.tags.some((tag) => tagSet.has(tag)),
    )
    .map((post) => ({
      post,
      sharedTagCount: new Set(post.tags.filter((tag) => tagSet.has(tag))).size,
    }))
    .sort(
      (a, b) =>
        b.sharedTagCount - a.sharedTagCount ||
        new Date(b.post.publishedAt ?? 0).getTime() -
          new Date(a.post.publishedAt ?? 0).getTime() ||
        a.post._id.localeCompare(b.post._id),
    )
    .slice(0, Math.max(0, limit))
    .map(({ post }) => post);
}
