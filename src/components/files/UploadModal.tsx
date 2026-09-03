"use client";

import { Upload, FileIcon, Shield, AlertCircle } from "lucide-react";
import { useRef, useState } from "react";

import { appErrorMessage, expectAppData } from "@/lib/api/result";
import { MODULES, type ModuleName } from "@/lib/constants";
import { validateTags } from "@/lib/tagUtils";

import Modal from "@/components/shared/Modal";
import TagEditor from "@/components/shared/TagEditor";

import AccessControlForm from "./AccessControlForm";
import styles from "./FilesClient.module.scss";
import type { AccessControl, CurrentUser } from "./types";
import { EMPTY_ACL, formatBytes } from "./utils";

interface Props {
  currentUser: CurrentUser;
  existingTags: string[];
  onSuccess: () => void;
  onClose: () => void;
}

interface UploadFormState {
  file: File | null;
  title: string;
  description: string;
  tags: string[];
  uploaderModule: ModuleName | "";
  isDownloadable: boolean;
  accessControl: AccessControl;
}

export default function UploadModal({
  currentUser,
  existingTags,
  onSuccess,
  onClose,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<UploadFormState>({
    file: null,
    title: "",
    description: "",
    tags: [],
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
    const parsedTags = validateTags(form.tags, { minTags: 1, maxTags: 10 });
    if (!parsedTags.ok) {
      setError(parsedTags.error);
      return;
    }

    setLoading(true);
    setError(null);

    const fd = new FormData();
    fd.append("file", form.file);
    fd.append("title", form.title.trim());
    fd.append("description", form.description.trim());
    parsedTags.tags.forEach((tag) => fd.append("tags", tag));
    fd.append("isDownloadable", String(form.isDownloadable));
    fd.append("uploaderModule", form.uploaderModule || "null");
    fd.append("accessControl", JSON.stringify(form.accessControl));

    try {
      const res = await fetch("/api/files", { method: "POST", body: fd });
      await expectAppData(res);
      onSuccess();
    } catch (error) {
      setError(appErrorMessage(error, "Network error. Please try again."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      kicker="Files"
      title="Upload file"
      description="Fill in the details and set access permissions."
      onClose={onClose}
      closeDisabled={loading}
      maxWidth={680}
      footer={
        <>
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
            form="upload-file-form"
            className={styles.primaryBtn}
            disabled={loading}
          >
            <Upload size={14} />
            {loading ? "Uploading…" : "Upload File"}
          </button>
        </>
      }
    >
      <form
        id="upload-file-form"
        onSubmit={handleSubmit}
        className={styles.modalFields}
      >
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
            onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
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

        <div className={styles.field}>
          <label htmlFor="upload-file-tags">Tags *</label>
          <TagEditor
            id="upload-file-tags"
            value={form.tags}
            onChange={(tags) => setForm((previous) => ({ ...previous, tags }))}
            suggestions={existingTags}
            maxTags={10}
            required
            placeholder="Add a tag…"
          />
        </div>

        <div className={styles.fieldRow}>
          {(currentUser.isAdmin || currentUser.headModules.length > 1) && (
            <div className={styles.field}>
              <label>Module context</label>
              <select
                value={form.uploaderModule}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    uploaderModule: e.target.value as ModuleName | "",
                  }))
                }
              >
                {currentUser.isAdmin && (
                  <option value="">None (Admin upload)</option>
                )}
                {(currentUser.isAdmin ? MODULES : currentUser.headModules).map(
                  (m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ),
                )}
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
            onChange={(acl) => setForm((p) => ({ ...p, accessControl: acl }))}
          />
        </div>

        {error && (
          <div className={styles.formError}>
            <AlertCircle size={14} /> {error}
          </div>
        )}
      </form>
    </Modal>
  );
}
