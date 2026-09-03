import RankedTableSkeleton from "@/components/shared/skeletons/RankedTableSkeleton";

export default function Loading() {
  return (
    <RankedTableSkeleton
      title="POTD Leaderboard"
      lead="Rankings based on Problem of the Day performance."
    />
  );
}
