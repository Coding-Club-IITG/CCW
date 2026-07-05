import { getContestListing } from "@/lib/actions/contests";
import ContestListingClient from "@/lib/components/ContestListingClient";
import { auth } from "@/lib/auth";
import { isAdmin, parseModuleRoles } from "@/lib/roles";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import dbConnect from "@/lib/mongodb";
import ContestPreset from "@/models/ContestPreset";

export default async function ContestsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/");

  const userRole = session?.user?.role as string | undefined;
  const admin = isAdmin(userRole);
  
  const moduleRoles = parseModuleRoles((session.user as any)?.moduleRoles);
  const isSoftwareDev = moduleRoles.some((mr) => mr.module === "Software Development");
  
  if (!admin && !isSoftwareDev) {
    redirect("/internal/dashboard");
  }

  const { active, upcoming, completed } = await getContestListing();

  let presets = [];
  if (admin) {
    await dbConnect();
    const presetsJson = await ContestPreset.find({ archived: { $ne: true } })
      .sort({ name: 1 })
      .lean();
    presets = presetsJson.map((preset: any) => {
      const doc = { ...preset };
      if (doc._id) doc._id = doc._id.toString();
      if (doc.createdAt) doc.createdAt = doc.createdAt.toISOString();
      if (doc.updatedAt) doc.updatedAt = doc.updatedAt.toISOString();
      // Stringify sub-object IDs if needed, but the main error is _id and dates.
      return doc;
    });
  }

  const deadlineMinutesStr = process.env.REGISTRATION_DEADLINE_MINUTES || "1";
  const deadlineMinutes = parseInt(deadlineMinutesStr, 10);

  return (
    <ContestListingClient 
      active={active} 
      upcoming={upcoming} 
      completed={completed} 
      isAdmin={admin}
      presets={presets}
      deadlineMinutes={deadlineMinutes}
    />
  );
}
