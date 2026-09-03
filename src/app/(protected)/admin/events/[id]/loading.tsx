import FormSkeleton from "@/components/shared/skeletons/FormSkeleton";

export default function Loading() {
  return (
    <FormSkeleton
      title="Edit public event"
      kicker="Administration"
      fields={6}
    />
  );
}
