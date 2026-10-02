"use client";

import { useId } from "react";
import { Globe, Shield, Users } from "lucide-react";

import {
  MODULES,
  CLUB_POSITIONS,
  MODULE_POSITIONS,
  FILE_SHARING_LIMIT,
} from "@/lib/constants";
import type { AccessControl } from "@/lib/files/types";
import MemberPicker from "@/components/shared/MemberPicker";

import GroupPicker from "./GroupPicker";
import styles from "./FilesClient.module.scss";

interface Props {
  value: AccessControl;
  onChange: (acl: AccessControl) => void;
}

export default function AccessControlForm({ value, onChange }: Props) {
  const id = useId();
  const rules = [
    { key: "allowedModules", label: "Modules", options: MODULES },
    {
      key: "allowedClubPositions",
      label: "Club positions",
      options: CLUB_POSITIONS,
    },
    {
      key: "allowedModulePositions",
      label: "Module positions (across all modules)",
      options: MODULE_POSITIONS,
    },
  ] as const;
  const hasRules = rules.some(({ key }) => value[key].length > 0);

  return (
    <div className={styles.aclForm}>
      <div className={styles.field}>
        <label htmlFor={`${id}-general`}>
          <Globe size={14} /> General access
        </label>
        <select
          id={`${id}-general`}
          value={value.allMembers ? "all" : "restricted"}
          onChange={(event) =>
            onChange({ ...value, allMembers: event.target.value === "all" })
          }
        >
          <option value="restricted">Restricted</option>
          <option value="all">All club members</option>
        </select>
        <p className={styles.hint}>
          {value.allMembers
            ? "Every signed-in club member can access this file."
            : "Access is limited to selected recipients and file managers."}
        </p>
      </div>
      {!value.allMembers && (
        <>
          <section className={styles.aclGroup} aria-labelledby={`${id}-groups`}>
            <h3 id={`${id}-groups`} className={styles.aclGroupLabel}>
              <Users size={14} /> Groups
            </h3>
            <GroupPicker
              value={value.allowedGroups ?? []}
              onChange={(allowedGroups) =>
                onChange({ ...value, allowedGroups })
              }
            />
            <p className={styles.hint}>
              Access follows group membership. Select a group name to see its
              members.
            </p>
          </section>
          <section className={styles.aclGroup} aria-labelledby={`${id}-people`}>
            <h3 id={`${id}-people`} className={styles.aclGroupLabel}>
              <Users size={14} /> People
            </h3>
            <MemberPicker
              maxItems={FILE_SHARING_LIMIT}
              value={value.allowedUsers}
              onChange={(allowedUsers) => onChange({ ...value, allowedUsers })}
              placeholder="Add a person…"
            />
          </section>
          <details className={styles.accessRules} open={hasRules || undefined}>
            <summary>
              <Shield size={14} /> Modules and positions
            </summary>
            {rules.map(({ key, label, options }) => (
              <fieldset key={key} className={styles.ruleGroup}>
                <legend className={styles.aclGroupLabel}>{label}</legend>
                <div className={styles.checkGrid}>
                  {options.map((option) => (
                    <label key={option} className={styles.checkItem}>
                      <input
                        type="checkbox"
                        checked={(value[key] as readonly string[]).includes(
                          option,
                        )}
                        onChange={(event) =>
                          onChange({
                            ...value,
                            [key]: event.target.checked
                              ? [...value[key], option]
                              : value[key].filter((entry) => entry !== option),
                          })
                        }
                      />
                      {option}
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
          </details>
          <p className={styles.hint}>
            Any matching person, group, module, or position grants access.
            Removing one grant may leave another in effect.
          </p>
        </>
      )}
      <p className={styles.hint}>
        Uploader, admins, and heads managing the file&apos;s module always have
        access.
      </p>
    </div>
  );
}
