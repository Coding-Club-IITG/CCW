import FormSkeleton from "@/components/shared/skeletons/FormSkeleton";

export default function EditProjectLoading() {
  return (
    <FormSkeleton title="Edit Project" kicker="Administration" fields={5} />
  );
}
