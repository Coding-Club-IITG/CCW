import TableSkeleton from "@/components/shared/skeletons/TableSkeleton";

export default function Loading() {
  return (
    <TableSkeleton
      title="User Management"
      lead="Access levels, roles and tenure."
      columns={6}
    />
  );
}
