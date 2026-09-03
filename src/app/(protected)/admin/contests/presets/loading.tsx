import TableSkeleton from "@/components/shared/skeletons/TableSkeleton";

export default function Loading() {
  return (
    <TableSkeleton
      title="Contest Presets"
      lead="Manage reusable match settings and problem selections."
      kicker="Administration"
      columns={6}
    />
  );
}
