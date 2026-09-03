import CardGridSkeleton from "@/components/shared/skeletons/CardGridSkeleton";

export default function SetProblemLoading() {
  return (
    <CardGridSkeleton
      title="Manage Upcoming Problems"
      lead="Schedule up to 10 days in advance."
      kicker="Internal"
      cards={6}
    />
  );
}
