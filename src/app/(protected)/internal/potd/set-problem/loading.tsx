import FormSkeleton from "@/components/shared/skeletons/FormSkeleton";

export default function Loading() {
  return (
    <FormSkeleton
      title="Manage Upcoming Problems"
      lead="Schedule up to 10 days in advance."
      kicker="Internal"
      fields={4}
    />
  );
}
