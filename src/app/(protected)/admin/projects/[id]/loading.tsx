import FormSkeleton from "@/components/shared/skeletons/FormSkeleton";

export default function Loading() {
  return (
    <FormSkeleton title="Edit Project" kicker="Administration" fields={5} />
  );
}
