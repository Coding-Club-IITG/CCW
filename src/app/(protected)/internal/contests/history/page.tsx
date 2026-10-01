import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getContestListing } from "@/lib/actions/contests";
import { auth } from "@/lib/auth/server";
import { isHead } from "@/lib/access/roles";

import MatchHistoryClient from "@/components/contests/MatchHistoryClient";

export default async function MatchHistoryPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/");

  const userRole = session?.user?.access as string | undefined;
  const admin = isHead(userRole);

  const result = await getContestListing();
  const completed = result.ok ? result.data.completed : [];

  return <MatchHistoryClient history={completed} />;
}
