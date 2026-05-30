import { notFound } from "next/navigation";
import dbConnect from "@/lib/mongodb";
import BlogPost from "@/models/BlogPost";
import MarkdownRenderer from "@/components/blog/MarkdownRenderer";
import TagBadge from "@/components/blog/TagBadge";
import type { BlogTag } from "@/lib/constants";
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

  const date = new Date(post.publishedAt!).toLocaleDateString("en-IN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <article className={styles.article}>
      {post.coverImage && (
        <div className={styles.coverWrapper}>
          <img src={post.coverImage} alt="" className={styles.cover} />
        </div>
      )}

      <header className={styles.header}>
        <h1 className={styles.title}>{post.title}</h1>
        <div className={styles.meta}>
          <span className={styles.author}>{post.authorName}</span>
          <span className={styles.dot}>·</span>
          <time className={styles.date}>{date}</time>
        </div>
        {post.tags.length > 0 && (
          <div className={styles.tags}>
            {post.tags.map((tag: BlogTag) => (
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
