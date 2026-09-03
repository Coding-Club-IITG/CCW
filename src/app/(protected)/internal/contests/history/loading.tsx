import RankedTableSkeleton from "@/components/shared/skeletons/RankedTableSkeleton";

export default function Loading() {
  return (
    <RankedTableSkeleton
      title="Match History"
      lead="Review your recent algorithmic battles and performance metrics."
      kicker="Internal"
    />
  );
}
