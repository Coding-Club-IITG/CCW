import FormSkeleton from "@/components/shared/skeletons/FormSkeleton";

export default function Loading() {
  return (
    <FormSkeleton
      title="Your Profile"
      lead="Update your personal details and platform IDs."
      fields={5}
    />
  );
}
