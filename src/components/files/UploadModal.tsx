"use client";

import { useRef, useState } from "react";
import { Upload, X, FileIcon, Shield, AlertCircle } from "lucide-react";
import { MODULES } from "@/lib/constants";
import type { CurrentUser, UserBasic } from "./types";
import { EMPTY_ACL, DEFAULT_FOLDER, formatBytes } from "./utils";
import AccessControlForm from "./AccessControlForm";
import styles from "./FilesClient.module.scss";

interface Props {
  currentUser: CurrentUser;
  existingFolders: string[];
  users: UserBasic[];
  onSuccess: () => void;
  onClose: () => void;
}

export default function UploadModal({
  currentUser,
  existingFolders,
  users,
  onSuccess,
  onClose,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    file: null as File | null,
    title: "",
    description: "",
    folder: DEFAULT_FOLDER,
    uploaderModule: currentUser.headModules[0] ?? "",
    isDownloadable: true,
    accessControl: { ...EMPTY_ACL },
  });

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setForm((prev) => ({
      ...prev,
      file,
      title: prev.title || (file ? file.name.replace(/\.[^/.]+$/, "") : ""),
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.file) {
      setError("Please select a file.");
      return;
    }
    if (!form.title.trim()) {
      setError("Title is required.");
      return;
    }

    setLoading(true);
    setError(null);

    const fd = new FormData();
    fd.append("file", form.file);
    fd.append("title", form.title.trim());
    fd.append("description", form.description.trim());
    fd.append("folder", form.folder.trim() || DEFAULT_FOLDER);
    fd.append("isDownloadable", String(form.isDownloadable));
    fd.append("uploaderModule", form.uploaderModule || "null");
    fd.append("accessControl", JSON.stringify(form.accessControl));

    try {
      const res = await fetch("/api/files", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Upload failed.");
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
            <h2>Upload File</h2>
            <p>Fill in the details and set access permissions.</p>
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
            {/* File picker */}
            <div className={styles.field}>
              <label>File *</label>
              <div
                className={styles.fileDropZone}
                onClick={() => fileInputRef.current?.click()}
              >
                {form.file ? (
                  <div className={styles.fileSelected}>
                    <FileIcon size={16} />
                    <span>{form.file.name}</span>
                    <span className={styles.subtle}>
                      ({formatBytes(form.file.size)})
                    </span>
                  </div>
                ) : (
                  <>
                    <Upload size={20} />
                    <span>Click to select a file</span>
                  </>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                style={{ display: "none" }}
                onChange={handleFileSelect}
              />
            </div>

            {/* Title */}
            <div className={styles.field}>
              <label>Title *</label>
              <input
                type="text"
                value={form.title}
                onChange={(e) =>
                  setForm((p) => ({ ...p, title: e.target.value }))
                }
                placeholder="Eg. Q3 Meeting Notes"
                required
              />
            </div>

            {/* Description */}
            <div className={styles.field}>
              <label>Description</label>
              <textarea
                value={form.description}
                onChange={(e) =>
                  setForm((p) => ({ ...p, description: e.target.value }))
                }
                placeholder="Brief description…"
                rows={2}
              />
            </div>

            {/* Folder + Module */}
            <div className={styles.fieldRow}>
              <div className={styles.field}>
                <label>Folder</label>
                <input
                  type="text"
                  list="upload-folders"
                  value={form.folder}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, folder: e.target.value }))
                  }
                  placeholder="General"
                />
                <datalist id="upload-folders">
                  {existingFolders.map((f) => (
                    <option key={f} value={f} />
                  ))}
                </datalist>
                <span className={styles.hint}>
                  Type or pick an existing folder
                </span>
              </div>

              {(currentUser.isAdmin || currentUser.headModules.length > 1) && (
                <div className={styles.field}>
                  <label>Module context</label>
                  <select
                    value={form.uploaderModule}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, uploaderModule: e.target.value }))
                    }
                  >
                    {currentUser.isAdmin && (
                      <option value="">None (Admin upload)</option>
                    )}
                    {(currentUser.isAdmin
                      ? MODULES
                      : currentUser.headModules
                    ).map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                  <span className={styles.hint}>
                    Used for module head management
                  </span>
                </div>
              )}
            </div>

            {/* Downloadable toggle */}
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

            {/* ACL */}
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
              <Upload size={14} />
              {loading ? "Uploading…" : "Upload File"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
