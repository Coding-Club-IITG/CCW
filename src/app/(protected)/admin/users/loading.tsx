import TableSkeleton from "@/components/shared/skeletons/TableSkeleton";

export default function Loading() {
  return (
    <TableSkeleton
      title="User Management"
      lead="Manage members, assign roles, and configure module permissions."
      columns={6}
    />
  );
}
