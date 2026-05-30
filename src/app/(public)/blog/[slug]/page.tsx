import { notFound } from "next/navigation";
import dbConnect from "@/lib/mongodb";
import BlogPost from "@/models/BlogPost";
import MarkdownRenderer from "@/components/blog/MarkdownRenderer";
import TagBadge from "@/components/blog/TagBadge";
import BackLink from "@/components/shared/BackLink";
import styles from "./BlogPost.module.scss";

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;

  await dbConnect();
  const post = await BlogPost.findOne({ slug, status: "published" }).lean();

  if (!post) {
    notFound();
  }

  const publishedDate = new Date(post.publishedAt!).toLocaleDateString(
    "en-IN",
    {
      year: "numeric",
      month: "long",
      day: "numeric",
    },
  );

  const updatedDate = new Date(post.updatedAt).toLocaleDateString("en-IN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const wasEdited =
    post.updatedAt.getTime() - post.publishedAt!.getTime() > 60000;

  const authorNames =
    post.authors.map((a: any) => a.name).join(", ") || "Unknown";

  return (
    <article className={styles.article}>
      <BackLink href="/blog" label="Back to Blog" />

      {post.coverImage && (
        <div className={styles.coverWrapper}>
          <img src={post.coverImage} alt="" className={styles.cover} />
        </div>
      )}

      <header className={styles.header}>
        <h1 className={styles.title}>{post.title}</h1>
        <div className={styles.meta}>
          <span className={styles.author}>{authorNames}</span>
          <span className={styles.dot}>·</span>
          <time className={styles.date}>{publishedDate}</time>
          {wasEdited && (
            <>
              <span className={styles.dot}>·</span>
              <span className={styles.edited}>Updated {updatedDate}</span>
            </>
          )}
        </div>
        {post.tags.length > 0 && (
          <div className={styles.tags}>
            {post.tags.map((tag: string) => (
              <TagBadge key={tag} tag={tag} />
            ))}
          </div>
        )}
      </header>

      <div className={styles.content}>
        <MarkdownRenderer content={post.content} />
      </div>
    </article>
  );
}
