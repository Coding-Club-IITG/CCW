import { ArrowUpRight, Maximize2 } from "lucide-react";
import type { ImageFocalPoint } from "@/lib/imageFocalPoint";
import FocalImage from "@/components/shared/FocalImage";
import { IconGithub } from "@/components/shared/Icons";
import ProjectSheet, { type ProjectSheetData } from "./ProjectSheet";
import styles from "./Projects.module.scss";

export type ProjectRowData = ProjectSheetData & {
  id: string;
  index: string;
  coverImage?: string;
  coverFocalPoint?: ImageFocalPoint;
};

/**
 * Project row + expand sheet
 */
export default function ProjectRow({ project }: { project: ProjectRowData }) {
  const accentStyle = { "--accent": project.accent } as React.CSSProperties;

  return (
    <div className={styles.row} style={accentStyle}>
      <div className={styles.rowBody}>
        <p className={styles.rowKicker}>
          <span className={styles.rowIndex}>{project.index}</span>
          <span className={styles.module}>{project.moduleLabel}</span>
          <span className={styles.rowStatus}>{project.status}</span>
        </p>

        <h2 className={styles.rowTitle}>{project.title}</h2>
        <p className={styles.rowDescription}>{project.description}</p>

        {project.stack.length > 0 && (
          <div className={styles.stack}>
            {project.stack.map((item) => (
              <span key={item} className={styles.stackItem}>
                {item}
              </span>
            ))}
          </div>
        )}

        <div className={styles.rowActions}>
          {project.liveUrl && (
            <a
              className={styles.liveLink}
              href={project.liveUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              {project.liveLabel}
              <ArrowUpRight size={12} aria-hidden="true" />
            </a>
          )}
          <a
            className={styles.sourceLink}
            href={project.repoLink}
            target="_blank"
            rel="noopener noreferrer"
          >
            <IconGithub width={13} height={13} aria-hidden="true" />
            Source
          </a>
          <span className={styles.rowMeta}>since {project.since}</span>
          {project.contributorCount > 0 && (
            <span className={styles.rowMetaDim}>
              {project.contributorCount} on it
            </span>
          )}
        </div>
      </div>

      <ProjectSheet project={project} triggerClassName={styles.cover}>
        <span className={styles.coverMedia}>
          {project.coverImage && (
            <FocalImage
              src={project.coverImage}
              focalPoint={project.coverFocalPoint}
              alt=""
              width={800}
              height={500}
              sizes="(max-width: 900px) 100vw, 50vw"
              loading="lazy"
              className={styles.coverImage}
            />
          )}
        </span>
        <span className={styles.coverScrim} aria-hidden="true" />
        <span className={styles.coverCta}>
          Learn more
          <Maximize2 size={12} aria-hidden="true" />
        </span>
      </ProjectSheet>
    </div>
  );
}
