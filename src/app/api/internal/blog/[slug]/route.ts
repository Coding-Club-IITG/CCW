import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canEditBlogDraft } from "@/lib/blogAccess";
import { invalidateCache } from "@/lib/cache";
import dbConnect from "@/lib/mongodb";
import { errorToLogMetadata, logger } from "@/lib/utils";
import BlogPost from "@/models/BlogPost";
import { parseImageFocalPoint } from "@/lib/imageFocalPoint";

type RouteContext = { params: Promise<{ slug: string }> };

async function getAuthorizedDraft(request: NextRequest, slug: string) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return { error: "Unauthorized", status: 401 } as const;

  await dbConnect();
  const post = await BlogPost.findOne({ slug });
  if (!post) return { error: "Post not found.", status: 404 } as const;

  const user = session.user as any;
  if (!canEditBlogDraft(user, post)) {
    return { error: "Forbidden", status: 403 } as const;
  }

  return { post } as const;
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { slug } = await context.params;
    const result = await getAuthorizedDraft(request, slug);
    if ("error" in result) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status },
      );
    }

    return NextResponse.json({ post: result.post.toObject() });
  } catch (err) {
    logger.error("Internal blog lookup failed", {
      route: "GET /api/internal/blog/[slug]",
      operation: "get_draft",
      ...errorToLogMetadata(err),
    });
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { slug } = await context.params;
    const result = await getAuthorizedDraft(request, slug);
    if ("error" in result) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status },
      );
    }

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body." },
        { status: 400 },
      );
    }

    const post = result.post;

    if (body.title !== undefined) {
      const title = String(body.title).trim();
      if (!title || title.length > 200) {
        return NextResponse.json(
          { error: "Title must be 1-200 characters." },
          { status: 400 },
        );
      }
      post.title = title;
    }

    if (body.content !== undefined) {
      post.content = String(body.content);
    }

    if (body.excerpt !== undefined) {
      const excerpt = String(body.excerpt).trim();
      if (excerpt.length > 500) {
        return NextResponse.json(
          { error: "Excerpt must be 500 characters or fewer." },
          { status: 400 },
        );
      }
      post.excerpt = excerpt;
    }

    if (body.coverImage !== undefined) {
      post.coverImage = String(body.coverImage);
    }

    if (body.coverFocalPoint !== undefined) {
      post.coverFocalPoint = parseImageFocalPoint(body.coverFocalPoint);
    }

    if (body.tags !== undefined && Array.isArray(body.tags)) {
      post.tags = body.tags
        .filter(
          (tag): tag is string =>
            typeof tag === "string" &&
            tag.trim().length > 0 &&
            tag.trim().length <= 50,
        )
        .map((tag) => tag.trim());
    }

    await post.save();
    await invalidateCache("blog");
    await invalidateCache("admin:blog");

    return NextResponse.json({ post: post.toObject() });
  } catch (err) {
    logger.error("Internal blog update failed", {
      route: "PATCH /api/internal/blog/[slug]",
      operation: "update_draft",
      ...errorToLogMetadata(err),
    });
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 },
    );
  }
}
