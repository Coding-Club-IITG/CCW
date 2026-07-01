import { getContestById } from "@/lib/actions/contests";
import BlitzRoomClient from "@/lib/components/BlitzRoomClient";
import { notFound } from "next/navigation";

export default async function ContestRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const contest = await getContestById(id);

  if (!contest) {
    notFound();
  }

  // Only Blitz room is implemented currently
  if (contest.mode !== "blitz") {
    notFound();
  }

  return <BlitzRoomClient contest={contest} />;
}
