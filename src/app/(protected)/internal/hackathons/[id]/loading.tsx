import ListSkeleton from "@/components/shared/skeletons/ListSkeleton";

export default function HackathonDetailLoading() {
  return (
    <ListSkeleton
      title="Hackathon Details"
      lead="Loading teams, requests, and member details."
      kicker="Internal"
    />
  );
}
