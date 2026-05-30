import Link from "next/link";
import TagBadge from "./TagBadge";
import styles from "./BlogCard.module.scss";

interface BlogAuthor {
  userId: string;
  name: string;
}

interface BlogCardProps {
  slug: string;
  title: string;
  excerpt: string;
  coverImage?: string;
  authors: BlogAuthor[];
  tags: string[];
  publishedAt: string;
}

export default function BlogCard({
  slug,
  title,
  excerpt,
  coverImage,
  authors,
  tags,
  publishedAt,
}: BlogCardProps) {
  const date = new Date(publishedAt).toLocaleDateString("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  const authorNames = authors.map((a) => a.name).join(", ") || "Unknown";

  return (
    <Link href={`/blog/${slug}`} className={styles.card}>
      {coverImage && (
        <div className={styles.coverWrapper}>
          <img src={coverImage} alt="" className={styles.cover} />
        </div>
      )}
      <div className={styles.body}>
        <h3 className={styles.title}>{title}</h3>
        <p className={styles.excerpt}>{excerpt}</p>
        <div className={styles.meta}>
          <span className={styles.author}>{authorNames}</span>
          <span className={styles.dot}>·</span>
          <time className={styles.date}>{date}</time>
        </div>
        {tags.length > 0 && (
          <div className={styles.tags}>
            {tags.map((tag) => (
              <TagBadge key={tag} tag={tag} />
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}
