import { notFound } from "next/navigation";
import dbConnect from "@/lib/mongodb";
import BlogPost from "@/models/BlogPost";
import MarkdownRenderer from "@/components/blog/MarkdownRenderer";
import TagBadge from "@/components/shared/TagBadge";
import BackLink from "@/components/shared/BackLink";
import CompatibleImage from "@/components/shared/CompatibleImage";
import styles from "./BlogPost.module.scss";
import type { Metadata } from "next";
import JsonLd from "@/components/shared/JsonLd";
import {
  ogImage,
  pageMetadata,
  plainText,
  SITE_NAME,
  SITE_URL,
} from "@/lib/seo";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  await dbConnect();
  const post = await BlogPost.findOne({ slug, status: "published" })
    .select("title slug excerpt content coverImage")
    .lean();
  if (!post) return {};
  const description = plainText(
    post.excerpt || post.content,
    `Read ${post.title} from Coding Club IITG.`,
  );
  return pageMetadata({
    title: post.title,
    description,
    path: `/blog/${post.slug}`,
    image: ogImage(post.title, post.coverImage),
  });
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
    post.authors.map((author: { name: string }) => author.name).join(", ") ||
    SITE_NAME;
  const description = plainText(
    post.excerpt || post.content,
    `Read ${post.title} from Coding Club IITG.`,
  );
  const image = ogImage(post.title, post.coverImage);

  return (
    <article className={styles.article}>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BlogPosting",
          headline: post.title,
          description,
          url: `${SITE_URL}/blog/${post.slug}`,
          image,
          datePublished: post.publishedAt!.toISOString(),
          dateModified: post.updatedAt.toISOString(),
          author: post.authors.map((author: { name: string }) => ({
            "@type": "Person",
            name: author.name,
          })),
          publisher: {
            "@type": "Organization",
            name: SITE_NAME,
            url: SITE_URL,
          },
          keywords: post.tags,
        }}
      />
      <BackLink href="/blog" label="Back to Blog" />

      {post.coverImage && (
        <div className={styles.coverWrapper}>
          <CompatibleImage
            src={post.coverImage}
            alt=""
            className={styles.cover}
            width={1260}
            height={540}
          />
        </div>
      )}

      <header className={styles.header}>
        <h1 className={styles.title}>{post.title}</h1>
        {post.excerpt && <p className={styles.excerpt}>{post.excerpt}</p>}
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
