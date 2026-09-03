import TableSkeleton from "@/components/shared/skeletons/TableSkeleton";

export default function AdminProjectsLoading() {
  return (
    <TableSkeleton
      title="Project Management"
      lead="Projects listed on the public site."
      kicker="Administration"
      columns={4}
    />
  );
}
