import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { buildCacheKey, cachedFetch, CACHE_TTLS } from "@/lib/cache";
import dbConnect from "@/lib/mongodb";
import { parsePagination, paginatedResponse } from "@/lib/pagination";
import { prepareSearchQuery } from "@/lib/search";
import { pageMetadata } from "@/lib/seo";
import { errorToLogMetadata, logger } from "@/lib/utils";
import BlogPost from "@/models/BlogPost";
import BlogExplorer, { type BlogListingData } from "./BlogExplorer";

type SearchParams = { page?: string; tag?: string; search?: string };
type Props = { searchParams: Promise<SearchParams> };

function pageNumber(value?: string) {
  const parsed = Number.parseInt(value ?? "1", 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
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

async function getListing(query: SearchParams): Promise<BlogListingData> {
  const page = pageNumber(query.page);
  const limit = 12;
  const skip = (page - 1) * limit;
  const tag = query.tag?.trim() || null;
  const searchQuery = prepareSearchQuery(query.search ?? null);
  await dbConnect();

  return cachedFetch(
    buildCacheKey("blog:list:v2", {
      page,
      limit,
      tag: tag ?? undefined,
      search: searchQuery?.query,
    }),
    CACHE_TTLS.BLOG,
    async () => {
      const filter: Record<string, unknown> = { status: "published" };
      if (tag) filter.tags = tag;
      if (searchQuery)
        filter.title = { $regex: searchQuery.pattern, $options: "i" };
      const [posts, total, availableTags] = await Promise.all([
        BlogPost.find(filter)
          .select(
            "title slug excerpt coverImage coverFocalPoint authors tags publishedAt updatedAt",
          )
          .sort({ publishedAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        BlogPost.countDocuments(filter),
        BlogPost.distinct("tags", { status: "published" }),
      ]);
      return JSON.parse(
        JSON.stringify({
          ...paginatedResponse(posts, total, page, limit),
          availableTags,
        }),
      ) as BlogListingData;
    },
  );
}

export default async function BlogPage({ searchParams }: Props) {
  const query = await searchParams;
  let initialData: BlogListingData = {
    items: [],
    availableTags: [],
    pagination: {
      page: pageNumber(query.page),
      limit: 12,
      total: 0,
      totalPages: 1,
      hasNext: false,
      hasPrev: false,
    },
  };
  let listingLoaded = false;
  try {
    initialData = await getListing(query);
    listingLoaded = true;
  } catch (error) {
    logger.error("Server-rendered blog listing failed", {
      route: "/blog",
      operation: "list_posts",
      ...errorToLogMetadata(error),
    });
  }
  if (
    listingLoaded &&
    initialData.pagination.page > Math.max(1, initialData.pagination.totalPages)
  ) {
    notFound();
  }
  return <BlogExplorer initialData={initialData} initialQuery={query} />;
}
