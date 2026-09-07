"use client";

import { ArrowUpRight } from "lucide-react";
import dynamic from "next/dynamic";
import { useState } from "react";

import {
  recruitmentDocumentUrl,
  type RecruitmentSlotDto,
} from "@/lib/recruitment";
import { formatDateTime } from "@/lib/utils";

import styles from "./Recruitment.module.scss";

const RecruitmentViewer = dynamic(() => import("./RecruitmentViewer"));

export default function DocumentCard({
  slot,
  title,
  module,
}: {
  slot: RecruitmentSlotDto;
  title: string;
  module: string;
}) {
  const [viewing, setViewing] = useState(false);
  const content = (
    <>
      <div className={styles.cardTop}>
        {slot.document ? (
          <ArrowUpRight size={18} aria-hidden="true" />
        ) : (
          <span>To be announced</span>
        )}
      </div>
      <div>
        <h4>{title}</h4>
        <span className={styles.cardMeta}>
          {slot.document ? "PDF" : "Not available yet"}
        </span>
      </div>
    </>
  );
  if (!slot.document)
    return (
      <div
        className={`${styles.documentCard} ${styles.unreleased}`}
        aria-label={`${module} ${title}: to be announced`}
      >
        {content}
        {slot.releaseAt && (
          <p className={styles.releaseNote}>
            Scheduled:{" "}
            <time dateTime={slot.releaseAt}>
              {formatDateTime(slot.releaseAt)} IST
            </time>
          </p>
        )}
      </div>
    );
  return (
    <>
      <a
        href={recruitmentDocumentUrl(slot.document._id)}
        className={styles.documentCard}
        aria-label={`Open ${module} ${title} PDF`}
        onClick={(event) => {
          if (
            event.button !== 0 ||
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey
          )
            return;
          event.preventDefault();
          setViewing(true);
        }}
      >
        {content}
      </a>
      {viewing && (
        <RecruitmentViewer
          document={slot.document}
          title={`${title} · ${module}`}
          onClose={() => setViewing(false)}
        />
      )}
    </>
  );
}
