import RankedTableSkeleton from "@/components/shared/skeletons/RankedTableSkeleton";

export default function Loading() {
  return (
    <RankedTableSkeleton
      title="Streak Leaderboard"
      lead="Longest running daily solve streaks."
      kicker="Internal"
    />
  );
}
