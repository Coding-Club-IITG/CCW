import CardGridSkeleton from "@/components/shared/skeletons/CardGridSkeleton";

export default function Loading() {
  return (
    <CardGridSkeleton
      title="Manage Upcoming Problems"
      lead="Schedule up to 10 days in advance. Each day can have up to 3 problems (Easy, Medium, Hard). Today's problems can be edited until end of day."
      cards={6}
    />
  );
}
