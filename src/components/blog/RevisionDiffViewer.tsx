"use client";

import { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  FileDiff,
  Tag as IconTag,
  Type as IconType,
  FileText as IconFileText,
  Image as IconImage,
} from "lucide-react";
import styles from "./RevisionDiffViewer.module.scss";

export interface DiffLine {
  type: "added" | "removed" | "unchanged";
  text: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

export function computeLineDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText ? oldText.split("\n") : [];
  const newLines = newText ? newText.split("\n") : [];
  const m = oldLines.length;
  const n = newLines.length;

  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array(n + 1).fill(0),
  );

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const diff: DiffLine[] = [];
  let i = m;
  let j = n;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      diff.unshift({
        type: "unchanged",
        text: oldLines[i - 1],
        oldLineNumber: i,
        newLineNumber: j,
      });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      diff.unshift({
        type: "added",
        text: newLines[j - 1],
        newLineNumber: j,
      });
      j--;
    } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
      diff.unshift({
        type: "removed",
        text: oldLines[i - 1],
        oldLineNumber: i,
      });
      i--;
    }
  }

  return diff;
}

interface RevisionDiffViewerProps {
  livePost: {
    title: string;
    content: string;
    excerpt?: string;
    tags?: string[];
    coverImage?: string;
  };
  revision: {
    title?: string;
    content?: string;
    excerpt?: string;
    tags?: string[];
    coverImage?: string;
  };
}

export default function RevisionDiffViewer({
  livePost,
  revision,
}: RevisionDiffViewerProps) {
  const [showContentDiff, setShowContentDiff] = useState(true);

  const titleChanged =
    revision.title !== undefined && revision.title !== livePost.title;
  const excerptChanged =
    revision.excerpt !== undefined &&
    revision.excerpt !== (livePost.excerpt || "");
  const coverImageChanged =
    revision.coverImage !== undefined &&
    revision.coverImage !== (livePost.coverImage || "");

  const liveTags = livePost.tags || [];
  const revTags = revision.tags !== undefined ? revision.tags : liveTags;
  const tagsChanged =
    liveTags.length !== revTags.length ||
    liveTags.some((t) => !revTags.includes(t)) ||
    revTags.some((t) => !liveTags.includes(t));

  const oldContent = livePost.content || "";
  const newContent =
    revision.content !== undefined ? revision.content : oldContent;
  const contentChanged = oldContent !== newContent;

  const diffLines = useMemo(() => {
    if (!contentChanged) return [];
    return computeLineDiff(oldContent, newContent);
  }, [oldContent, newContent, contentChanged]);

  const addedCount = diffLines.filter((l) => l.type === "added").length;
  const removedCount = diffLines.filter((l) => l.type === "removed").length;

  const totalChanges =
    (titleChanged ? 1 : 0) +
    (excerptChanged ? 1 : 0) +
    (tagsChanged ? 1 : 0) +
    (coverImageChanged ? 1 : 0) +
    (contentChanged ? 1 : 0);

  return (
    <div className={styles.diffContainer}>
      <div className={styles.header}>
        <div className={styles.titleArea}>
          <FileDiff width={18} height={18} className={styles.icon} />
          <span className={styles.title}>Revision Changes Diff</span>
          <span className={styles.summaryBadge}>
            {totalChanges} field{totalChanges === 1 ? "" : "s"} modified
          </span>
          {contentChanged && (
            <span className={styles.statsBadge}>
              <span className={styles.added}>+{addedCount}</span> /{" "}
              <span className={styles.removed}>-{removedCount}</span> lines
            </span>
          )}
        </div>
      </div>

      {/* Metadata changes */}
      <div className={styles.metaChanges}>
        {titleChanged && (
          <div className={styles.metaItem}>
            <div className={styles.metaLabel}>
              <IconType width={14} height={14} /> Title
            </div>
            <div className={styles.metaComparison}>
              <div className={styles.metaOld}>
                <span className={styles.prefix}>Live:</span> {livePost.title}
              </div>
              <div className={styles.metaNew}>
                <span className={styles.prefix}>Proposed:</span> {revision.title}
              </div>
            </div>
          </div>
        )}

        {excerptChanged && (
          <div className={styles.metaItem}>
            <div className={styles.metaLabel}>
              <IconFileText width={14} height={14} /> Excerpt
            </div>
            <div className={styles.metaComparison}>
              <div className={styles.metaOld}>
                <span className={styles.prefix}>Live:</span>{" "}
                {livePost.excerpt || "(none)"}
              </div>
              <div className={styles.metaNew}>
                <span className={styles.prefix}>Proposed:</span>{" "}
                {revision.excerpt || "(none)"}
              </div>
            </div>
          </div>
        )}

        {tagsChanged && (
          <div className={styles.metaItem}>
            <div className={styles.metaLabel}>
              <IconTag width={14} height={14} /> Tags
            </div>
            <div className={styles.metaComparison}>
              <div className={styles.metaOld}>
                <span className={styles.prefix}>Live:</span>{" "}
                {liveTags.join(", ") || "(none)"}
              </div>
              <div className={styles.metaNew}>
                <span className={styles.prefix}>Proposed:</span>{" "}
                {revTags.join(", ") || "(none)"}
              </div>
            </div>
          </div>
        )}

        {coverImageChanged && (
          <div className={styles.metaItem}>
            <div className={styles.metaLabel}>
              <IconImage width={14} height={14} /> Cover Image
            </div>
            <div className={styles.metaComparison}>
              <div className={styles.metaOld}>
                <span className={styles.prefix}>Live:</span>{" "}
                {livePost.coverImage || "(none)"}
              </div>
              <div className={styles.metaNew}>
                <span className={styles.prefix}>Proposed:</span>{" "}
                {revision.coverImage || "(none)"}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Content Markdown Diff */}
      {contentChanged && (
        <div className={styles.contentDiffSection}>
          <button
            type="button"
            className={styles.toggleContentDiffBtn}
            onClick={() => setShowContentDiff((prev) => !prev)}
          >
            <span>Markdown Content Changes</span>
            {showContentDiff ? (
              <ChevronUp width={16} height={16} />
            ) : (
              <ChevronDown width={16} height={16} />
            )}
          </button>

          {showContentDiff && (
            <div className={styles.diffViewer}>
              <div className={styles.diffLines}>
                {diffLines.map((line, idx) => (
                  <div
                    key={idx}
                    className={`${styles.diffLine} ${
                      line.type === "added"
                        ? styles.lineAdded
                        : line.type === "removed"
                          ? styles.lineRemoved
                          : styles.lineUnchanged
                    }`}
                  >
                    <span className={styles.lineOldNum}>
                      {line.oldLineNumber !== undefined
                        ? line.oldLineNumber
                        : ""}
                    </span>
                    <span className={styles.lineNewNum}>
                      {line.newLineNumber !== undefined
                        ? line.newLineNumber
                        : ""}
                    </span>
                    <span className={styles.linePrefix}>
                      {line.type === "added"
                        ? "+"
                        : line.type === "removed"
                          ? "-"
                          : " "}
                    </span>
                    <pre className={styles.lineText}>{line.text || " "}</pre>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {!contentChanged &&
        !titleChanged &&
        !excerptChanged &&
        !tagsChanged &&
        !coverImageChanged && (
          <p className={styles.noChanges}>
            No field differences detected between live post and revision.
          </p>
        )}
    </div>
  );
}
