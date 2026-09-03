import ListSkeleton from "@/components/shared/skeletons/ListSkeleton";

export default function NotificationsLoading() {
  return (
    <ListSkeleton
      title="Notifications"
      lead="Recent updates from across the club."
      kicker="Internal"
    />
  );
}
