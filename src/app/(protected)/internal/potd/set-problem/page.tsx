import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth/server";
import { isElevated } from "@/lib/access/roles";

import SetProblemClient from "./SetProblemClient";

export default async function SetProblemPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  const user = session?.user;
  if (!user || !isElevated(user.access)) {
    redirect("/internal/potd");
  }

  return <SetProblemClient />;
}
