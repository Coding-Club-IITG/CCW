import TableSkeleton from "@/components/shared/skeletons/TableSkeleton";

export default function Loading() {
  return (
    <TableSkeleton
      title="Public Events"
      lead="Events listed on the public site."
      columns={4}
    />
  );
}
