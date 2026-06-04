import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import SolveClient from "./SolveClient";

type Props = {
  searchParams: Promise<{
    platform?: string;
    contestId?: string;
    problemIndex?: string;
    title?: string;
    challengeId?: string;
  }>;
};

export default async function SolvePage({ searchParams }: Props) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/");

  const params = await searchParams;
  const { platform, contestId, problemIndex, title, challengeId } = params;

  return (
    <SolveClient
      platform={platform}
      contestId={contestId}
      problemIndex={problemIndex}
      title={title}
      challengeId={challengeId}
    />
  );
}
