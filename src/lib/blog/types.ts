import type { BlogRevisionSource, BlogStatus } from "@/lib/constants";
import type { ImageFocalPoint } from "@/lib/imageFocalPoint";
import type { PaginationMeta } from "@/lib/pagination";

export interface BlogPerson<Id = string> {
  userId: Id;
  name: string;
}

export interface BlogContent {
  title: string;
  content: string;
  excerpt: string;
  coverImage: string;
  coverFocalPoint: ImageFocalPoint;
  tags: string[];
}

export interface BlogSnapshot extends BlogContent {
  authors: BlogPerson[];
}

export interface EditableBlogPost extends BlogSnapshot {
  slug: string;
  status: BlogStatus;
  updatedAt: string;
  publishedAt?: string | null;
  pendingRevision?:
    | (BlogContent & {
        updatedAt: string;
        submittedAt: string | null;
        submittedBy: string;
      })
    | null;
}

export interface BlogRevisionDto extends BlogSnapshot {
  _id: string;
  postId: string;
  slug: string;
  version: number;
  editor: BlogPerson;
  approvedBy: BlogPerson | null;
  source: BlogRevisionSource;
  restoredFromVersion: number | null;
  changeSummary: string | null;
  createdAt: string;
}

export type BlogRevisionSummaryDto = Omit<BlogRevisionDto, "content">;

export interface BlogRevisionListDto {
  revisions: BlogRevisionSummaryDto[];
  pagination: PaginationMeta;
}
