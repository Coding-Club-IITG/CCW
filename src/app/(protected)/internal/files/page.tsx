import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import FilesClient from "@/components/files/FilesClient";
import { canUploadFiles } from "@/lib/access/files";
import { getHeadModules, isAdmin, isHead } from "@/lib/access/roles";
import { parseManagedModules, parseRoles } from "@/lib/roles";
import { getDisplayName } from "@/lib/utils";
import type { CurrentUser } from "@/components/files/types";

export default async function FilesPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  // Session is guaranteed by the proxy middleware
  const user = session!.user as any;
  const managedModules = parseManagedModules(user.managedModules);
  const roles = parseRoles(user.roles);

  const currentUser: CurrentUser = {
    id: user.id,
    name: getDisplayName(user.name, user.pizza_count),
    email: user.email,
    access: user.access,
    managedModules,
    roles,
    canUpload: canUploadFiles(user.access),
    isAdmin: isAdmin(user.access),
    isHead: isHead(user.access),
    headModules: getHeadModules(user.access, managedModules),
  };

  return <FilesClient currentUser={currentUser} />;
}
