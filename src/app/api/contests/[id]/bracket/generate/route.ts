import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { generateBracket, getBracketSnapshot } from "@/lib/bracket";
import { errorToLogMetadata, logger } from "@/lib/utils";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const resolvedParams = await params;
    const { id } = resolvedParams;

    const isDev = process.env.NODE_ENV === "development";
    const testUserId = request.headers.get("x-test-user-id");
    if (!isDev || !testUserId) {
      const admin = await requireAdmin(request);
      if (!admin) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const snapshot = await generateBracket(id);
    return NextResponse.json({ success: true, bracket: snapshot });
  } catch (error) {
    logger.error("Contest bracket generation failed", {
      route: "POST /api/contests/[id]/bracket/generate",
      operation: "generate_bracket",
      ...errorToLogMetadata(error),
    });
    return NextResponse.json(
      { error: "Unable to generate the contest bracket." },
      { status: 400 },
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const resolvedParams = await params;
    const { id } = resolvedParams;
    const snapshot = await getBracketSnapshot(id);
    return NextResponse.json(snapshot);
  } catch (error) {
    logger.error("Contest bracket lookup failed", {
      route: "GET /api/contests/[id]/bracket/generate",
      operation: "get_bracket",
      ...errorToLogMetadata(error),
    });
    return NextResponse.json(
      { error: "Contest bracket not found." },
      { status: 404 },
    );
  }
}
