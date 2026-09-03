import TableSkeleton from "@/components/shared/skeletons/TableSkeleton";

export default function Loading() {
  return (
    <TableSkeleton
      title="Past Problems"
      lead="Previous daily challenges and your submissions."
      columns={5}
    />
  );
}
