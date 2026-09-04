import RankedTableSkeleton from "@/components/shared/skeletons/RankedTableSkeleton";

export default function Loading() {
  return (
    <RankedTableSkeleton
      title="Codeforces Leaderboard"
      lead="Current member standings."
    />
  );
}
