import ListSkeleton from "@/components/shared/skeletons/ListSkeleton";

export default function Loading() {
  return (
    <ListSkeleton
      title="Host Dashboard"
      lead="Manage and launch your assigned Pulse quizzes."
      label="quizzes"
      rows={5}
    />
  );
}
