import { getContestListing } from "@/lib/actions/contests";
import { toContestPresetDto, type ContestPresetDto } from "@/lib/contests/dtos";
import ContestListingClient from "@/components/contests/ContestListingClient";
import { auth } from "@/lib/auth";
import { isHead } from "@/lib/access/roles";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import dbConnect from "@/lib/mongodb";
import ContestPreset from "@/models/ContestPreset";
import { webEnv } from "@/lib/env/web";

export default async function ContestsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/");

  const userRole = session?.user?.access as string | undefined;
  const admin = isHead(userRole);

  const contestsResult = await getContestListing();
  const { active, upcoming, completed } = contestsResult.ok
    ? contestsResult.data
    : { active: [], upcoming: [], completed: [] };

  let presets: ContestPresetDto[] = [];
  if (admin) {
    await dbConnect();
    const presetsJson = await ContestPreset.find({ archived: { $ne: true } })
      .sort({ name: 1 })
      .lean();
    presets = presetsJson.map(toContestPresetDto);
  }

  const deadlineMinutes = webEnv.REGISTRATION_DEADLINE_MINUTES;

  return (
    <ContestListingClient
      active={active}
      upcoming={upcoming}
      completed={completed}
      isHead={admin}
      presets={presets}
      deadlineMinutes={deadlineMinutes}
    />
  );
}
