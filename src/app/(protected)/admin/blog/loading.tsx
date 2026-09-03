import TableSkeleton from "@/components/shared/skeletons/TableSkeleton";

export default function AdminBlogLoading() {
  return (
    <TableSkeleton
      title="Blog Management"
      lead="Drafts and published posts."
      kicker="Administration"
      columns={4}
    />
  );
}
