import CardGridSkeleton from "@/components/shared/skeletons/CardGridSkeleton";

export default function Loading() {
  return (
    <CardGridSkeleton
      title="Quiz Details"
      lead="Manage quiz parameters, participants, and co-hosts."
      cards={3}
    />
  );
}
