import { z } from "zod";
import { parseSearchParams } from "@/lib/api/result";
import { jsonError, jsonOk, jsonResult } from "@/lib/api/result.server";
import { webEnv } from "@/lib/env/web";
import dbConnect from "@/lib/mongodb";
import User from "@/models/User";

const querySchema = z.object({ query: z.string().trim().max(80).default("") });

export async function GET(request: Request) {
  if (!webEnv.DEV_AUTH_ENABLED) return jsonError("NOT_FOUND", "Not found");
  const parsed = parseSearchParams(
    new URL(request.url).searchParams,
    querySchema,
  );
  if (!parsed.ok) return jsonResult(parsed);
  await dbConnect();
  const escaped = parsed.data.query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const filter = escaped
    ? {
        $or: [
          { name: { $regex: escaped, $options: "i" } },
          { email: { $regex: escaped, $options: "i" } },
        ],
      }
    : {};
  const users = await User.find(filter)
    .select("name image")
    .sort({ name: 1 })
    .limit(12)
    .lean();
  return jsonOk(
    users.map((user) => ({
      id: user._id.toString(),
      name: user.name || "Unnamed user",
      image: user.image || null,
    })),
  );
}
