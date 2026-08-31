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
import TagEditor from "@/components/shared/TagEditor";
import styles from "@/app/(protected)/admin/events/new/EventForm.module.scss";

interface ExistingPublicEvent {
  _id: string;
  title: string;
  shortDescription: string;
  publicAudience?: string;
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
  const [publicAudience, setPublicAudience] = useState(
    event?.publicAudience ?? "",
  );
  const [description, setDescription] = useState(
    event?.description ?? calendarDescription,
  );
  const [poster, setPoster] = useState(event?.poster ?? "");
  const [posterFocalPoint, setPosterFocalPoint] = useState<ImageFocalPoint>(
    event?.posterFocalPoint ?? DEFAULT_IMAGE_FOCAL_POINT,
  );
  const [tags, setTags] = useState<string[]>(event?.tags ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function payload() {
    return {
      title,
      shortDescription,
      publicAudience,
      description,
      poster,
      posterFocalPoint,
      tags,
    };
  }

  async function save(status: EventPublicationStatus) {
    setSaving(true);
    setError("");
    let eventId: string;
    if (event) {
      const result = await updateEvent(event._id, payload());
      if (!result.ok) {
        setError(result.error.message);
        setSaving(false);
        return;
      }
      eventId = event._id;
    } else {
      const result = await createPublicEvent(
        calendarEventId,
        payload(),
        status,
      );
      if (!result.ok) {
        setError(result.error.message);
        setSaving(false);
        return;
      }
      eventId = result.data._id;
    }
    if (event && event.status !== status) {
      const statusResult = await setPublicEventStatus(eventId, status);
      if (!statusResult.ok) {
        setError(statusResult.error.message);
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
    if (!result.ok) setError(result.error.message);
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
      <div className={styles.notice} role="note">
        The linked calendar location will be publicly displayed when this event
        is published. Agenda, minutes, reminders, and internal links stay
        private.
      </div>
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
        <label className={styles.label} htmlFor="public-audience">
          Open to
        </label>
        <input
          id="public-audience"
          className={styles.input}
          value={publicAudience}
          onChange={(e) => setPublicAudience(e.target.value)}
          maxLength={80}
          placeholder="Everyone"
        />
        <p className={styles.hint}>
          Shown on the event page. Leave blank to omit it.
        </p>
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
        <TagEditor
          id="public-tags"
          value={tags}
          onChange={setTags}
          placeholder="Add event tag…"
        />
      </div>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="public-event-description">
          Public description
        </label>
        <MarkdownEditor
          id="public-event-description"
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
