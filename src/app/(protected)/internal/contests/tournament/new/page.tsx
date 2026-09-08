import dbConnect from "@/lib/mongodb";
import ContestPreset from "@/models/ContestPreset";
import { toContestPresetDto } from "@/lib/contests/dtos";
import ContestWizard from "@/components/contests/wizard/ContestWizard";
import { auth } from "@/lib/auth";
import { isHead } from "@/lib/access/roles";
import { headers } from "next/headers";

export const metadata = {
  title: "CCW Admin - New Tournament",
  description: "Create a new knockout tournament",
};

export default async function NewContestPage() {
  await dbConnect();
  const session = await auth.api.getSession({ headers: await headers() });
  const userRole = session?.user?.access as string | undefined;
  const admin = isHead(userRole);

  const presetFilter: any = { archived: { $ne: true } };
  if (!admin) {
    presetFilter.$or = [{ isGlobal: true }, { creatorId: session?.user?.id }];
  }
  const presetsJson = await ContestPreset.find(presetFilter)
    .sort({ name: 1 })
    .lean();

  const presets = presetsJson.map(toContestPresetDto);

  return (
    <div>
      <ContestWizard presets={presets} />
    </div>
  );
}
