import { getContestListing } from "@/lib/actions/contests";
import MatchHistoryClient from "@/lib/components/MatchHistoryClient";

export default async function MatchHistoryPage() {
  const { completed } = await getContestListing();
  
  return <MatchHistoryClient history={completed} />;
}
