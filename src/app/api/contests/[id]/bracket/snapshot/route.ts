import { NextRequest } from "next/server";

import {
  boundaryErrorResponse,
  jsonError,
  jsonOk,
  jsonResult,
} from "@/lib/api/result.server";
import { authorizeContestView } from "@/lib/access/contests";
import { getBracketSnapshot } from "@/lib/contests/bracket";
import { auth } from "@/lib/auth/server";
import { parseRouteParams } from "@/lib/api/result";
import { contestIdParamsSchema } from "@/lib/api/schemas/contestRoute";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) {
    return jsonError("UNAUTHENTICATED", "Unauthorized");
  }

  const validatedParams = parseRouteParams(await params, contestIdParamsSchema);
  if (!validatedParams.ok) return jsonResult(validatedParams);
  const { id } = validatedParams.data;
  try {
    const access = await authorizeContestView(id, session.user);
    if (!access.ok) return jsonResult(access);
    const snapshot = await getBracketSnapshot(id);
    return jsonOk(snapshot);
  } catch (error) {
    return boundaryErrorResponse(
      "GET /api/contests/[id]/bracket/snapshot",
      error,
      request,
    );
  }
}
