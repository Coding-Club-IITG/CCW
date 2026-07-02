import PostMatchResultClient from "@/lib/components/PostMatchResultClient";
import { getContestById } from "@/lib/actions/contests";
import { notFound } from "next/navigation";

export default async function PostMatchResultPage({ 
  params,
  searchParams,
}: { 
  params: { id: string },
  searchParams: { from?: string }
}) {
  const unwrappedParams = await params;
  const unwrappedSearch = await searchParams;
  const contest = await getContestById(unwrappedParams.id);
  
  if (!contest) {
    notFound();
  }
  
  return <PostMatchResultClient contestId={unwrappedParams.id} from={unwrappedSearch?.from} />;
}
