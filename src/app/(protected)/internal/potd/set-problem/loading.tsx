import CardGridSkeleton from "@/components/shared/skeletons/CardGridSkeleton";

export default function Loading() {
  return (
    <CardGridSkeleton
      title="Manage Upcoming Problems"
      lead="Schedule up to 10 days in advance."
      cards={6}
    />
  );
}
