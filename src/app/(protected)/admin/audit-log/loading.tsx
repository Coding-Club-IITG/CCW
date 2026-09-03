import ListSkeleton from "@/components/shared/skeletons/ListSkeleton";

export default function Loading() {
  return (
    <ListSkeleton
      title="Audit Log"
      lead="Privileged changes from the last six months."
    />
  );
}
