import FormSkeleton from "@/components/shared/skeletons/FormSkeleton";

export default function Loading() {
  return (
    <FormSkeleton title="Create Project" kicker="Administration" fields={5} />
  );
}
