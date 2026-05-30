import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import FilesClient from "@/components/files/FilesClient";
import { canUploadFiles } from "@/lib/fileAccess";
import {
  parseModuleRoles,
  getHeadModules,
  isGlobalAdmin,
  isAdmin,
} from "@/lib/roles";
import { getDisplayName } from "@/lib/utils";
import type { CurrentUser } from "@/components/files/types";

export default async function FilesPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  // Session is guaranteed by the proxy middleware
  const user = session!.user as any;
  const moduleRoles = parseModuleRoles(user.moduleRoles);

  const currentUser: CurrentUser = {
    id: user.id,
    name: getDisplayName(user.name, user.pizza_count),
    email: user.email,
    role: user.role,
    moduleRoles,
    canUpload: canUploadFiles(user.role),
    isGlobalAdmin: isGlobalAdmin(user.role),
    isAdmin: isAdmin(user.role),
    headModules: getHeadModules(user.role, moduleRoles),
  };

  return <FilesClient currentUser={currentUser} />;
}
