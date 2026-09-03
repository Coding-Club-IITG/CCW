import TableSkeleton from "@/components/shared/skeletons/TableSkeleton";

export default function Loading() {
  return (
    <TableSkeleton
      title="Project Management"
      lead="Projects listed on the public site."
      columns={4}
    />
  );
}
