import TableSkeleton from "@/components/shared/skeletons/TableSkeleton";

export default function AdminEventsLoading() {
  return (
    <TableSkeleton
      title="Public Events"
      lead="Events listed on the public site."
      kicker="Administration"
      columns={4}
    />
  );
}
