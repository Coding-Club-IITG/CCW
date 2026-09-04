import TableSkeleton from "@/components/shared/skeletons/TableSkeleton";

export default function Loading() {
  return (
    <TableSkeleton
      title="Blog Management"
      lead="Create, edit, and manage blog posts."
      columns={4}
    />
  );
}
