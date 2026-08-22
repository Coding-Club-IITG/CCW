import Link from "next/link";
import {
  CalendarDays as IconCalendar,
  PencilLine as IconEdit,
} from "lucide-react";
import FocalImage from "@/components/shared/FocalImage";
import TagBadge from "@/components/shared/TagBadge";
import type { ImageFocalPoint } from "@/lib/imageFocalPoint";
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
  coverFocalPoint?: ImageFocalPoint;
  authors: BlogAuthor[];
  tags: string[];
  publishedAt: string;
  updatedAt?: string;
}

export default function BlogCard({
  slug,
  title,
  excerpt,
  coverImage,
  coverFocalPoint,
  authors,
  tags,
  publishedAt,
  updatedAt,
}: BlogCardProps) {
  const dateOpts: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "Asia/Kolkata",
  };
  const date = new Date(publishedAt).toLocaleDateString("en-IN", dateOpts);
  const editedDate =
    updatedAt && updatedAt !== publishedAt
      ? new Date(updatedAt).toLocaleDateString("en-IN", dateOpts)
      : null;

  const authorNames = authors.map((a) => a.name).join(", ") || "Unknown";

  return (
    <Link href={`/blog/${slug}`} className={styles.card}>
      {coverImage && (
        <div className={styles.coverWrapper}>
          <FocalImage
            src={coverImage}
            focalPoint={coverFocalPoint}
            alt=""
            className={styles.cover}
            width={640}
            height={360}
          />
        </div>
      )}
      <div className={styles.body}>
        <h3 className={styles.title}>{title}</h3>
        <p className={styles.excerpt}>{excerpt}</p>
        <div className={styles.meta}>
          <span className={styles.author}>{authorNames}</span>
          <span className={styles.dot}>·</span>
          <time className={styles.date} dateTime={publishedAt}>
            <IconCalendar width={12} height={12} /> {date}
          </time>
          {editedDate && (
            <>
              <span className={styles.dot}>·</span>
              <time className={styles.date} dateTime={updatedAt}>
                <IconEdit width={12} height={12} /> {editedDate}
              </time>
            </>
          )}
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
