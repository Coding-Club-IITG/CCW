import FormSkeleton from "@/components/shared/skeletons/FormSkeleton";

export default function Loading() {
  return (
    <FormSkeleton
      title="Create public event"
      kicker="Administration"
      fields={6}
    />
  );
}
