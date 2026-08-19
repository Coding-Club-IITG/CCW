import PastProblemsClient from "./PastProblemsClient";
import { getPastProblems } from "@/lib/actions/potd";

export default async function PastProblemsPage() {
  const result = await getPastProblems(1, 30);
  const data = result.ok ? result.data : { items: [], total: 0 };

  return (
    <PastProblemsClient
      initialPastProblems={data.items ?? []}
      initialTotal={data.total ?? 0}
    />
  );
}
