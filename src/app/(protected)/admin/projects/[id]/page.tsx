"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import BackLink from "@/components/shared/BackLink";
import ImageUpload from "@/components/shared/ImageUpload";
import { PROJECT_MODULES, PROJECT_STATUSES } from "@/lib/constants";
import { updateProject } from "@/lib/actions/admin/projects";
import styles from "../../events/new/EventForm.module.scss";

interface ProjectData {
  _id: string;
  title: string;
  description: string;
  repoLink: string;
  coverImage?: string;
  date: string;
  module: (typeof PROJECT_MODULES)[number];
  status: (typeof PROJECT_STATUSES)[number];
  tags: string[];
}

function toMonthInput(date: string) {
  const parsed = new Date(date);
  return `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default function EditProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [repoLink, setRepoLink] = useState("");
  const [coverImage, setCoverImage] = useState("");
  const [date, setDate] = useState("");
  const [module, setModule] = useState<(typeof PROJECT_MODULES)[number]>(
    PROJECT_MODULES[0],
  );
  const [status, setStatus] = useState<(typeof PROJECT_STATUSES)[number]>(
    PROJECT_STATUSES[0],
  );
  const [tags, setTags] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchProject() {
      try {
        const res = await fetch(`/api/admin/projects/${id}`);
        const data = (await res.json()) as {
          error?: string;
          project?: ProjectData;
        };

        if (!res.ok || !data.project) {
          throw new Error(data.error || "Failed to load project.");
        }

        const project = data.project;
        setTitle(project.title);
        setDescription(project.description);
        setRepoLink(project.repoLink);
        setCoverImage(project.coverImage || "");
        setDate(project.date ? toMonthInput(project.date) : "");
        setModule(project.module || PROJECT_MODULES[0]);
        setStatus(project.status || PROJECT_STATUSES[0]);
        setTags(project.tags?.join(", ") || "");
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load project.",
        );
      } finally {
        setLoading(false);
      }
    }

    void fetchProject();
  }, [id]);

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
    formData.set("date", date);
    formData.set("module", module);
    formData.set("status", status);
    if (tags) formData.set("tags", tags);

    const result = await updateProject(id, formData);
    if (result.success) {
      router.push("/admin/projects");
      router.refresh();
      return;
    }

    setError(result.error || "Failed to update project.");
    setSaving(false);
  }

  if (loading) {
    return (
      <div className={styles.container}>
        <BackLink href="/admin/projects" label="Back to Projects" />
        <p>Loading project...</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <BackLink href="/admin/projects" label="Back to Projects" />
      <h1 className={styles.pageTitle}>Edit Project</h1>

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
            onChange={setCoverImage}
            uploadEndpoint="/api/admin/projects/upload-image"
            label="Image"
            previewClassName={styles.posterPreview}
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
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
