import TableSkeleton from "@/components/shared/skeletons/TableSkeleton";

export default function Loading() {
  return (
    <TableSkeleton
      title="Blog Management"
      lead="Drafts and published posts."
      columns={4}
    />
  );
}
