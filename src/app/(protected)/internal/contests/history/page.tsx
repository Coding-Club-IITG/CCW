import { getContestListing } from "@/lib/actions/contests";
import MatchHistoryClient from "@/components/contests/MatchHistoryClient";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isAdmin, parseModuleRoles } from "@/lib/roles";

export default async function MatchHistoryPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/");

  const userRole = session?.user?.role as string | undefined;
  const admin = isAdmin(userRole);
  
  const moduleRoles = parseModuleRoles((session.user as any)?.moduleRoles);
  const isSoftwareDev = moduleRoles.some((mr) => mr.module === "Software Development");
  
  if (!admin && !isSoftwareDev) {
    redirect("/internal/dashboard");
  }

  const { completed } = await getContestListing();
  
  return <MatchHistoryClient history={completed} />;
}
