import FormSkeleton from "@/components/shared/skeletons/FormSkeleton";

export default function Loading() {
  return (
    <FormSkeleton
      title="Hackathon Management"
      kicker="Administration"
      fields={5}
    />
  );
}
