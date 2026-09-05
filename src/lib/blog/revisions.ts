import { type ClientSession, Types } from "mongoose";

import { err, ok, parseSearchParams, type AppResult } from "@/lib/api/result";
import type { BlogRevisionSource } from "@/lib/constants";
import { parseImageFocalPoint } from "@/lib/imageFocalPoint";
import {
  paginatedResponse,
  parsePagination,
  type PaginationParams,
} from "@/lib/pagination";
import type { IBlogPost } from "@/models/BlogPost";
import BlogPostRevision, {
  type IBlogPostRevision,
} from "@/models/BlogPostRevision";

import { blogRevisionQuerySchema } from "./schemas";
import type {
  BlogContent,
  BlogPerson,
  BlogRevisionDto,
  BlogRevisionListDto,
  BlogRevisionSummaryDto,
} from "./types";

type Id = Types.ObjectId | string;
type SnapshotInput = Pick<BlogContent, "title"> &
  Partial<Omit<BlogContent, "title">> & {
    authors?: BlogPerson<Id>[];
    publishedAt?: Date | null;
    createdAt?: Date;
  };

export interface RecordRevisionParams {
  post: SnapshotInput & { _id: Id; slug: string };
  editor: BlogPerson<Id>;
  approvedBy?: BlogPerson<Id> | null;
  source: BlogRevisionSource;
  changeSummary?: string | null;
  restoredFromVersion?: number | null;
  preEditState?: SnapshotInput | null;
}

type RevisionRecord = SnapshotInput &
  Pick<
    RecordRevisionParams,
    "editor" | "approvedBy" | "source" | "restoredFromVersion" | "changeSummary"
  > & {
    _id: Id;
    postId: Id;
    slug: string;
    version: number;
    createdAt: Date;
  };

function serializePerson(person: BlogPerson<Id>): BlogPerson {
  return { userId: String(person.userId), name: person.name };
}

function snapshotMetadata(post: Omit<SnapshotInput, "content">) {
  return {
    title: post.title,
    excerpt: post.excerpt || "",
    coverImage: post.coverImage || "",
    coverFocalPoint: parseImageFocalPoint(post.coverFocalPoint),
    tags: post.tags || [],
    authors: (post.authors || []).map(serializePerson),
  };
}

function snapshotFields(post: SnapshotInput) {
  return { ...snapshotMetadata(post), content: post.content || "" };
}

export function hasBlogSnapshotChanges(
  before: SnapshotInput,
  after: SnapshotInput,
): boolean {
  return (
    JSON.stringify(snapshotFields(before)) !==
    JSON.stringify(snapshotFields(after))
  );
}

export function serializeRevisionSummary(
  rev: Omit<RevisionRecord, "content">,
): BlogRevisionSummaryDto {
  return {
    ...snapshotMetadata(rev),
    _id: String(rev._id),
    postId: String(rev.postId),
    slug: rev.slug,
    version: rev.version,
    editor: serializePerson(rev.editor),
    approvedBy: rev.approvedBy ? serializePerson(rev.approvedBy) : null,
    source: rev.source,
    restoredFromVersion: rev.restoredFromVersion ?? null,
    changeSummary: rev.changeSummary ?? null,
    createdAt: rev.createdAt.toISOString(),
  };
}

export function serializeRevision(rev: RevisionRecord): BlogRevisionDto {
  return { ...serializeRevisionSummary(rev), content: rev.content || "" };
}

/** Record a snapshot with the same transaction as its published post mutation */
export async function recordRevisionSnapshot(
  session: ClientSession,
  {
    post,
    editor,
    approvedBy,
    source,
    changeSummary,
    restoredFromVersion,
    preEditState,
  }: RecordRevisionParams,
): Promise<IBlogPostRevision> {
  const postId = new Types.ObjectId(post._id);
  const latest = await BlogPostRevision.findOne({ postId })
    .select("version")
    .sort({ version: -1 })
    .session(session)
    .lean();
  let nextVersion = latest ? latest.version + 1 : 1;

  if (!latest && source !== "initial_publish" && preEditState) {
    const baseAuthor = preEditState.authors?.[0] || post.authors?.[0] || editor;
    await BlogPostRevision.create(
      [
        {
          ...snapshotFields({
            ...preEditState,
            authors: preEditState.authors || post.authors,
          }),
          postId,
          slug: post.slug,
          version: 1,
          editor: serializePerson(baseAuthor),
          approvedBy: null,
          source: "initial_publish",
          restoredFromVersion: null,
          changeSummary: "Initial published version",
          createdAt:
            preEditState.publishedAt ||
            preEditState.createdAt ||
            post.publishedAt ||
            post.createdAt ||
            new Date(),
        },
      ],
      { session },
    );
    nextVersion = 2;
  }

  const [created] = await BlogPostRevision.create(
    [
      {
        ...snapshotFields(post),
        postId,
        slug: post.slug,
        version: nextVersion,
        editor: serializePerson(editor),
        approvedBy: approvedBy ? serializePerson(approvedBy) : null,
        source,
        restoredFromVersion: restoredFromVersion ?? null,
        changeSummary: changeSummary ?? null,
        createdAt: new Date(),
      },
    ],
    { session },
  );
  return created;
}

function legacyRevision(post: IBlogPost): RevisionRecord {
  return {
    ...snapshotFields(post),
    _id: String(post._id),
    postId: String(post._id),
    slug: post.slug,
    version: 1,
    editor: post.authors[0] || { userId: "", name: "Author" },
    source: "initial_publish",
    changeSummary: "Initial published version",
    createdAt: post.publishedAt || post.createdAt,
  };
}

/** Paginate metadata without reading Markdown bodies */
export async function getPostRevisionSummaries(
  post: IBlogPost,
  { page, limit, skip }: PaginationParams,
): Promise<BlogRevisionListDto> {
  const filter = { postId: post._id };
  const [revisions, count] = await Promise.all([
    BlogPostRevision.find(filter)
      .select("-content")
      .sort({ version: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    BlogPostRevision.countDocuments(filter),
  ]);
  const legacy =
    count === 0 && Boolean(post.publishedAt || post.status === "published");
  const summaries =
    legacy && page === 1
      ? [serializeRevisionSummary(legacyRevision(post))]
      : revisions.map(serializeRevisionSummary);
  const { items, pagination } = paginatedResponse(
    summaries,
    legacy ? 1 : count,
    page,
    limit,
  );
  return { revisions: items, pagination };
}

export async function getPostRevisionByVersion(
  post: IBlogPost,
  version: number,
): Promise<BlogRevisionDto | null> {
  const rev = await BlogPostRevision.findOne({
    postId: post._id,
    version,
  }).lean();
  if (rev) return serializeRevision(rev);
  if (
    version === 1 &&
    Boolean(post.publishedAt || post.status === "published") &&
    !(await BlogPostRevision.exists({ postId: post._id }))
  ) {
    return serializeRevision(legacyRevision(post));
  }
  return null;
}

export async function readPostRevisions(
  post: IBlogPost,
  searchParams: URLSearchParams,
): Promise<AppResult<BlogRevisionListDto | { revision: BlogRevisionDto }>> {
  const query = parseSearchParams(searchParams, blogRevisionQuerySchema);
  if (!query.ok) return query;
  if (query.data.version !== undefined) {
    const revision = await getPostRevisionByVersion(post, query.data.version);
    return revision
      ? ok({ revision })
      : err("NOT_FOUND", "Revision not found.");
  }
  return ok(
    await getPostRevisionSummaries(post, parsePagination(searchParams)),
  );
}
