"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Maximize2 } from "lucide-react";

import FocalImage from "@/components/shared/FocalImage";
import Sheet from "@/components/shared/Sheet";
import type { ImageFocalPoint } from "@/lib/imageFocalPoint";
import styles from "./Events.module.scss";

export type PreviewEvent = {
  _id: string;
  slug: string;
  title: string;
  shortDescription: string;
  poster?: string;
  posterFocalPoint?: ImageFocalPoint;
  moduleLabel: string;
  accent: string;
  status: string;
  when: string;
  where: string;
  starts: string;
  ends: string;
  recurrence: string;
  tags: string[];
};

/**
 * Poster card + expand sheet
 */
export default function EventPreview({
  event,
  onNext,
}: {
  event: PreviewEvent;
  onNext?: () => void;
}) {
  const [open, setOpen] = useState(false);

  const facts = [
    { label: "starts", value: event.starts },
    { label: "ends", value: event.ends },
    { label: "location", value: event.where },
    { label: "recurrence", value: event.recurrence },
  ];

  return (
    <>
      <button
        type="button"
        className={styles.card}
        style={{ "--accent": event.accent } as React.CSSProperties}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={`Preview ${event.title}`}
      >
        <span className={styles.cardMedia}>
          {event.poster && (
            <FocalImage
              src={event.poster}
              focalPoint={event.posterFocalPoint}
              alt=""
              width={600}
              height={750}
              sizes="(max-width: 760px) 100vw, 300px"
              loading="lazy"
              className={styles.cardPoster}
            />
          )}
          <span className={styles.cardStatus}>{event.status}</span>
          <span className={styles.cardCta}>
            Expand
            <Maximize2 size={13} aria-hidden="true" />
          </span>
        </span>
        <span className={styles.cardBody}>
          <span className={styles.cardModule}>{event.moduleLabel}</span>
          <span className={styles.cardTitle}>{event.title}</span>
          <span className={styles.cardMeta}>
            <span>{event.when}</span>
            <span className={styles.cardWhere}>{event.where}</span>
          </span>
        </span>
      </button>

      {open && (
        <Sheet
          label={event.title}
          accent={event.accent}
          onClose={() => setOpen(false)}
          footer={
            onNext ? (
              <button
                type="button"
                className={styles.sheetNext}
                onClick={onNext}
              >
                Next event →
              </button>
            ) : undefined
          }
        >
          <div className={styles.sheetGrid}>
            <div className={styles.sheetMedia}>
              {event.poster && (
                <FocalImage
                  src={event.poster}
                  focalPoint={event.posterFocalPoint}
                  alt=""
                  width={720}
                  height={900}
                  sizes="360px"
                  className={styles.sheetPoster}
                />
              )}
            </div>

            <div className={styles.sheetBody}>
              <p className={styles.sheetKicker}>
                <span className={styles.sheetStatus}>{event.status}</span>
                <span style={{ color: event.accent }}>{event.moduleLabel}</span>
              </p>
              <h2 className={styles.sheetTitle}>{event.title}</h2>
              {event.shortDescription && (
                <p className={styles.sheetDescription}>
                  {event.shortDescription}
                </p>
              )}

              <dl className={styles.sheetFacts}>
                {facts.map((fact) => (
                  <div key={fact.label} className={styles.sheetFact}>
                    <dt>{fact.label}</dt>
                    <dd>{fact.value}</dd>
                  </div>
                ))}
              </dl>

              {event.tags.length > 0 && (
                <div className={styles.sheetTags}>
                  <span className={styles.sheetTagsLabel}>Tags</span>
                  {event.tags.map((tag) => (
                    <span key={tag} className={styles.sheetTag}>
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              <Link
                href={`/events/${event.slug}`}
                className={styles.sheetAction}
              >
                Full event page
                <ArrowRight size={14} aria-hidden="true" />
              </Link>
            </div>
          </div>
        </Sheet>
      )}
    </>
  );
}
