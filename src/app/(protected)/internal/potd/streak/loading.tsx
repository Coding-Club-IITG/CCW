import RankedTableSkeleton from "@/components/shared/skeletons/RankedTableSkeleton";

export default function Loading() {
  return (
    <RankedTableSkeleton
      title="Streak Leaderboard"
      lead="Rankings based on consecutive days of solving the POTD."
    />
  );
}
