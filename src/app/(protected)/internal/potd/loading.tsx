import CardGridSkeleton from "@/components/shared/skeletons/CardGridSkeleton";

export default function Loading() {
  return (
    <CardGridSkeleton
      title="Daily Challenge"
      lead="Today's problems across three difficulties."
      kicker="Internal"
      cards={3}
    />
  );
}
