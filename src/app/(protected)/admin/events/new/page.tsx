"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import BackLink from "@/components/shared/BackLink";
import MarkdownEditor from "@/components/shared/MarkdownEditor";
import ImageUpload from "@/components/shared/ImageUpload";
import { PROJECT_MODULES } from "@/lib/constants";
import { createEvent } from "@/lib/actions/admin/events";
import styles from "./EventForm.module.scss";

export default function NewEventPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [shortDescription, setShortDescription] = useState("");
  const [description, setDescription] = useState("");
  const [poster, setPoster] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [module, setModule] = useState("");
  const [tags, setTags] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit() {
    if (!title.trim() || !description.trim() || !poster || !startDate) {
      setError("Title, description, poster, and start date are required.");
      return;
    }

    setSaving(true);
    setError("");

    const formData = new FormData();
    formData.set("title", title);
    formData.set("shortDescription", shortDescription);
    formData.set("description", description);
    formData.set("poster", poster);
    formData.set("startDate", startDate);
    if (endDate) formData.set("endDate", endDate);
    if (module) formData.set("module", module);
    if (tags) formData.set("tags", tags);

    const result = await createEvent(formData);
    if (result.success) {
      router.push("/admin/events");
      router.refresh();
      return;
    }

    setError(result.error || "Failed to create event.");
    setSaving(false);
  }

  return (
    <div className={styles.container}>
      <BackLink href="/admin/events" label="Back to Events" />
      <h1 className={styles.pageTitle}>Create Event</h1>

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.form}>
        <div className={styles.field}>
          <label className={styles.label}>Title *</label>
          <input
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className={styles.input}
            placeholder="Event title"
            maxLength={200}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Short Description</label>
          <input
            type="text"
            value={shortDescription}
            onChange={(event) => setShortDescription(event.target.value)}
            className={styles.input}
            placeholder="Brief one-liner shown on the events listing"
            maxLength={200}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Poster *</label>
          <ImageUpload
            value={poster}
            onChange={setPoster}
            uploadEndpoint="/api/admin/events/upload-image"
            label="Poster"
            previewClassName={styles.posterPreview}
          />
        </div>

        <div className={styles.row}>
          <div className={styles.field}>
            <label className={styles.label}>Start Date *</label>
            <input
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              className={styles.input}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              className={styles.input}
            />
          </div>
        </div>

        <div className={styles.row}>
          <div className={styles.field}>
            <label className={styles.label}>Module</label>
            <select
              value={module}
              onChange={(event) => setModule(event.target.value)}
              className={styles.select}
            >
              <option value="">Club-wide (no module)</option>
              {PROJECT_MODULES.map((moduleName) => (
                <option key={moduleName} value={moduleName}>
                  {moduleName}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Tags</label>
            <input
              type="text"
              value={tags}
              onChange={(event) => setTags(event.target.value)}
              className={styles.input}
              placeholder="Comma-separated tags"
            />
          </div>
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Description (Markdown) *</label>
          <MarkdownEditor
            value={description}
            onChange={setDescription}
            uploadEndpoint="/api/admin/events/upload-image"
            placeholder="Write event details in Markdown..."
            rows={18}
          />
        </div>

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.submitBtn}
            onClick={() => void handleSubmit()}
            disabled={saving}
          >
            {saving ? "Creating..." : "Create Event"}
          </button>
        </div>
      </div>
    </div>
  );
}
