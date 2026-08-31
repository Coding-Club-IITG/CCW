"use client";

import { appErrorMessage, expectAppData } from "@/lib/api/result";

import { useState } from "react";
import { X, Shield, AlertCircle } from "lucide-react";
import TagEditor from "@/components/shared/TagEditor";
import { validateTags } from "@/lib/tagUtils";
import type { FileEntry } from "./types";
import { EMPTY_ACL } from "./utils";
import AccessControlForm from "./AccessControlForm";
import styles from "./FilesClient.module.scss";

interface Props {
  file: FileEntry;
  existingTags: string[];
  onSuccess: () => void;
  onClose: () => void;
}

export default function EditModal({
  file,
  existingTags,
  onSuccess,
  onClose,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: file.title,
    description: file.description,
    tags: file.tags,
    isDownloadable: file.isDownloadable,
    accessControl: { ...EMPTY_ACL, ...file.accessControl },
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) {
      setError("Title is required.");
      return;
    }
    const parsedTags = validateTags(form.tags, { minTags: 1, maxTags: 10 });
    if (!parsedTags.ok) {
      setError(parsedTags.error);
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
      await expectAppData(res);
      onSuccess();
    } catch (error) {
      setError(appErrorMessage(error, "Network error. Please try again."));
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
              <label htmlFor="edit-file-tags">Tags *</label>
              <TagEditor
                id="edit-file-tags"
                value={form.tags}
                onChange={(tags) =>
                  setForm((previous) => ({ ...previous, tags }))
                }
                suggestions={existingTags}
                maxTags={10}
                required
                placeholder="Add a tag…"
              />
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
