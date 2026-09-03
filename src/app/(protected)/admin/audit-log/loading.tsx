import TableSkeleton from "@/components/shared/skeletons/TableSkeleton";

export default function Loading() {
  return (
    <TableSkeleton
      title="Audit Log"
      lead="Privileged changes from the last six months."
      kicker="Administration"
      columns={3}
    />
  );
}
