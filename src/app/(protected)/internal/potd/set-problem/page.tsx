import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth/server";
import { canSetPOTD } from "@/lib/access/potd";
import { parseRoles } from "@/lib/users/roles";

import SetProblemClient from "./SetProblemClient";

export default async function SetProblemPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  const user = session?.user;
  if (!user || !canSetPOTD(user.access, parseRoles(user.roles))) {
    redirect("/internal/potd");
  }

  return <SetProblemClient />;
}
