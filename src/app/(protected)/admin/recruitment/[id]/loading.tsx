import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { FormSkeletonContent } from "@/components/shared/skeletons/FormSkeleton";

export default function Loading() {
  return (
    <>
      <AdminPageHeader
        title="Configure recruitment"
        lead="Add dates and documents whenever they are ready."
      />
      <FormSkeletonContent label="recruitment edition" fields={8} />
    </>
  );
}
