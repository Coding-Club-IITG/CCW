"use client";

import {
  ChevronDown,
  ChevronUp,
  FileDiff,
  FileText as IconFileText,
  Image as IconImage,
  Tag as IconTag,
  Type as IconType,
} from "lucide-react";
import type { ReactNode } from "react";
import { useId, useMemo, useState } from "react";

import type { BlogContent, BlogSnapshot } from "@/lib/blog/types";
import {
  parseImageFocalPoint,
  type ImageFocalPoint,
} from "@/lib/imageFocalPoint";
import FocalImage from "@/components/shared/FocalImage";

import styles from "./RevisionDiffViewer.module.scss";
import { computeLineDiff, prepareLineDiff } from "./revisionDiff";

export { computeLineDiff } from "./revisionDiff";
export type { DiffLine } from "./revisionDiff";

interface RevisionDiffViewerProps {
  livePost: Pick<BlogContent, "title" | "content"> & Partial<BlogSnapshot>;
  revision: Partial<BlogSnapshot>;
  baseLabel?: string;
  compareLabel?: string;
  title?: string;
}

interface FieldChangeProps {
  icon: ReactNode;
  label: string;
  liveValue: string;
  proposedValue: string;
  baseLabel?: string;
  compareLabel?: string;
}

function FieldChange({
  icon,
  label,
  liveValue,
  proposedValue,
  baseLabel = "Live",
  compareLabel = "Proposed",
}: FieldChangeProps) {
  return (
    <div className={styles.metaItem}>
      <div className={styles.metaLabel}>
        {icon} {label}
      </div>
      <div className={styles.metaComparison}>
        <div className={styles.metaOld}>
          <span className={styles.prefix}>{baseLabel}</span>
          <span>{liveValue}</span>
        </div>
        <div className={styles.metaNew}>
          <span className={styles.prefix}>{compareLabel}</span>
          <span>{proposedValue}</span>
        </div>
      </div>
    </div>
  );
}

function sameFocalPoint(a: ImageFocalPoint, b: ImageFocalPoint) {
  return a.x === b.x && a.y === b.y;
}

export default function RevisionDiffViewer({
  livePost,
  revision,
  baseLabel = "Live",
  compareLabel = "Proposed",
  title = "Proposed changes",
}: RevisionDiffViewerProps) {
  const [showContentDiff, setShowContentDiff] = useState(false);
  const titleId = useId();
  const contentDiffId = useId();

  const titleChanged =
    revision.title !== undefined && revision.title !== livePost.title;
  const excerptChanged =
    revision.excerpt !== undefined &&
    revision.excerpt !== (livePost.excerpt || "");

  const liveCoverImage = livePost.coverImage || "";
  const proposedCoverImage = revision.coverImage ?? liveCoverImage;
  const liveFocalPoint = parseImageFocalPoint(livePost.coverFocalPoint);
  const proposedFocalPoint =
    revision.coverFocalPoint === undefined
      ? liveFocalPoint
      : parseImageFocalPoint(revision.coverFocalPoint);
  const coverChanged =
    proposedCoverImage !== liveCoverImage ||
    !sameFocalPoint(proposedFocalPoint, liveFocalPoint);

  const liveTags = livePost.tags || [];
  const proposedTags = revision.tags ?? liveTags;
  const tagsChanged =
    liveTags.length !== proposedTags.length ||
    liveTags.some((tag, index) => tag !== proposedTags[index]);

  const oldContent = livePost.content || "";
  const newContent = revision.content ?? oldContent;
  const contentChanged = oldContent !== newContent;

  const diffLines = useMemo(() => {
    if (!contentChanged) return [];
    return computeLineDiff(oldContent, newContent);
  }, [oldContent, newContent, contentChanged]);

  const addedCount = diffLines.filter((line) => line.type === "added").length;
  const removedCount = diffLines.filter(
    (line) => line.type === "removed",
  ).length;
  const displayDiffLines = useMemo(
    () => prepareLineDiff(diffLines),
    [diffLines],
  );

  const metadataChanged =
    titleChanged || excerptChanged || tagsChanged || coverChanged;
  const totalChanges =
    (titleChanged ? 1 : 0) +
    (excerptChanged ? 1 : 0) +
    (tagsChanged ? 1 : 0) +
    (coverChanged ? 1 : 0) +
    (contentChanged ? 1 : 0);

  return (
    <section className={styles.diffContainer} aria-labelledby={titleId}>
      <header className={styles.header}>
        <div className={styles.titleArea}>
          <FileDiff width={18} height={18} className={styles.icon} />
          <h3 id={titleId} className={styles.title}>
            {title}
          </h3>
          <span className={styles.summaryBadge}>
            {totalChanges} field{totalChanges === 1 ? "" : "s"} modified
          </span>
          {contentChanged && (
            <span className={styles.statsBadge}>
              <span aria-hidden="true">
                <span className={styles.added}>+{addedCount}</span> /{" "}
                <span className={styles.removed}>−{removedCount}</span>
              </span>
              <span className={styles.visuallyHidden}>
                {addedCount} lines added and {removedCount} lines removed
              </span>
            </span>
          )}
        </div>
      </header>

      {metadataChanged && (
        <div className={styles.metaChanges}>
          {titleChanged && (
            <FieldChange
              icon={<IconType width={14} height={14} />}
              label="Title"
              liveValue={livePost.title}
              proposedValue={revision.title || "(none)"}
              baseLabel={baseLabel}
              compareLabel={compareLabel}
            />
          )}

          {excerptChanged && (
            <FieldChange
              icon={<IconFileText width={14} height={14} />}
              label="Excerpt"
              liveValue={livePost.excerpt || "(none)"}
              proposedValue={revision.excerpt || "(none)"}
              baseLabel={baseLabel}
              compareLabel={compareLabel}
            />
          )}

          {tagsChanged && (
            <FieldChange
              icon={<IconTag width={14} height={14} />}
              label="Tags"
              liveValue={liveTags.join(", ") || "(none)"}
              proposedValue={proposedTags.join(", ") || "(none)"}
              baseLabel={baseLabel}
              compareLabel={compareLabel}
            />
          )}

          {coverChanged && (
            <div className={`${styles.metaItem} ${styles.coverItem}`}>
              <div className={styles.metaLabel}>
                <IconImage width={14} height={14} /> Cover
              </div>
              <div className={styles.coverComparison}>
                <div className={styles.coverSide}>
                  <span className={styles.coverLabel}>{baseLabel} crop</span>
                  <div className={styles.coverFrame}>
                    {liveCoverImage ? (
                      <FocalImage
                        className={styles.coverImage}
                        src={liveCoverImage}
                        alt={`${baseLabel} cover preview`}
                        width={640}
                        height={400}
                        focalPoint={liveFocalPoint}
                      />
                    ) : (
                      <span className={styles.coverEmpty}>No cover</span>
                    )}
                  </div>
                </div>
                <div className={styles.coverSide}>
                  <span className={styles.coverLabel}>{compareLabel} crop</span>
                  <div className={styles.coverFrame}>
                    {proposedCoverImage ? (
                      <FocalImage
                        className={styles.coverImage}
                        src={proposedCoverImage}
                        alt={`${compareLabel} cover preview`}
                        width={640}
                        height={400}
                        focalPoint={proposedFocalPoint}
                      />
                    ) : (
                      <span className={styles.coverEmpty}>No cover</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {contentChanged && (
        <div className={styles.contentDiffSection}>
          <button
            type="button"
            className={styles.toggleContentDiffBtn}
            onClick={() => setShowContentDiff((visible) => !visible)}
            aria-expanded={showContentDiff}
            aria-controls={contentDiffId}
          >
            <span>Markdown content</span>
            <span className={styles.toggleSummary}>
              {showContentDiff ? "Hide line diff" : "Show line diff"}
              {showContentDiff ? (
                <ChevronUp width={16} height={16} />
              ) : (
                <ChevronDown width={16} height={16} />
              )}
            </span>
          </button>

          {showContentDiff && (
            <div id={contentDiffId} className={styles.diffViewer}>
              <div className={styles.diffLines} role="list">
                {displayDiffLines.map((line, index) => {
                  const typeClass =
                    line.type === "added"
                      ? styles.lineAdded
                      : line.type === "removed"
                        ? styles.lineRemoved
                        : line.type === "omitted"
                          ? styles.lineOmitted
                          : styles.lineUnchanged;

                  const oldLineNumber =
                    "oldLineNumber" in line ? line.oldLineNumber : undefined;
                  const newLineNumber =
                    "newLineNumber" in line ? line.newLineNumber : undefined;

                  return (
                    <div
                      key={`${line.type}-${oldLineNumber || 0}-${newLineNumber || 0}-${index}`}
                      className={`${styles.diffLine} ${typeClass}`}
                      role="listitem"
                    >
                      <span className={styles.lineOldNum} aria-hidden="true">
                        {oldLineNumber ?? ""}
                      </span>
                      <span className={styles.lineNewNum} aria-hidden="true">
                        {newLineNumber ?? ""}
                      </span>
                      <span className={styles.linePrefix} aria-hidden="true">
                        {line.type === "added"
                          ? "+"
                          : line.type === "removed"
                            ? "−"
                            : " "}
                      </span>
                      <code className={styles.lineText}>
                        {line.text || " "}
                      </code>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {totalChanges === 0 && (
        <p className={styles.noChanges}>
          No field differences detected between {baseLabel} and {compareLabel}.
        </p>
      )}
    </section>
  );
}
