"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { updateProject } from "@/lib/actions/admin/projects";
import { expectAppData } from "@/lib/api/result";
import { PROJECT_MODULES, PROJECT_STATUSES } from "@/lib/constants";
import {
  DEFAULT_IMAGE_FOCAL_POINT,
  type ImageFocalPoint,
} from "@/lib/imageFocalPoint";

import BackLink from "@/components/shared/BackLink";
import ImageUpload from "@/components/shared/ImageUpload";
import MemberPicker from "@/components/shared/MemberPicker";
import TagEditor from "@/components/shared/TagEditor";

import styles from "../AdminProjectForm.module.scss";
import { FormSkeletonContent } from "@/components/shared/skeletons/FormSkeleton";

interface ProjectData {
  _id: string;
  title: string;
  description: string;
  repoLink: string;
  liveUrl?: string;
  coverImage?: string;
  coverFocalPoint?: ImageFocalPoint;
  date: string;
  module: (typeof PROJECT_MODULES)[number];
  status: (typeof PROJECT_STATUSES)[number];
  tags: string[];
  takeaways?: string[];
  contributors?: string[];
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
  const [liveUrl, setLiveUrl] = useState("");
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
  const [tags, setTags] = useState<string[]>([]);
  const [takeaways, setTakeaways] = useState("");
  const [contributors, setContributors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchProject() {
      try {
        const res = await fetch(`/api/admin/projects/${id}`);
        const data = await expectAppData<{
          project?: ProjectData;
        }>(res);

        if (!data.project) throw new Error("Failed to load project.");

        const project = data.project;
        setTitle(project.title);
        setDescription(project.description);
        setRepoLink(project.repoLink);
        setLiveUrl(project.liveUrl || "");
        setCoverImage(project.coverImage || "");
        setCoverFocalPoint(
          project.coverFocalPoint || DEFAULT_IMAGE_FOCAL_POINT,
        );
        setDate(project.date ? toMonthInput(project.date) : "");
        setModule(project.module || PROJECT_MODULES[0]);
        setStatus(project.status || PROJECT_STATUSES[0]);
        setTags(project.tags ?? []);
        setTakeaways((project.takeaways ?? []).join("\n"));
        setContributors(project.contributors ?? []);
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
    formData.set("liveUrl", liveUrl);
    if (coverImage) formData.set("coverImage", coverImage);
    formData.set("coverFocalPointX", String(coverFocalPoint.x));
    formData.set("coverFocalPointY", String(coverFocalPoint.y));
    formData.set("date", date);
    formData.set("module", module);
    formData.set("status", status);
    if (tags.length) formData.set("tags", tags.join(","));
    formData.set("takeaways", takeaways);
    formData.set("contributors", contributors.join(","));

    const result = await updateProject(id, formData);
    if (result.ok) {
      router.push("/admin/projects");
      router.refresh();
      return;
    }

    setError(result.error.message);
    setSaving(false);
  }

  const header = (
    <>
      <BackLink href="/admin/projects" label="Back to Projects" />
      <h1 className={styles.pageTitle}>Edit Project</h1>
    </>
  );

  if (loading) {
    return (
      <div className={styles.container}>
        {header}
        <FormSkeletonContent label="the project" fields={5} />
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {header}

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
          <label className={styles.label}>Live site URL</label>
          <input
            type="url"
            value={liveUrl}
            onChange={(event) => setLiveUrl(event.target.value)}
            className={styles.input}
            placeholder="https://example.com"
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
            focalPointAspectRatio="16 / 10"
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
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="project-tags">
            Tags
          </label>
          <TagEditor
            id="project-tags"
            value={tags}
            onChange={setTags}
            placeholder="Add project tag…"
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="project-takeaways">
            What it teaches
          </label>
          <textarea
            id="project-takeaways"
            className={styles.textarea}
            rows={4}
            value={takeaways}
            onChange={(e) => setTakeaways(e.target.value)}
            placeholder="One takeaway per line (upto 6)."
          />
          <p className={styles.hint}>
            Shown in the project sheet on the public page.
          </p>
        </div>

        <div className={styles.field}>
          <label className={styles.label}>On it now</label>
          <MemberPicker value={contributors} onChange={setContributors} />
          <p className={styles.hint}>Only the headcount is shown publicly.</p>
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
