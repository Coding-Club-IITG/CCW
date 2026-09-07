import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { TableSkeletonContent } from "@/components/shared/skeletons/TableSkeleton";

export default function Loading() {
  return (
    <>
      <AdminPageHeader
        title="Recruitment"
        lead="Configure Coding Week editions."
      />
      <TableSkeletonContent label="recruitment editions" columns={3} />
    </>
  );
}
