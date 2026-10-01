import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth/server";
import { isHead } from "@/lib/access/roles";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session || !isHead(session.user.access)) {
    redirect("/internal/dashboard");
  }

  return <>{children}</>;
}
