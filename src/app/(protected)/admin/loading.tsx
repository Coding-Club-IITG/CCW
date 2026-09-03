import CardGridSkeleton from "@/components/shared/skeletons/CardGridSkeleton";

export default function Loading() {
  return (
    <CardGridSkeleton
      title="CCW Administration"
      lead="Manage website settings."
      cards={8}
    />
  );
}
