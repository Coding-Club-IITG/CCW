import { headers } from "next/headers";

import { auth } from "@/lib/auth/server";
import { canUploadFiles } from "@/lib/access/files";
import { getHeadModules, isAdmin, isHead } from "@/lib/access/roles";
import { parseManagedModules, parseRoles } from "@/lib/users/roles";
import { getDisplayName } from "@/lib/users/identity";

import FilesClient from "@/components/files/FilesClient";
import type { CurrentUser } from "@/components/files/types";

export default async function FilesPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  // Session is guaranteed by the proxy middleware
  const user = session!.user;
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
