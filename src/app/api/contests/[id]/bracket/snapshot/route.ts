import { NextRequest, NextResponse } from "next/server";
import { getBracketSnapshot } from "@/lib/bracket";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  try {
    const snapshot = await getBracketSnapshot(id);
    return NextResponse.json(snapshot);
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to fetch bracket snapshot" },
      { status: 500 },
    );
  }
}
