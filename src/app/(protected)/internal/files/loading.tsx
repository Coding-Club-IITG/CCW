import TableSkeleton from "@/components/shared/skeletons/TableSkeleton";

export default function Loading() {
  return (
    <TableSkeleton
      title="Internal Files"
      lead="Shared resources, documentation, and module-specific files."
      kicker="Internal"
      columns={7}
    />
  );
}
