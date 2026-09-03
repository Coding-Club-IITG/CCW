import FormSkeleton from "@/components/shared/skeletons/FormSkeleton";

export default function Loading() {
  return (
    <FormSkeleton title="Edit calendar event" kicker="Internal" fields={6} />
  );
}
