import FormSkeleton from "@/components/shared/skeletons/FormSkeleton";

export default function Loading() {
  return <FormSkeleton label="the editor" fields={5} />;
}
