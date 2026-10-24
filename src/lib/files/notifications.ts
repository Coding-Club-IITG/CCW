import type { ClientSession } from "mongoose";

import {
  canAccessFile,
  hasFileGrant,
  type AccessibleFile,
} from "@/lib/access/files";
import { canManageSharingGroup } from "@/lib/access/sharingGroups";
import { notifyBatch, notifyMany } from "@/lib/notifications/service";
import { getDisplayName } from "@/lib/users/identity";
import { parseRoles } from "@/lib/users/roles";

import FileEntry from "@/models/FileEntry";
import SharingGroup from "@/models/SharingGroup";
import User from "@/models/User";

interface Actor {
  id: string;
  name?: string | null;
  pizza_count?: number;
}

interface GroupAudience {
  memberIds: readonly unknown[];
  managerIds: readonly unknown[];
}

function actorName(actor: Actor) {
  return getDisplayName(actor.name || "A club member", actor.pizza_count);
}

async function loadRecipients(
  ids: string[] | undefined,
  session: ClientSession,
) {
  const users = await User.find(ids ? { _id: { $in: ids } } : {})
    .select("_id access roles")
    .session(session)
    .lean();
  if (!users.length) return [];
  const userIds = users.map((user) => user._id);
  const groups = await SharingGroup.find({
    $or: [{ memberIds: { $in: userIds } }, { managerIds: { $in: userIds } }],
  })
    .select("memberIds managerIds")
    .session(session)
    .lean();
  const memberships = new Map<string, string[]>();
  for (const group of groups) {
    for (const memberId of group.memberIds) {
      const id = String(memberId);
      const groupIds = memberships.get(id) ?? [];
      groupIds.push(String(group._id));
      memberships.set(id, groupIds);
    }
  }
  return users.map((user) => ({
    id: String(user._id),
    access: user.access,
    roles: parseRoles(user.roles),
    groupIds: memberships.get(String(user._id)) ?? [],
    managedGroupIds: groups
      .filter((group) =>
        canManageSharingGroup(String(user._id), user.access ?? "Member", group),
      )
      .map((group) => String(group._id)),
  }));
}

/** Persist with the file mutation */
export async function notifyFileShared(
  file: AccessibleFile & { title: string },
  previous: AccessibleFile["accessControl"] | null,
  actor: Actor,
  session: ClientSession,
): Promise<string[]> {
  const acl = file.accessControl;
  const broad =
    acl.allMembers ||
    acl.allowedModules.length > 0 ||
    acl.allowedClubPositions.length > 0 ||
    acl.allowedModulePositions.length > 0;
  let candidates: string[] | undefined;
  if (!broad) {
    const groups = await SharingGroup.find({
      _id: { $in: acl.allowedGroups ?? [] },
    })
      .select("memberIds managerIds")
      .session(session)
      .lean();
    candidates = [
      ...new Set([
        ...acl.allowedUsers.map(String),
        ...groups.flatMap((group) => group.memberIds.map(String)),
        ...groups.flatMap((group) => group.managerIds.map(String)),
      ]),
    ];
    if (!candidates.length) return [];
  }
  const recipients = await loadRecipients(candidates, session);
  const newlyShared = recipients.filter(
    (user) =>
      user.id !== actor.id &&
      hasFileGrant(user.id, user.roles, acl, [
        ...user.groupIds,
        ...user.managedGroupIds,
      ]) &&
      (!previous ||
        !canAccessFile(
          user.id,
          user.access,
          user.roles,
          { ...file, accessControl: previous },
          user.groupIds,
          user.managedGroupIds,
        )),
  );
  const created = await notifyMany(
    newlyShared.map((user) => user.id),
    {
      type: "file_shared",
      title: "File shared with you",
      message: `${actorName(actor)} shared “${file.title}” with you.`,
      link: "/internal/files",
    },
    { session },
  );
  return created.map((notification) => String(notification._id));
}

/** Joining a group produces one summary per person */
export async function notifyGroupFileAccess(
  group: GroupAudience & { id: string; name: string },
  previous: GroupAudience,
  actor: Actor,
  session: ClientSession,
): Promise<string[]> {
  const previousMembers = new Set(previous.memberIds.map(String));
  const previousManagers = new Set(previous.managerIds.map(String));
  const addedMemberIds = group.memberIds
    .map(String)
    .filter((id) => !previousMembers.has(id));
  const addedManagerIds = group.managerIds
    .map(String)
    .filter((id) => !previousManagers.has(id));
  const recipients = await loadRecipients(
    [...new Set([...addedMemberIds, ...addedManagerIds])].filter(
      (id) => id !== actor.id,
    ),
    session,
  );
  if (!recipients.length) return [];
  const counts = new Map<string, number>();
  const files = FileEntry.find({ "accessControl.allowedGroups": group.id })
    .select("uploadedBy accessControl")
    .session(session)
    .lean<AccessibleFile[]>()
    .cursor();
  for await (const file of files) {
    for (const user of recipients) {
      const previousGroups = user.groupIds.filter((id) => id !== group.id);
      if (previousMembers.has(user.id)) previousGroups.push(group.id);
      const previousManagedGroups = user.managedGroupIds.filter(
        (id) => id !== group.id,
      );
      if (canManageSharingGroup(user.id, user.access ?? "Member", previous))
        previousManagedGroups.push(group.id);
      if (
        !canAccessFile(
          user.id,
          user.access,
          user.roles,
          file,
          previousGroups,
          previousManagedGroups,
        )
      ) {
        counts.set(user.id, (counts.get(user.id) ?? 0) + 1);
      }
    }
  }
  const created = await notifyBatch(
    [...counts].map(([userId, count]) => ({
      userId,
      type: "file_shared",
      title: "New files shared with you",
      message: `${actorName(actor)} added you to “${group.name}”. You now have access to ${count} ${count === 1 ? "file" : "files"} through this group.`,
      link: "/internal/files",
    })),
    { session },
  );
  return created.map((notification) => String(notification._id));
}
