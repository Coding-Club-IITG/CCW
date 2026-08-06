"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  createPublicEvent,
  setPublicEventStatus,
  syncPublicEventSchedule,
  updateEvent,
} from "@/lib/actions/admin/events";
import type { EventPublicationStatus } from "@/lib/constants";
import {
  DEFAULT_IMAGE_FOCAL_POINT,
  type ImageFocalPoint,
} from "@/lib/imageFocalPoint";
import ImageUpload from "@/components/shared/ImageUpload";
import MarkdownEditor from "@/components/shared/MarkdownEditor";
import styles from "@/app/(protected)/admin/events/new/EventForm.module.scss";

interface ExistingPublicEvent {
  _id: string;
  title: string;
  shortDescription: string;
  description: string;
  poster: string;
  posterFocalPoint?: ImageFocalPoint;
  tags: string[];
  status: EventPublicationStatus;
}

export default function PublicEventForm({
  calendarEventId,
  calendarTitle,
  calendarDescription,
  event,
  outOfSync = false,
}: {
  calendarEventId: string;
  calendarTitle: string;
  calendarDescription: string;
  event?: ExistingPublicEvent;
  outOfSync?: boolean;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(event?.title ?? calendarTitle);
  const [shortDescription, setShortDescription] = useState(
    event?.shortDescription ?? "",
  );
  const [description, setDescription] = useState(
    event?.description ?? calendarDescription,
  );
  const [poster, setPoster] = useState(event?.poster ?? "");
  const [posterFocalPoint, setPosterFocalPoint] = useState<ImageFocalPoint>(
    event?.posterFocalPoint ?? DEFAULT_IMAGE_FOCAL_POINT,
  );
  const [tags, setTags] = useState(event?.tags.join(", ") ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function payload() {
    return {
      title,
      shortDescription,
      description,
      poster,
      posterFocalPoint,
      tags: tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
    };
  }

  async function save(status: EventPublicationStatus) {
    setSaving(true);
    setError("");
    const result = event
      ? await updateEvent(event._id, payload())
      : await createPublicEvent(calendarEventId, payload(), status);
    if (!result.success) {
      setError(result.error);
      setSaving(false);
      return;
    }
    const eventId =
      event?._id ??
      String("data" in result ? result.data._id : result.event._id);
    if (event && event.status !== status) {
      const statusResult = await setPublicEventStatus(eventId, status);
      if (!statusResult.success) {
        setError(statusResult.error);
        setSaving(false);
        return;
      }
    }
    router.push("/admin/events");
    router.refresh();
  }

  async function syncSchedule() {
    if (!event) return;
    setSaving(true);
    const result = await syncPublicEventSchedule(event._id);
    if (!result.success) setError(result.error);
    else router.refresh();
    setSaving(false);
  }

  return (
    <div className={styles.form}>
      {error && (
        <div className={styles.error} role="alert">
          {error}
        </div>
      )}
      {outOfSync && (
        <div className={styles.error}>
          The public schedule is out of sync with the calendar.{" "}
          <button
            className={styles.btnSecondary}
            type="button"
            onClick={() => void syncSchedule()}
            disabled={saving}
          >
            Sync schedule
          </button>
        </div>
      )}
      <div className={styles.field}>
        <label className={styles.label} htmlFor="public-title">
          Title
        </label>
        <input
          id="public-title"
          className={styles.input}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
        />
      </div>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="public-short">
          Short description
        </label>
        <input
          id="public-short"
          className={styles.input}
          value={shortDescription}
          onChange={(e) => setShortDescription(e.target.value)}
          maxLength={200}
        />
      </div>
      <div className={styles.field}>
        <ImageUpload
          value={poster}
          onChange={(value) => {
            setPoster(value);
            if (value !== poster)
              setPosterFocalPoint(DEFAULT_IMAGE_FOCAL_POINT);
          }}
          uploadEndpoint="/api/admin/events/upload-image"
          label="Poster"
          previewClassName={styles.posterPreview}
          focalPoint={posterFocalPoint}
          onFocalPointChange={setPosterFocalPoint}
        />
      </div>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="public-tags">
          Tags
        </label>
        <input
          id="public-tags"
          className={styles.input}
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="Comma-separated tags"
        />
      </div>
      <div className={styles.field}>
        <label className={styles.label}>Public description</label>
        <MarkdownEditor
          value={description}
          onChange={setDescription}
          uploadEndpoint="/api/admin/events/upload-image"
          placeholder="Public event details..."
          rows={16}
        />
      </div>
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.btnSecondary}
          onClick={() => void save("draft")}
          disabled={saving}
        >
          {saving ? "Saving…" : "Save draft"}
        </button>
        <button
          type="button"
          className={styles.submitBtn}
          onClick={() => void save("published")}
          disabled={saving}
        >
          {saving ? "Saving…" : "Publish"}
        </button>
      </div>
    </div>
  );
}
