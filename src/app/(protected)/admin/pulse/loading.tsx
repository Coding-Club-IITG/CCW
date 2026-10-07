import TableSkeleton from "@/components/shared/skeletons/TableSkeleton";

export default function Loading() {
  return (
    <TableSkeleton
      title="Pulse Quizzes"
      lead="Manage interactive quizzes, schedule sessions, and assign hosts."
      label="pulse quizzes"
      columns={6}
      rows={8}
    />
  );
}
