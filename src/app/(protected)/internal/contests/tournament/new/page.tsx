import { headers } from "next/headers";

import { connectMongoDB } from "@/lib/db/mongodb";
import { toContestPresetDto } from "@/lib/contests/dtos";
import { auth } from "@/lib/auth/server";
import { isHead } from "@/lib/access/roles";

import ContestPreset from "@/models/ContestPreset";

import ContestWizard from "@/components/contests/wizard/ContestWizard";

export default async function NewContestPage() {
  await connectMongoDB();
  const session = await auth.api.getSession({ headers: await headers() });
  const userRole = session?.user?.access as string | undefined;
  const admin = isHead(userRole);

  const presetFilter = {
    archived: { $ne: true },
    ...(!admin
      ? { $or: [{ isGlobal: true }, { creatorId: session?.user?.id }] }
      : {}),
  };
  const presetsJson = await ContestPreset.find(presetFilter)
    .sort({ name: 1 })
    .lean();

  const presets = presetsJson.map(toContestPresetDto);

  return <ContestWizard presets={presets} />;
}
