import CardGridSkeleton from "@/components/shared/skeletons/CardGridSkeleton";

export default function Loading() {
  return (
    <CardGridSkeleton
      title="Quiz Management"
      lead="Loading quiz details and co-host assignments…"
      cards={3}
    />
  );
}
