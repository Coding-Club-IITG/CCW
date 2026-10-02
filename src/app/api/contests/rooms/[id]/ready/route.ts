import { NextRequest } from "next/server";

import { parseRouteParams } from "@/lib/api/result";
import {
  boundaryErrorResponse,
  jsonError,
  jsonResult,
} from "@/lib/api/result.server";
import { contestIdParamsSchema } from "@/lib/api/schemas/contestRoute";
import { auth } from "@/lib/auth/server";
import { readyOrEnterRoom } from "@/lib/contests/participation";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth.api.getSession({ headers: req.headers });

    if (!session?.user) {
      return jsonError("UNAUTHENTICATED", "Authentication required.");
    }

    const parsed = parseRouteParams(await params, contestIdParamsSchema);

    if (!parsed.ok) {
      return jsonResult(parsed);
    }

    return jsonResult(await readyOrEnterRoom(parsed.data.id, session.user.id));
  } catch (error) {
    return boundaryErrorResponse("ready_or_enter", error, req);
  }
}
