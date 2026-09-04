import TableSkeleton from "@/components/shared/skeletons/TableSkeleton";

export default function Loading() {
  return (
    <TableSkeleton
      title="Hackathon Management"
      lead="Create and monitor hackathons for club members."
      columns={4}
    />
  );
}
