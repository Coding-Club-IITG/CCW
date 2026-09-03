import ListSkeleton from "@/components/shared/skeletons/ListSkeleton";

export default function AuditLogLoading() {
  return (
    <ListSkeleton
      title="Audit Log"
      lead="Privileged changes from the last six months."
      kicker="Administration"
    />
  );
}
