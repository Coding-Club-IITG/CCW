import type { Metadata } from "next";
import type { SortOrder } from "mongoose";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buildCacheKey, cachedFetch, CACHE_TTLS } from "@/lib/cache";
import { readingTimeLabel } from "@/lib/blog/readingTime";
import { tagAccent } from "@/lib/constants";
import type { ImageFocalPoint } from "@/lib/imageFocalPoint";
import dbConnect from "@/lib/mongodb";
import { paginatedResponse } from "@/lib/pagination";
import { prepareSearchQuery } from "@/lib/search";
import { pageMetadata } from "@/lib/seo";
import { errorToLogMetadata, formatShortDate, logger } from "@/lib/utils";
import {
  blogPageNumber as pageNumber,
  blogSort as sortValue,
  POSTS_PER_PAGE,
  type BlogQuery,
} from "@/lib/blog/listing";
import BlogPost from "@/models/BlogPost";
import FocalImage from "@/components/shared/FocalImage";
import Pagination from "@/components/shared/Pagination";
import EmptyState from "@/components/shared/EmptyState";
import PageHeader from "@/components/public/PageHeader";
import BlogFilters from "./BlogFilters";
import styles from "./Blog.module.scss";

type SearchParams = BlogQuery;
type Props = { searchParams: Promise<SearchParams> };

type ListedPost = {
  _id: string;
  slug: string;
  title: string;
  excerpt: string;
  coverImage?: string;
  coverFocalPoint?: ImageFocalPoint;
  authors: { userId: string; name: string }[];
  tags: string[];
  publishedAt: string;
  updatedAt?: string;
  readingTime: string;
};

type Listing = {
  items: ListedPost[];
  availableTags: string[];
  pagination: { page: number; total: number; totalPages: number };
};

function updatedLabel(post: ListedPost) {
  if (!post.updatedAt || !post.publishedAt) return null;
  const delta =
    new Date(post.updatedAt).getTime() - new Date(post.publishedAt).getTime();
  return delta > 60_000 ? `Updated ${formatShortDate(post.updatedAt)}` : null;
}

function authorNames(post: ListedPost) {
  return post.authors.map((author) => author.name).join(", ") || "Coding Club";
}

export async function generateMetadata({
  searchParams,
}: Props): Promise<Metadata> {
  const query = await searchParams;
  const page = pageNumber(query.page);
  const filtered = Boolean(query.tag?.trim() || query.search?.trim());
  const path = !filtered && page > 1 ? `/blog?page=${page}` : "/blog";
  return pageMetadata({
    title: page > 1 && !filtered ? `Blog - Page ${page}` : "Blog",
    description:
      "Insights, tutorials, and updates from the Coding Club IITG community.",
    path,
    robots: filtered ? { index: false, follow: true } : undefined,
  });
}

async function getListing(query: SearchParams): Promise<Listing> {
  const page = pageNumber(query.page);
  const sort = sortValue(query.sort);
  const tag = query.tag?.trim() || null;
  const searchQuery = prepareSearchQuery(query.search ?? null);
  const skip = (page - 1) * POSTS_PER_PAGE;
  await dbConnect();

  return cachedFetch(
    buildCacheKey("blog:list:v3", {
      page,
      limit: POSTS_PER_PAGE,
      sort,
      tag: tag ?? undefined,
      search: searchQuery?.query,
    }),
    CACHE_TTLS.BLOG,
    async () => {
      const filter: Record<string, unknown> = { status: "published" };
      if (tag) filter.tags = tag;
      if (searchQuery) {
        const pattern = { $regex: searchQuery.pattern, $options: "i" };
        filter.$or = [
          { title: pattern },
          { excerpt: pattern },
          { tags: pattern },
          { "authors.name": pattern },
        ];
      }

      const order: Record<string, SortOrder> =
        sort === "updated" ? { updatedAt: -1 } : { publishedAt: -1 };
      const [posts, total, availableTags] = await Promise.all([
        BlogPost.find(filter)
          .select(
            "title slug excerpt coverImage coverFocalPoint authors tags publishedAt updatedAt content",
          )
          .sort(order)
          .skip(skip)
          .limit(POSTS_PER_PAGE)
          .lean(),
        BlogPost.countDocuments(filter),
        BlogPost.distinct("tags", { status: "published" }),
      ]);

      const items = posts.map((post) => {
        const { content, ...rest } = post as typeof post & { content?: string };
        return { ...rest, readingTime: readingTimeLabel(content ?? "") };
      });

      const paginated = paginatedResponse(items, total, page, POSTS_PER_PAGE);
      return JSON.parse(
        JSON.stringify({
          items: paginated.items,
          availableTags: [...availableTags].sort(),
          pagination: {
            page,
            total,
            totalPages: paginated.pagination.totalPages,
          },
        }),
      ) as Listing;
    },
  );
}

export default async function BlogPage({ searchParams }: Props) {
  const query = await searchParams;
  const page = pageNumber(query.page);

  let listing: Listing = {
    items: [],
    availableTags: [],
    pagination: { page, total: 0, totalPages: 1 },
  };
  let loaded = false;
  try {
    listing = await getListing(query);
    loaded = true;
  } catch (error) {
    logger.error("Server-rendered blog listing failed", {
      route: "/blog",
      operation: "list_posts",
      ...errorToLogMetadata(error),
    });
  }

  if (loaded && page > Math.max(1, listing.pagination.totalPages)) notFound();

  const showFeature = page === 1 && listing.items.length > 0;
  const featured = showFeature ? listing.items[0] : null;
  const rows = showFeature ? listing.items.slice(1) : listing.items;

  const first =
    listing.pagination.total === 0 ? 0 : (page - 1) * POSTS_PER_PAGE + 1;
  const last = Math.min(listing.pagination.total, page * POSTS_PER_PAGE);

  const paginationParams: Record<string, string> = {};
  if (query.tag?.trim()) paginationParams.tag = query.tag.trim();
  if (query.search?.trim()) paginationParams.search = query.search.trim();
  if (sortValue(query.sort) !== "published") paginationParams.sort = "updated";

  const countLabel = `${listing.pagination.total} ${
    listing.pagination.total === 1 ? "post" : "posts"
  } published`;

  return (
    <div className={styles.page}>
      <PageHeader
        kicker={countLabel}
        title="Writing"
        glow="sky"
        lead="Articles, tutorials, project write-ups and notes from all the modules."
      />

      <BlogFilters
        availableTags={listing.availableTags}
        activeTag={query.tag?.trim() ?? ""}
        search={query.search?.trim() ?? ""}
        sort={sortValue(query.sort)}
        query={query}
      />

      {featured && (
        <Link
          href={`/blog/${featured.slug}`}
          className={styles.featured}
          style={
            {
              "--accent": tagAccent(featured.tags[0] ?? ""),
            } as React.CSSProperties
          }
        >
          <div className={styles.featuredMedia}>
            {featured.coverImage && (
              <FocalImage
                src={featured.coverImage}
                focalPoint={featured.coverFocalPoint}
                alt=""
                width={760}
                height={475}
                sizes="(max-width: 900px) 100vw, 50vw"
                priority
                className={styles.featuredImage}
              />
            )}
          </div>
          <div className={styles.featuredBody}>
            <p className={styles.featuredKicker}>
              <span className={styles.latest}>Latest</span>
              {featured.tags[0] && (
                <span className={styles.tag}>{featured.tags.join(" / ")}</span>
              )}
            </p>
            <h2 className={styles.featuredTitle}>{featured.title}</h2>
            <p className={styles.featuredExcerpt}>{featured.excerpt}</p>
            <p className={styles.featuredMeta}>
              <span className={styles.authors}>{authorNames(featured)}</span>
              <span>{formatShortDate(featured.publishedAt)}</span>
              {featured.readingTime && <span>{featured.readingTime}</span>}
              {updatedLabel(featured) && (
                <span className={styles.updatedChip}>
                  {updatedLabel(featured)}
                </span>
              )}
            </p>
          </div>
        </Link>
      )}

      <div className={styles.list}>
        {rows.map((post) => (
          <Link
            key={post._id}
            href={`/blog/${post.slug}`}
            className={styles.row}
            style={
              {
                "--accent": tagAccent(post.tags[0] ?? ""),
              } as React.CSSProperties
            }
          >
            <div className={styles.rowMedia}>
              {post.coverImage && (
                <FocalImage
                  src={post.coverImage}
                  focalPoint={post.coverFocalPoint}
                  alt=""
                  width={320}
                  height={200}
                  sizes="110px"
                  loading="lazy"
                  className={styles.rowImage}
                />
              )}
            </div>
            <div className={styles.rowHeading}>
              <h3 className={styles.rowTitle}>{post.title}</h3>
              {post.tags[0] && (
                <p className={styles.rowTag}>{post.tags.join(" / ")}</p>
              )}
            </div>
            <p className={styles.rowExcerpt}>{post.excerpt}</p>
            <div className={styles.rowMeta}>
              <span className={styles.authors}>{authorNames(post)}</span>
              <span>{formatShortDate(post.publishedAt)}</span>
              {updatedLabel(post) && (
                <span className={styles.updatedLine}>{updatedLabel(post)}</span>
              )}
              {post.readingTime && <span>{post.readingTime}</span>}
            </div>
          </Link>
        ))}

        {listing.items.length === 0 && (
          <EmptyState
            title="Nothing matches"
            hint="Try another tag, or clear the search."
          />
        )}
      </div>

      {listing.pagination.totalPages > 1 && (
        <div className={styles.paginationWrap}>
          <Pagination
            page={page}
            totalPages={listing.pagination.totalPages}
            hrefBase="/blog"
            hrefParams={paginationParams}
            keyboard
            ariaLabel="Blog pagination"
            rangeLabel={`showing ${first}–${last} of ${listing.pagination.total} · page ${page} / ${listing.pagination.totalPages}`}
          />
        </div>
      )}
    </div>
  );
}
