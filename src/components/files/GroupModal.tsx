"use client";

import { useEffect, useId, useState } from "react";

import { appErrorMessage, expectAppData } from "@/lib/api/result";
import { MODULES, FILE_SHARING_LIMIT, type ModuleName } from "@/lib/constants";
import type { SharingGroupDetail } from "@/lib/files/types";
import MemberPicker from "@/components/shared/MemberPicker";
import Modal from "@/components/shared/Modal";
import { useConfirm } from "@/components/shared/useConfirm";

import type { CurrentUser } from "./types";
import styles from "./FilesClient.module.scss";

interface Props {
  groupId?: string;
  currentUser?: CurrentUser;
  onClose: () => void;
  onSaved?: () => void;
}

export default function GroupModal({
  groupId,
  currentUser,
  onClose,
  onSaved,
}: Props) {
  const id = useId();
  const { confirm, confirmDialog } = useConfirm();
  const [group, setGroup] = useState<SharingGroupDetail | null>(null);
  const [form, setForm] = useState({
    name: "",
    description: "",
    module: null as ModuleName | null,
    memberIds: [] as string[],
  });
  const [loading, setLoading] = useState(Boolean(groupId));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const canEdit = Boolean(currentUser && (!groupId || group?.canManage));

  useEffect(() => {
    if (!groupId) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void fetch(`/api/files/groups/${groupId}`, { signal: controller.signal })
      .then((response) =>
        expectAppData<{ group: SharingGroupDetail }>(response),
      )
      .then(({ group: result }) => {
        if (controller.signal.aborted) return;
        setGroup(result);
        setForm({
          name: result.name,
          description: result.description,
          module: result.module,
          memberIds: result.memberIds,
        });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setError(appErrorMessage(error, "Could not load this group."));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [groupId, attempt]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await expectAppData(
        await fetch(
          groupId ? `/api/files/groups/${groupId}` : "/api/files/groups",
          {
            method: groupId ? "PATCH" : "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...form,
              ...(group ? { version: group.version } : {}),
            }),
          },
        ),
      );
      onSaved?.();
      onClose();
    } catch (error) {
      setError(
        appErrorMessage(error, "Could not save the group. Please try again."),
      );
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (
      !group ||
      !(await confirm({
        title: "Delete sharing group?",
        description: `Delete “${group.name}”? Members will lose any file access granted through it.`,
        confirmLabel: "Delete group",
      }))
    )
      return;
    setSaving(true);
    setError(null);
    try {
      await expectAppData(
        await fetch(`/api/files/groups/${groupId}`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ version: group.version }),
        }),
      );
      onSaved?.();
      onClose();
    } catch (error) {
      setError(appErrorMessage(error, "Could not delete the group."));
    } finally {
      setSaving(false);
    }
  }

  const modules = currentUser?.isAdmin
    ? MODULES
    : [
        ...new Set([
          ...(currentUser?.headModules ?? []),
          ...(group?.module ? [group.module] : []),
        ]),
      ];

  return (
    <>
      <Modal
        kicker="Sharing groups"
        title={groupId ? (group?.name ?? "Sharing group") : "Create group"}
        description={
          groupId
            ? "Access follows the current members of this group."
            : "Choose the people you regularly share files with."
        }
        onClose={onClose}
        closeDisabled={saving}
        maxWidth={640}
        footer={
          <>
            {canEdit && group && (
              <button
                type="button"
                className={styles.dangerBtn}
                disabled={saving || loading}
                onClick={remove}
              >
                Delete group
              </button>
            )}
            <button
              type="button"
              className={styles.cancelBtn}
              onClick={onClose}
              disabled={saving}
            >
              {canEdit ? "Cancel" : "Close"}
            </button>
            {canEdit && (
              <button
                type="submit"
                form={id}
                className={styles.primaryBtn}
                disabled={loading || saving}
              >
                {saving ? "Saving…" : groupId ? "Save group" : "Create group"}
              </button>
            )}
          </>
        }
      >
        {error && (
          <div role="alert" className={styles.formError}>
            {error}
            {groupId && !group && (
              <button
                type="button"
                onClick={() => setAttempt((value) => value + 1)}
              >
                Retry
              </button>
            )}
          </div>
        )}
        {loading ? (
          <p role="status" className={styles.hint}>
            Loading group…
          </p>
        ) : (
          (!groupId || group) && (
            <form id={id} onSubmit={save}>
              <fieldset className={styles.modalFields} disabled={saving}>
                {canEdit ? (
                  <>
                    <div className={styles.field}>
                      <label htmlFor={`${id}-name`}>Group name</label>
                      <input
                        type="text"
                        id={`${id}-name`}
                        value={form.name}
                        required
                        maxLength={100}
                        placeholder="Website Team"
                        onChange={(event) =>
                          setForm({ ...form, name: event.target.value })
                        }
                      />
                    </div>
                    <div className={styles.field}>
                      <label htmlFor={`${id}-description`}>Description</label>
                      <textarea
                        id={`${id}-description`}
                        value={form.description}
                        maxLength={500}
                        rows={2}
                        onChange={(event) =>
                          setForm({ ...form, description: event.target.value })
                        }
                      />
                    </div>
                    <div className={styles.field}>
                      <label htmlFor={`${id}-module`}>Module</label>
                      <select
                        id={`${id}-module`}
                        value={form.module ?? ""}
                        onChange={(event) =>
                          setForm({
                            ...form,
                            module: (event.target.value as ModuleName) || null,
                          })
                        }
                      >
                        <option value="">No module</option>
                        {modules.map((module) => (
                          <option key={module} value={module}>
                            {module}
                          </option>
                        ))}
                      </select>
                      <p className={styles.hint}>
                        Creator, admins, and heads of this module can manage
                        membership.
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    {group?.description && <p>{group.description}</p>}
                    {group?.module && (
                      <p className={styles.hint}>{group.module}</p>
                    )}
                  </>
                )}
                <section
                  className={styles.aclGroup}
                  aria-labelledby={`${id}-members`}
                >
                  <h3 id={`${id}-members`} className={styles.aclGroupLabel}>
                    Members · {form.memberIds.length}
                  </h3>
                  <MemberPicker
                    maxItems={FILE_SHARING_LIMIT}
                    initialItems={group?.members}
                    value={form.memberIds}
                    onChange={(memberIds) => setForm({ ...form, memberIds })}
                    readOnly={!canEdit}
                  />
                  {form.memberIds.length === 0 && (
                    <p className={styles.hint}>
                      This group has no members yet.
                    </p>
                  )}
                </section>
                {group && (
                  <p className={styles.impactNote}>
                    Used by {group.fileCount}{" "}
                    {group.fileCount === 1 ? "file" : "files"}. Membership
                    changes apply to all of them. People may also have access
                    through other sharing rules.
                  </p>
                )}
              </fieldset>
            </form>
          )
        )}
      </Modal>
      {confirmDialog}
    </>
  );
}
