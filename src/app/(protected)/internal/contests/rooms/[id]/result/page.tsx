import PostMatchResultClient from "@/lib/components/PostMatchResultClient";
import { getContestById } from "@/lib/actions/contests";
import { notFound } from "next/navigation";

export default async function PostMatchResultPage({ params }: { params: { id: string } }) {
  // Await the params object in Next.js 15
  const unwrappedParams = await params;
  const contest = await getContestById(unwrappedParams.id);
  
  if (!contest) {
    notFound();
  }
  
  return <PostMatchResultClient contestId={unwrappedParams.id} />;
}
