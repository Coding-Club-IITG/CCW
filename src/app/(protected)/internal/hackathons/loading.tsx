import CardGridSkeleton from "@/components/shared/skeletons/CardGridSkeleton";

export default function HackathonsLoading() {
  return (
    <CardGridSkeleton
      title="Hackathon Finder"
      lead="Find active hackathons and build your team."
      kicker="Internal"
      cards={6}
    />
  );
}
