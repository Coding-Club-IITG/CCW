import { getContestListing } from "@/lib/actions/contests";
import ContestListingClient from "@/lib/components/ContestListingClient";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/roles";
import { headers } from "next/headers";
import dbConnect from "@/lib/mongodb";
import ContestPreset from "@/models/ContestPreset";

export default async function ContestsPage() {
  const { active, upcoming, completed } = await getContestListing();
  const session = await auth.api.getSession({ headers: await headers() });
  const userRole = session?.user?.role as string | undefined;
  const admin = isAdmin(userRole);

  let presets = [];
  if (admin) {
    await dbConnect();
    const presetsJson = await ContestPreset.find({ archived: { $ne: true } })
      .sort({ name: 1 })
      .lean();
    presets = JSON.parse(JSON.stringify(presetsJson));
  }

  return (
    <ContestListingClient 
      active={active} 
      upcoming={upcoming} 
      completed={completed} 
      isAdmin={admin}
      presets={presets}
    />
  );
}
