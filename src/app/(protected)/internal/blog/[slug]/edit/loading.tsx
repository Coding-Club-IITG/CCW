import FormSkeleton from "@/components/shared/skeletons/FormSkeleton";

export default function EditBlogLoading() {
  return (
    <FormSkeleton
      title="Edit Blog Post"
      lead="Loading the editor and post details."
      kicker="Internal"
      fields={5}
    />
  );
}
