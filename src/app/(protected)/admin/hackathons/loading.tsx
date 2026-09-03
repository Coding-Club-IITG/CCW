import TableSkeleton from "@/components/shared/skeletons/TableSkeleton";

export default function Loading() {
  return (
    <TableSkeleton
      title="Hackathon Management"
      lead="Hackathons and team requests."
      kicker="Administration"
      columns={4}
    />
  );
}
