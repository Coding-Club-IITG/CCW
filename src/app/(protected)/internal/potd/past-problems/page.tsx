import PastProblemsClient from "./PastProblemsClient";
import { getPastProblems } from "@/lib/actions/potd";

export default async function PastProblemsPage() {
  const result = await getPastProblems(1, 30);

  return <PastProblemsClient initialPastProblems={result.data ?? []} />;
}
