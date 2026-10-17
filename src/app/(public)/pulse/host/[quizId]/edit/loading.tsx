import CardGridSkeleton from "@/components/shared/skeletons/CardGridSkeleton";

export default function Loading() {
  return (
    <CardGridSkeleton
      title="Deck Editor"
      lead="Loading the deck and starting your editing session…"
      cards={3}
    />
  );
}
