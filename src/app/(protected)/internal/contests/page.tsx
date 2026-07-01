import { getContestListing } from "@/lib/actions/contests";
import ContestListingClient from "@/lib/components/ContestListingClient";

export default async function ContestsPage() {
  const { active, upcoming, completed } = await getContestListing();

  return (
    <ContestListingClient 
      active={active} 
      upcoming={upcoming} 
      completed={completed} 
    />
  );
}
