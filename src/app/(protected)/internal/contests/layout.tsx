import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isAdmin, parseModuleRoles } from "@/lib/roles";

export default async function ContestsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect("/");
  }

  const user = session.user as any;
  const admin = isAdmin(user.role);
  
  const moduleRoles = parseModuleRoles(user.moduleRoles);
  const isSoftwareDev = moduleRoles.some((mr) => mr.module === "Software Development");
  
  // Only allow access to admins or users in the Software Development module
  if (!admin && !isSoftwareDev) {
    redirect("/internal/dashboard");
  }

  return <>{children}</>;
}
