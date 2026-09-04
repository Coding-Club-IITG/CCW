import CardGridSkeleton from "@/components/shared/skeletons/CardGridSkeleton";

export default function Loading() {
  return <CardGridSkeleton title="Member Dashboard" lead cards={8} />;
}
