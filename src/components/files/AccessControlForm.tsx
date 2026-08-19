"use client";

import { expectAppData } from "@/lib/api/result";

import { useEffect, useState } from "react";
import { Globe, FolderOpen, Shield, Users, X } from "lucide-react";
import { MODULES, CLUB_POSITIONS, MODULE_POSITIONS } from "@/lib/constants";
import UserSearch from "@/components/shared/UserSearch";
import type { AccessControl, UserBasic } from "./types";
import styles from "./FilesClient.module.scss";

interface Props {
  value: AccessControl;
  onChange: (acl: AccessControl) => void;
}

export default function AccessControlForm({ value, onChange }: Props) {
  const [userCache, setUserCache] = useState<Record<string, UserBasic>>({});

  // Resolve names for already-selected users not yet in the cache
  useEffect(() => {
    const missing = value.allowedUsers.filter((id) => !userCache[id]);
    if (missing.length === 0) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/users?ids=${encodeURIComponent(missing.join(","))}`,
        );
        if (!res.ok) return;
        const data = await expectAppData(res);
        if (cancelled) return;
        const additions: Record<string, UserBasic> = {};
        for (const u of (data.items || []) as UserBasic[]) additions[u._id] = u;
        if (Object.keys(additions).length > 0)
          setUserCache((prev) => ({ ...prev, ...additions }));
      } catch {
        // Non-critical
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [value.allowedUsers, userCache]);

  function toggleArr<T extends string>(
    arr: T[],
    item: T,
    key: keyof AccessControl,
  ) {
    const next = arr.includes(item)
      ? arr.filter((x) => x !== item)
      : [...arr, item];
    onChange({ ...value, [key]: next });
  }

  const selectedUsers = value.allowedUsers
    .map((id) => userCache[id])
    .filter((u): u is UserBasic => Boolean(u));

  return (
    <div className={styles.aclForm}>
      {/* All Members */}
      <label className={styles.aclCheckRow}>
        <input
          type="checkbox"
          checked={value.allMembers}
          onChange={(e) => onChange({ ...value, allMembers: e.target.checked })}
        />
        <Globe size={14} />
        <strong>All club members can access this file</strong>
      </label>

      {!value.allMembers && (
        <>
          {/* Modules */}
          <div className={styles.aclGroup}>
            <div className={styles.aclGroupLabel}>
              <FolderOpen size={13} /> Allow by module
            </div>
            <div className={styles.checkGrid}>
              {MODULES.map((m) => (
                <label key={m} className={styles.checkItem}>
                  <input
                    type="checkbox"
                    checked={value.allowedModules.includes(m)}
                    onChange={() =>
                      toggleArr(value.allowedModules, m, "allowedModules")
                    }
                  />
                  {m}
                </label>
              ))}
            </div>
          </div>

          {/* Global Roles */}
          <div className={styles.aclGroup}>
            <div className={styles.aclGroupLabel}>
              <Shield size={13} /> Allow by club position
            </div>
            <div className={styles.checkGrid}>
              {CLUB_POSITIONS.map((r) => (
                <label key={r} className={styles.checkItem}>
                  <input
                    type="checkbox"
                    checked={value.allowedClubPositions.includes(r)}
                    onChange={() =>
                      toggleArr(
                        value.allowedClubPositions,
                        r,
                        "allowedClubPositions",
                      )
                    }
                  />
                  {r}
                </label>
              ))}
            </div>
          </div>

          {/* Module Roles */}
          <div className={styles.aclGroup}>
            <div className={styles.aclGroupLabel}>
              <Users size={13} /> Allow by module position
            </div>
            <div className={styles.checkGrid}>
              {MODULE_POSITIONS.map((r) => (
                <label key={r} className={styles.checkItem}>
                  <input
                    type="checkbox"
                    checked={value.allowedModulePositions.includes(r)}
                    onChange={() =>
                      toggleArr(
                        value.allowedModulePositions,
                        r,
                        "allowedModulePositions",
                      )
                    }
                  />
                  {r}
                </label>
              ))}
            </div>
          </div>

          {/* Specific Users */}
          <div className={styles.aclGroup}>
            <div className={styles.aclGroupLabel}>
              <Users size={13} /> Allow specific users
            </div>

            {selectedUsers.length > 0 && (
              <div className={styles.userTags}>
                {selectedUsers.map((u) => (
                  <span key={u._id} className={styles.userTag}>
                    {u.name}
                    <button
                      type="button"
                      onClick={() =>
                        onChange({
                          ...value,
                          allowedUsers: value.allowedUsers.filter(
                            (id) => id !== u._id,
                          ),
                        })
                      }
                    >
                      <X size={11} />
                    </button>
                  </span>
                ))}
              </div>
            )}

            <UserSearch
              excludedIds={value.allowedUsers}
              onSelect={(user) => {
                setUserCache((previous) => ({
                  ...previous,
                  [user.id]: {
                    _id: user.id,
                    name: user.name,
                    email: user.secondary || "",
                  },
                }));
                onChange({
                  ...value,
                  allowedUsers: [...value.allowedUsers, user.id],
                });
              }}
            />
          </div>
        </>
      )}
    </div>
  );
}
