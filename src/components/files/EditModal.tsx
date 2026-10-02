"use client";

import { AlertCircle } from "lucide-react";
import { useState } from "react";

import { appErrorMessage, expectAppData } from "@/lib/api/result";
import { validateTags } from "@/lib/shared/tags";

import Modal from "@/components/shared/Modal";
import TagEditor from "@/components/shared/TagEditor";

import styles from "./FilesClient.module.scss";
import type { FileEntry } from "./types";

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
        body: JSON.stringify({ ...form, updatedAt: file.updatedAt }),
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
    <Modal
      kicker="Files"
      title="Edit file"
      description={file.originalName}
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
            form="edit-file-form"
            className={styles.primaryBtn}
            disabled={loading}
          >
            {loading ? "Saving…" : "Save Changes"}
          </button>
        </>
      }
    >
      <form
        id="edit-file-form"
        onSubmit={handleSubmit}
        className={styles.modalFields}
      >
        <div className={styles.field}>
          <label>Title *</label>
          <input
            type="text"
            value={form.title}
            onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
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
            onChange={(tags) => setForm((previous) => ({ ...previous, tags }))}
            suggestions={existingTags}
            maxTags={10}
            required
            placeholder="Add a tag…"
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
