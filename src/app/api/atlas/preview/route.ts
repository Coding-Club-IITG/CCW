import { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { parseSearchParams } from "@/lib/api/result";
import {
  boundaryErrorResponse,
  jsonError,
  jsonOk,
  jsonResult,
} from "@/lib/api/result.server";
import { parseAtlasQuery } from "@/lib/atlas/query";
import { searchAtlas, type AtlasSessionUser } from "@/lib/atlas/search.server";
import { ATLAS_RESULT_KINDS, type AtlasRelation } from "@/lib/atlas/types";
import dbConnect from "@/lib/mongodb";
import CalendarEvent from "@/models/CalendarEvent";
import Event from "@/models/Event";

const previewSchema = z.object({
  id: z.string().trim().min(1).max(200),
  kind: z.enum(ATLAS_RESULT_KINDS),
  title: z.string().trim().min(1).max(200),
  module: z.string().trim().max(100).optional(),
  tags: z.string().trim().max(500).optional(),
  date: z.string().datetime().optional(),
});

export async function GET(request: NextRequest) {
  const parsed = parseSearchParams(request.nextUrl.searchParams, previewSchema);
  if (!parsed.ok) return jsonResult(parsed);

  try {
    const session = await auth.api.getSession({ headers: request.headers });
    const user = session?.user ? (session.user as AtlasSessionUser) : null;
    const lookup = await searchAtlas(
      parseAtlasQuery(
        `type:${parsed.data.kind} "${parsed.data.title.replace(/["']/g, " ")}"`,
      ),
      user,
    );
    const item = lookup.items.find(
      (candidate) =>
        candidate.id === parsed.data.id && candidate.kind === parsed.data.kind,
    );
    if (!item) return jsonError("NOT_FOUND", "Result not found.");

    const relationQueries: Array<{ query: string; basis: string }> = [];
    if (parsed.data.module)
      relationQueries.push({
        query: `module:"${parsed.data.module}"`,
        basis: `Shared module · ${parsed.data.module}`,
      });
    const firstTag = parsed.data.tags?.split(",").find(Boolean);
    if (firstTag)
      relationQueries.push({
        query: `tag:"${firstTag}"`,
        basis: `Shared tag · ${firstTag}`,
      });
    if (parsed.data.date) {
      const selected = new Date(parsed.data.date);
      const before = new Date(selected.getTime() + 45 * 86_400_000)
        .toISOString()
        .slice(0, 10);
      const after = new Date(selected.getTime() - 45 * 86_400_000)
        .toISOString()
        .slice(0, 10);
      relationQueries.push({
        query: `after:${after} before:${before}`,
        basis: "Activity within 45 days",
      });
    }

    const related = await Promise.all(
      relationQueries.map(async ({ query, basis }) => ({
        basis,
        result: await searchAtlas(parseAtlasQuery(query), user),
      })),
    );
    const seen = new Set([`${item.kind}:${item.id}`]);
    const relations: AtlasRelation[] = [];
    if (item.kind === "event" && user) {
      await dbConnect();
      const event = await Event.findById(item.id)
        .select("calendarEventId")
        .lean();
      if (event?.calendarEventId) {
        const calendar = await CalendarEvent.findById(event.calendarEventId)
          .select("title")
          .lean();
        if (calendar) {
          const calendarId = String(calendar._id);
          relations.push({
            id: calendarId,
            kind: "calendar",
            title: calendar.title,
            href: `/internal/calendar/${calendarId}`,
            basis: "Linked calendar record",
            inferred: false,
          });
          seen.add(`calendar:${calendarId}`);
        }
      }
    }
    for (const group of related) {
      for (const candidate of group.result.items) {
        const key = `${candidate.kind}:${candidate.id}`;
        if (seen.has(key) || !candidate.href) continue;
        seen.add(key);
        relations.push({
          id: candidate.id,
          kind: candidate.kind,
          title: candidate.title,
          href: candidate.href,
          basis: group.basis,
          inferred: true,
        });
        if (relations.length === 6) break;
      }
      if (relations.length === 6) break;
    }
    return jsonOk({ item, relations });
  } catch (error) {
    return boundaryErrorResponse("atlas_preview", error, request);
  }
}
