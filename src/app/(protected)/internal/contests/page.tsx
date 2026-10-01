import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getContestListing } from "@/lib/actions/contests";
import { toContestPresetDto, type ContestPresetDto } from "@/lib/contests/dtos";
import { auth } from "@/lib/auth/server";
import { isHead } from "@/lib/access/roles";
import { connectMongoDB } from "@/lib/db/mongodb";
import { webEnv } from "@/lib/env/web";

import ContestPreset from "@/models/ContestPreset";

import ContestListingClient from "@/components/contests/ContestListingClient";

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
    await connectMongoDB();
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
