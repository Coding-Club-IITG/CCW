import TableSkeleton from "@/components/shared/skeletons/TableSkeleton";

export default function Loading() {
  return (
    <TableSkeleton
      title="Public Events"
      lead="Manage club events linked to the calendar."
      columns={4}
    />
  );
}
