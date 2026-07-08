import { getContestListing } from "@/lib/actions/contests";
import ContestListingClient from "@/components/contests/ContestListingClient";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/roles";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import dbConnect from "@/lib/mongodb";
import ContestPreset from "@/models/ContestPreset";

export default async function ContestsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/");

  const userRole = session?.user?.role as string | undefined;
  const admin = isAdmin(userRole);


  const { active, upcoming, completed } = await getContestListing();

  let presets = [];
  if (admin) {
    await dbConnect();
    const presetsJson = await ContestPreset.find({ archived: { $ne: true } })
      .sort({ name: 1 })
      .lean();
    presets = JSON.parse(JSON.stringify(presetsJson));
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
