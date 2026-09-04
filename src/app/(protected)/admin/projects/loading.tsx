import TableSkeleton from "@/components/shared/skeletons/TableSkeleton";

export default function Loading() {
  return (
    <TableSkeleton
      title="Project Management"
      lead="Manage showcase projects for the public website."
      columns={4}
    />
  );
}
