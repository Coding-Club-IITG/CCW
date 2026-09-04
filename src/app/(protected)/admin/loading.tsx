import CardGridSkeleton from "@/components/shared/skeletons/CardGridSkeleton";

export default function Loading() {
  return (
    <CardGridSkeleton
      title="CCW Administration"
      lead="Manage the Coding Club website."
      cards={8}
    />
  );
}
