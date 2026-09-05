"use client";

import { ArrowUpRight, Download } from "lucide-react";

import {
  recruitmentDocumentUrl,
  type RecruitmentDocumentDto,
} from "@/lib/recruitment";

import Modal from "@/components/shared/Modal";

import styles from "./Recruitment.module.scss";

export default function RecruitmentViewer({
  document,
  title,
  onClose,
}: {
  document: RecruitmentDocumentDto;
  title: string;
  onClose: () => void;
}) {
  const url = recruitmentDocumentUrl(document._id);
  return (
    <Modal
      kicker="Coding Week"
      title={title}
      description={
        <>
          {document.originalName}
          <span className={styles.viewerHint}>
            If the preview is unavailable, open or download the document.
          </span>
        </>
      }
      onClose={onClose}
      maxWidth={1120}
      className={styles.viewer}
      contentClassName={styles.viewerContent}
      footer={
        <>
          <a
            className={styles.viewerLink}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
          >
            <ArrowUpRight size={16} aria-hidden="true" />
            Open PDF
          </a>
          <a className={styles.viewerLink} href={`${url}?download=1`}>
            <Download size={16} aria-hidden="true" />
            Download
          </a>
        </>
      }
    >
      <iframe src={url} title={title} className={styles.pdfFrame} />
    </Modal>
  );
}
