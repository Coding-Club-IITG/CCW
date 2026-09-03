import FormSkeleton from "@/components/shared/skeletons/FormSkeleton";

export default function Loading() {
  return (
    <FormSkeleton
      title="Your Profile"
      lead="Edit your display name, bio, and linked platform handles."
      fields={5}
    />
  );
}
