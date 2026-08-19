import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { canSetPOTD } from "@/lib/access/potd";
import { parseRoles } from "@/lib/roles";
import { redirect } from "next/navigation";
import SetProblemClient from "./SetProblemClient";

export default async function SetProblemPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  const user = session?.user as any;
  if (!user || !canSetPOTD(user.access, parseRoles(user.roles))) {
    redirect("/internal/potd");
  }

  return <SetProblemClient />;
}
