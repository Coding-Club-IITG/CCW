"use client";

import { useId, useState } from "react";

import { appErrorMessage, expectAppData } from "@/lib/api/result";
import { normalizeAccessControl } from "@/lib/files/accessControl";
import Modal from "@/components/shared/Modal";

import AccessControlForm from "./AccessControlForm";
import DownloadPermissionField from "./DownloadPermissionField";
import type { FileEntry } from "./types";
import styles from "./FilesClient.module.scss";

interface Props {
  file: FileEntry;
  onClose: () => void;
  onSuccess: () => void;
}

export default function ShareModal({ file, onClose, onSuccess }: Props) {
  const id = useId();
  const [acl, setAcl] = useState(() =>
    normalizeAccessControl(file.accessControl),
  );
  const [isDownloadable, setIsDownloadable] = useState(file.isDownloadable);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await expectAppData(
        await fetch(`/api/files/${file._id}/share`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            updatedAt: file.updatedAt,
            isDownloadable,
            accessControl: acl,
          }),
        }),
      );
      onSuccess();
    } catch (error) {
      setError(
        appErrorMessage(error, "Could not update sharing. Please try again."),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      kicker="Files"
      title="Share file"
      description={file.title}
      onClose={onClose}
      closeDisabled={saving}
      maxWidth={680}
      footer={
        <>
          <button
            type="button"
            className={styles.cancelBtn}
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="submit"
            form={id}
            className={styles.primaryBtn}
            disabled={saving}
          >
            {saving ? "Saving…" : "Save access"}
          </button>
        </>
      }
    >
      <form id={id} onSubmit={save}>
        <fieldset disabled={saving} className={styles.modalFields}>
          <AccessControlForm value={acl} onChange={setAcl} />
          <DownloadPermissionField
            value={isDownloadable}
            onChange={setIsDownloadable}
          />
          {error && (
            <div role="alert" className={styles.formError}>
              {error}
            </div>
          )}
        </fieldset>
      </form>
    </Modal>
  );
}
