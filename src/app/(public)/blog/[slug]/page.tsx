import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PencilLine as IconEdit } from "lucide-react";

import { isBlogAuthor } from "@/lib/access/blog";
import { isHead } from "@/lib/access/roles";
import { auth } from "@/lib/auth";
import { extractMarkdownHeadings } from "@/lib/blog/markdownHeadings";
import { readingTimeLabel } from "@/lib/blog/readingTime";
import { rankRelatedPosts } from "@/lib/blog/relatedPosts";
import { tagAccent } from "@/lib/constants";
import dbConnect from "@/lib/mongodb";
import {
  ogImage,
  pageMetadata,
  plainText,
  SITE_NAME,
  SITE_URL,
} from "@/lib/seo";
import { formatDate, formatShortDate } from "@/lib/utils";
import BlogPost from "@/models/BlogPost";
import ArticleReader from "@/components/blog/ArticleReader";
import BackLink from "@/components/shared/BackLink";
import CompatibleImage from "@/components/shared/CompatibleImage";
import JsonLd from "@/components/shared/JsonLd";

import styles from "./BlogPost.module.scss";

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
    image: ogImage(post.title, { media: post.coverImage }),
  });
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;

  await dbConnect();
  const post = await BlogPost.findOne({ slug, status: "published" }).lean();

  if (!post) {
    notFound();
  }

  const session = await auth.api.getSession({
    headers: await headers(),
  });
  const user = session?.user;
  const userIsAdmin = user ? isHead(user.access) : false;
  const userIsAuthor = user ? isBlogAuthor(user, post) : false;
  const canEdit = userIsAdmin || userIsAuthor;
  const editHref = userIsAdmin
    ? `/admin/blog/${post.slug}/edit`
    : `/internal/blog/${post.slug}/edit`;

  const relatedDocuments =
    post.tags.length > 0
      ? await BlogPost.find({
          _id: { $ne: post._id },
          status: "published",
          publishedAt: { $ne: null },
          tags: { $in: post.tags },
        })
          .select(
            "title slug excerpt coverImage coverFocalPoint authors tags status publishedAt updatedAt",
          )
          .lean()
      : [];
  const relatedCandidates = relatedDocuments.map((related) => ({
    _id: String(related._id),
    status: related.status,
    slug: related.slug,
    title: related.title,
    excerpt: related.excerpt,
    coverImage: related.coverImage || undefined,
    coverFocalPoint: related.coverFocalPoint
      ? {
          x: related.coverFocalPoint.x,
          y: related.coverFocalPoint.y,
        }
      : undefined,
    authors: related.authors.map(
      (author: { userId: unknown; name: string }) => ({
        userId: String(author.userId),
        name: author.name,
      }),
    ),
    tags: related.tags,
    publishedAt: related.publishedAt!.toISOString(),
    updatedAt: related.updatedAt.toISOString(),
  }));
  const relatedPosts = rankRelatedPosts(
    relatedCandidates,
    String(post._id),
    post.tags,
  );
  const headings = extractMarkdownHeadings(post.content);
  const readingTime = readingTimeLabel(post.content);

  // Chronological neighbours
  const neighbourFields = "title slug tags publishedAt";
  const [previousPost, nextPost] = await Promise.all([
    BlogPost.findOne({
      _id: { $ne: post._id },
      status: "published",
      publishedAt: { $lt: post.publishedAt, $ne: null },
    })
      .select(neighbourFields)
      .sort({ publishedAt: -1 })
      .lean(),
    BlogPost.findOne({
      _id: { $ne: post._id },
      status: "published",
      publishedAt: { $gt: post.publishedAt, $ne: null },
    })
      .select(neighbourFields)
      .sort({ publishedAt: 1 })
      .lean(),
  ]);

  const publishedDate = formatDate(post.publishedAt!);
  const updatedDate = formatDate(post.updatedAt);

  const wasEdited =
    post.updatedAt.getTime() - post.publishedAt!.getTime() > 60000;

  const authorNames =
    post.authors.map((author: { name: string }) => author.name).join(", ") ||
    SITE_NAME;
  const description = plainText(
    post.excerpt || post.content,
    `Read ${post.title} from Coding Club IITG.`,
  );
  const image = ogImage(post.title, { media: post.coverImage });

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
      <div className={styles.lead}>
        <BackLink href="/blog" label="All posts" />

        <header className={styles.header}>
          {post.tags.length > 0 && (
            <p className={styles.tagLine}>
              {post.tags.map((tag: string) => (
                <span
                  key={tag}
                  style={{ "--accent": tagAccent(tag) } as React.CSSProperties}
                >
                  {tag}
                </span>
              ))}
            </p>
          )}
          <h1 className={styles.title}>{post.title}</h1>
          {post.excerpt && <p className={styles.excerpt}>{post.excerpt}</p>}
          <div className={styles.meta}>
            <span className={styles.author}>{authorNames}</span>
            <time dateTime={post.publishedAt!.toISOString()}>
              {publishedDate}
            </time>
            {readingTime && <span>{readingTime}</span>}
            {wasEdited && (
              <span className={styles.edited}>Updated {updatedDate}</span>
            )}
            {canEdit && (
              <Link href={editHref} className={styles.editLink}>
                <IconEdit width={13} height={13} />
                Edit Article
              </Link>
            )}
          </div>
        </header>

        {post.coverImage && (
          <div className={styles.coverWrapper}>
            <CompatibleImage
              src={post.coverImage}
              alt=""
              className={styles.cover}
              width={0}
              height={0}
              style={{ width: "100%", height: "auto" }}
              sizes="(max-width: 1360px) 100vw, 1260px"
              priority
            />
          </div>
        )}
      </div>

      <ArticleReader content={post.content} headings={headings} />

      <nav className={styles.neighbours} aria-label="More articles">
        {previousPost ? (
          <Link
            href={`/blog/${previousPost.slug}`}
            className={styles.neighbour}
          >
            <span className={styles.neighbourPrevLabel}>← Previous</span>
            <span className={styles.neighbourTitle}>{previousPost.title}</span>
            <span className={styles.neighbourMeta}>
              {previousPost.tags?.[0] ?? "Writing"}
            </span>
          </Link>
        ) : (
          <div className={`${styles.neighbour} ${styles.neighbourStub}`}>
            <span className={styles.neighbourStubLabel}>Start of the run</span>
            <span className={styles.neighbourTitle}>
              Nothing before this one
            </span>
          </div>
        )}

        {nextPost ? (
          <Link
            href={`/blog/${nextPost.slug}`}
            className={`${styles.neighbour} ${styles.neighbourNext}`}
          >
            <span className={styles.neighbourNextLabel}>Next →</span>
            <span className={styles.neighbourTitle}>{nextPost.title}</span>
            <span className={styles.neighbourMeta}>
              {nextPost.tags?.[0] ?? "Writing"}
            </span>
          </Link>
        ) : (
          <div
            className={`${styles.neighbour} ${styles.neighbourNext} ${styles.neighbourStub}`}
          >
            <span className={styles.neighbourStubLabel}>End of the run</span>
            <span className={styles.neighbourTitle}>
              Nothing after this one
            </span>
          </div>
        )}
      </nav>

      {relatedPosts.length > 0 && (
        <section
          className={styles.related}
          aria-labelledby="related-posts-title"
        >
          <h2 id="related-posts-title" className={styles.relatedHeading}>
            Keep reading
          </h2>
          <div className={styles.relatedGrid}>
            {relatedPosts.map((related) => (
              <Link
                key={related._id}
                href={`/blog/${related.slug}`}
                className={styles.relatedCard}
                style={
                  {
                    "--accent": tagAccent(related.tags[0] ?? ""),
                  } as React.CSSProperties
                }
              >
                {related.tags[0] && (
                  <span className={styles.relatedTag}>{related.tags[0]}</span>
                )}
                <span className={styles.relatedTitle}>{related.title}</span>
                <span className={styles.relatedMeta}>
                  {formatShortDate(related.publishedAt)}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </article>
  );
}
