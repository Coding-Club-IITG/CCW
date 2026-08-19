"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import BackLink from "@/components/shared/BackLink";
import ImageUpload from "@/components/shared/ImageUpload";
import { PROJECT_MODULES, PROJECT_STATUSES } from "@/lib/constants";
import { createProject } from "@/lib/actions/admin/projects";
import styles from "../../events/new/EventForm.module.scss";
import {
  DEFAULT_IMAGE_FOCAL_POINT,
  type ImageFocalPoint,
} from "@/lib/imageFocalPoint";

export default function NewProjectPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [repoLink, setRepoLink] = useState("");
  const [coverImage, setCoverImage] = useState("");
  const [coverFocalPoint, setCoverFocalPoint] = useState<ImageFocalPoint>(
    DEFAULT_IMAGE_FOCAL_POINT,
  );
  const [date, setDate] = useState("");
  const [module, setModule] = useState<(typeof PROJECT_MODULES)[number]>(
    PROJECT_MODULES[0],
  );
  const [status, setStatus] = useState<(typeof PROJECT_STATUSES)[number]>(
    PROJECT_STATUSES[0],
  );
  const [tags, setTags] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit() {
    if (
      !title.trim() ||
      !description.trim() ||
      !repoLink.trim() ||
      !date ||
      !module ||
      !status
    ) {
      setError(
        "Title, description, repo link, date, module, and status are required.",
      );
      return;
    }

    setSaving(true);
    setError("");

    const formData = new FormData();
    formData.set("title", title);
    formData.set("description", description);
    formData.set("repoLink", repoLink);
    if (coverImage) formData.set("coverImage", coverImage);
    formData.set("coverFocalPointX", String(coverFocalPoint.x));
    formData.set("coverFocalPointY", String(coverFocalPoint.y));
    formData.set("date", date);
    formData.set("module", module);
    formData.set("status", status);
    if (tags) formData.set("tags", tags);

    const result = await createProject(formData);
    if (result.ok) {
      router.push("/admin/projects");
      router.refresh();
      return;
    }

    setError(result.error.message);
    setSaving(false);
  }

  return (
    <div className={styles.container}>
      <BackLink href="/admin/projects" label="Back to Projects" />
      <h1 className={styles.pageTitle}>Create Project</h1>

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.form}>
        <div className={styles.field}>
          <label className={styles.label}>Title *</label>
          <input
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className={styles.input}
            placeholder="Project title"
            maxLength={200}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Repository Link *</label>
          <input
            type="url"
            value={repoLink}
            onChange={(event) => setRepoLink(event.target.value)}
            className={styles.input}
            placeholder="https://github.com/..."
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Description *</label>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className={styles.textarea}
            placeholder="Brief description of the project"
            rows={4}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Cover Image</label>
          <ImageUpload
            value={coverImage}
            onChange={(value) => {
              setCoverImage(value);
              if (value !== coverImage)
                setCoverFocalPoint(DEFAULT_IMAGE_FOCAL_POINT);
            }}
            uploadEndpoint="/api/admin/projects/upload-image"
            label="Image"
            previewClassName={styles.posterPreview}
            focalPoint={coverFocalPoint}
            onFocalPointChange={setCoverFocalPoint}
          />
        </div>

        <div className={styles.row}>
          <div className={styles.field}>
            <label className={styles.label}>Date (Month/Year) *</label>
            <input
              type="month"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className={styles.input}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Module *</label>
            <select
              value={module}
              onChange={(event) =>
                setModule(
                  event.target.value as (typeof PROJECT_MODULES)[number],
                )
              }
              className={styles.select}
            >
              {PROJECT_MODULES.map((moduleName) => (
                <option key={moduleName} value={moduleName}>
                  {moduleName}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className={styles.row}>
          <div className={styles.field}>
            <label className={styles.label}>Status *</label>
            <select
              value={status}
              onChange={(event) =>
                setStatus(
                  event.target.value as (typeof PROJECT_STATUSES)[number],
                )
              }
              className={styles.select}
            >
              {PROJECT_STATUSES.map((statusOption) => (
                <option key={statusOption} value={statusOption}>
                  {statusOption}
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

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.submitBtn}
            onClick={() => void handleSubmit()}
            disabled={saving}
          >
            {saving ? "Creating..." : "Create Project"}
          </button>
        </div>
      </div>
    </div>
  );
}
