import { getContestById } from "@/lib/actions/contests";
import BlitzRoomClient from "@/lib/components/BlitzRoomClient";
import ArenaRoomClient from "@/lib/components/ArenaRoomClient";
import BracketRoomClient from "@/lib/components/BracketRoomClient";
import { notFound } from "next/navigation";

export default async function ContestRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const contest = await getContestById(id);

  if (!contest) {
    notFound();
  }

  if (contest.mode === "blitz") {
    return <BlitzRoomClient contest={contest} />;
  }

  if (contest.format === "bracket" || contest.mode === "knockout") {
    return <BracketRoomClient contest={contest} />;
  }

  if (contest.mode === "arena") {
    return <ArenaRoomClient contest={contest} />;
  }

  // Other formats are not fully implemented yet
  notFound();
}
