import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { processWalkover } from "@/lib/bracket";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const { id: roomId } = resolvedParams;

    const isDev = process.env.NODE_ENV === "development";
    const testUserId = request.headers.get("x-test-user-id");
    let admin: any = null;
    if (!isDev || !testUserId) {
      admin = await requireAdmin(request);
      if (!admin) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const body = await request.json();
    const { winnerTeamId, note } = body;

    if (!winnerTeamId || !note) {
      return NextResponse.json(
        { error: "winnerTeamId and note are required" },
        { status: 400 }
      );
    }

    const adminUserId = admin?._id?.toString() || "dev-bypass";
    const snapshot = await processWalkover(roomId, winnerTeamId, note, adminUserId);
    return NextResponse.json({ success: true, bracket: snapshot });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Internal Server Error" },
      { status: 400 }
    );
  }
}
