import { ExternalLink as IconExternalLink } from "lucide-react";
import type { ProjectModuleName, ProjectStatus } from "@/lib/constants";
import type { ImageFocalPoint } from "@/lib/imageFocalPoint";
import FocalImage from "@/components/shared/FocalImage";
import StatusBadge from "@/components/shared/StatusBadge";
import TagBadge from "@/components/shared/TagBadge";
import styles from "./ProjectCard.module.scss";

interface ProjectCardProps {
  title: string;
  description: string;
  date: Date;
  module: ProjectModuleName;
  status: ProjectStatus;
  repoLink: string;
  liveUrl?: string;
  coverImage?: string;
  coverFocalPoint?: ImageFocalPoint;
  tags?: string[];
}

function formatMonthYear(date: Date): string {
  return new Date(date).toLocaleDateString("en-IN", {
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
}

export default function ProjectCard({
  title,
  description,
  date,
  module,
  status,
  repoLink,
  liveUrl,
  coverImage,
  coverFocalPoint,
  tags = [],
}: ProjectCardProps) {
  return (
    <article className={styles.card}>
      {coverImage && (
        <div className={styles.coverWrapper}>
          <FocalImage
            src={coverImage}
            focalPoint={coverFocalPoint}
            alt=""
            className={styles.cover}
            width={640}
            height={360}
          />
        </div>
      )}
      <div className={styles.body}>
        <div className={styles.badges}>
          <span className={styles.moduleBadge}>{module}</span>
          <StatusBadge status={status} />
        </div>
        <h2 className={styles.title}>
          <a
            href={repoLink}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.repoLink}
            aria-label={`${title} on GitHub (opens in a new tab)`}
          >
            {title}
          </a>
        </h2>
        <p className={styles.description}>{description}</p>
        {tags.length > 0 && (
          <div className={styles.tags}>
            {tags.map((tag) => (
              <TagBadge key={tag} tag={tag} />
            ))}
          </div>
        )}
        <div className={styles.footer}>
          <time dateTime={new Date(date).toISOString()}>
            {formatMonthYear(date)}
          </time>
          {liveUrl && (
            <a
              href={liveUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.liveLink}
              aria-label={`${title} live site (opens in a new tab)`}
            >
              {liveUrl}
              <IconExternalLink width={13} height={13} aria-hidden="true" />
            </a>
          )}
        </div>
      </div>
    </article>
  );
}
