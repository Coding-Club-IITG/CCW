import { NextRequest } from "next/server";
import { jsonError, jsonOk, jsonResult } from "@/lib/api/result.server";
import { getBracketSnapshot } from "@/lib/bracket";
import { auth } from "@/lib/auth";
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
    const snapshot = await getBracketSnapshot(id);
    return jsonOk(snapshot);
  } catch (err) {
    return jsonError("INTERNAL_ERROR", "Failed to fetch bracket snapshot");
  }
}
