import CardGridSkeleton from "@/components/shared/skeletons/CardGridSkeleton";

export default function Loading() {
  return (
    <CardGridSkeleton title="Member Dashboard" kicker="Internal" cards={8} />
  );
}
