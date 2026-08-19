import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSolveChallenge } from "@/lib/actions/potd";

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
  let { platform, contestId, problemIndex, title, challengeId } = params;
  let content = null;

  if (challengeId) {
    const result = await getSolveChallenge(challengeId);
    if (!result.ok) redirect("/internal/potd");
    ({ platform, contestId, problemIndex, title, challengeId, content } =
      result.data);
  }

  return (
    <SolveClient
      platform={platform}
      contestId={contestId}
      problemIndex={problemIndex}
      title={title}
      challengeId={challengeId}
      content={content}
    />
  );
}
