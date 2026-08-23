import { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { buildCacheKey, cachedFetch, CACHE_TTLS } from "@/lib/cache";
import { parseSearchParams } from "@/lib/api/result";
import {
  boundaryErrorResponse,
  jsonResult,
  jsonOk,
} from "@/lib/api/result.server";
import { parseAtlasQuery } from "@/lib/atlas/query";
import { searchAtlas, type AtlasSessionUser } from "@/lib/atlas/search.server";

const searchSchema = z.object({
  q: z.string().trim().max(100).default(""),
});

export async function GET(request: NextRequest) {
  const parsed = parseSearchParams(request.nextUrl.searchParams, searchSchema);
  if (!parsed.ok) return jsonResult(parsed);

  try {
    const session = await auth.api.getSession({ headers: request.headers });
    const user = session?.user ? (session.user as AtlasSessionUser) : null;
    const query = parseAtlasQuery(parsed.data.q);
    const data = user
      ? await searchAtlas(query, user)
      : await cachedFetch(
          buildCacheKey("atlas:public", { q: parsed.data.q.toLowerCase() }),
          CACHE_TTLS.ATLAS,
          () => searchAtlas(query, null),
        );
    return jsonOk(data);
  } catch (error) {
    return boundaryErrorResponse("atlas_search", error, request);
  }
}
