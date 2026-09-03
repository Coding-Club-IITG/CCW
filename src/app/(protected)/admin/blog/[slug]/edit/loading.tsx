import FormSkeleton from "@/components/shared/skeletons/FormSkeleton";

export default function EditBlogPostLoading() {
  return (
    <FormSkeleton
      title="Edit Blog Post"
      lead="Loading the editor and post details."
      kicker="Administration"
      fields={5}
    />
  );
}
