import CardGridSkeleton from "@/components/shared/skeletons/CardGridSkeleton";

export default function Loading() {
  return (
    <CardGridSkeleton
      title="Hackathon Finder"
      lead="Find active hackathons and build your dream team."
      cards={6}
    />
  );
}
