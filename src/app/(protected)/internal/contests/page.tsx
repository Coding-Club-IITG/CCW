import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getContestListing } from "@/lib/actions/contests";
import { toContestPresetDto, type ContestPresetDto } from "@/lib/contests/dtos";
import { auth } from "@/lib/auth/server";
import { isHead } from "@/lib/access/roles";
import { connectMongoDB } from "@/lib/db/mongodb";
import { contestRegistrationTiming } from "@/lib/contests/registrationTiming";
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

  await connectMongoDB();

  const presetFilter = {
    archived: { $ne: true },
    ...(!admin
      ? { $or: [{ isGlobal: true }, { creatorId: session.user.id }] }
      : {}),
  };

  const presetsJson = await ContestPreset.find(presetFilter)
    .sort({ name: 1 })
    .lean();
  const presets: ContestPresetDto[] = presetsJson.map(toContestPresetDto);

  return (
    <ContestListingClient
      active={active}
      upcoming={upcoming}
      completed={completed}
      isHead={admin}
      presets={presets}
      registrationTiming={contestRegistrationTiming(webEnv)}
    />
  );
}
