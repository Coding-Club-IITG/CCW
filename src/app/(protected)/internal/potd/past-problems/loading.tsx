import TableSkeleton from "@/components/shared/skeletons/TableSkeleton";

export default function Loading() {
  return (
    <TableSkeleton
      title="Past Problems"
      lead="A history of all previous Problems of the Day."
      columns={5}
    />
  );
}
