import { getContestListing } from "@/lib/actions/contests";
import ContestListingClient from "@/components/contests/ContestListingClient";

export default async function ContestsPage() {
  const { active, upcoming, completed } = await getContestListing();

  return (
    <ContestListingClient
      initialActive={active}
      initialUpcoming={upcoming}
      initialCompleted={completed}
    />
  );
}
