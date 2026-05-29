"use client";

import { useState } from "react";
import { X, Shield, AlertCircle } from "lucide-react";
import type { FileEntry, UserBasic } from "./types";
import { EMPTY_ACL } from "./utils";
import AccessControlForm from "./AccessControlForm";
import styles from "./FilesClient.module.scss";

interface Props {
  file: FileEntry;
  existingFolders: string[];
  users: UserBasic[];
  onSuccess: () => void;
  onClose: () => void;
}

export default function EditModal({
  file,
  existingFolders,
  users,
  onSuccess,
  onClose,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: file.title,
    description: file.description,
    folder: file.folder,
    isDownloadable: file.isDownloadable,
    accessControl: { ...EMPTY_ACL, ...file.accessControl },
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) {
      setError("Title is required.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/files/${file._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Update failed.");
        return;
      }
      onSuccess();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className={styles.overlay} onClick={() => !loading && onClose()} />
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <div>
            <h2>Edit File</h2>
            <p className={styles.subtle}>{file.originalName}</p>
          </div>
          <button
            className={styles.closeBtn}
            onClick={onClose}
            disabled={loading}
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className={styles.modalForm}>
          <div className={styles.modalBody}>
            <div className={styles.field}>
              <label>Title *</label>
              <input
                type="text"
                value={form.title}
                onChange={(e) =>
                  setForm((p) => ({ ...p, title: e.target.value }))
                }
                required
              />
            </div>

            <div className={styles.field}>
              <label>Description</label>
              <textarea
                value={form.description}
                onChange={(e) =>
                  setForm((p) => ({ ...p, description: e.target.value }))
                }
                rows={2}
              />
            </div>

            <div className={styles.field}>
              <label>Folder</label>
              <input
                type="text"
                list="edit-folders"
                value={form.folder}
                onChange={(e) =>
                  setForm((p) => ({ ...p, folder: e.target.value }))
                }
              />
              <datalist id="edit-folders">
                {existingFolders.map((f) => (
                  <option key={f} value={f} />
                ))}
              </datalist>
            </div>

            <div className={styles.field}>
              <label className={styles.toggleLabel}>
                <input
                  type="checkbox"
                  checked={form.isDownloadable}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, isDownloadable: e.target.checked }))
                  }
                />
                <span>Allow downloading</span>
                <span className={styles.toggleHint}>
                  {form.isDownloadable
                    ? "Users can download this file"
                    : "View-only - no download option"}
                </span>
              </label>
            </div>

            <div className={styles.aclSection}>
              <div className={styles.aclSectionHeader}>
                <Shield size={14} />
                <strong>Access Permissions</strong>
              </div>
              <AccessControlForm
                value={form.accessControl}
                onChange={(acl) =>
                  setForm((p) => ({ ...p, accessControl: acl }))
                }
                users={users}
              />
            </div>

            {error && (
              <div className={styles.formError}>
                <AlertCircle size={14} /> {error}
              </div>
            )}
          </div>

          <div className={styles.modalActions}>
            <button
              type="button"
              className={styles.cancelBtn}
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={styles.primaryBtn}
              disabled={loading}
            >
              {loading ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
