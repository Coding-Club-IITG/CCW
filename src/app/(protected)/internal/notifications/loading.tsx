import ListSkeleton from "@/components/shared/skeletons/ListSkeleton";

export default function Loading() {
  return (
    <ListSkeleton
      title="Notifications"
      lead="Recent updates from across the club."
    />
  );
}
