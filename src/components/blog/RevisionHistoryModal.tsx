"use client";

import { LoaderCircle, RotateCcw } from "lucide-react";
import { useState } from "react";

import { expectAppData } from "@/lib/api/result";
import type { EditableBlogPost } from "@/lib/blog/types";
import {
  BLOG_EDITOR_API_PREFIXES,
  BLOG_REVISION_SOURCE_LABELS,
  type BlogEditorMode,
} from "@/lib/constants";
import { formatDateTime } from "@/lib/utils";
import Button from "@/components/shared/Button";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import EmptyState from "@/components/shared/EmptyState";
import InlineNotice from "@/components/shared/InlineNotice";
import Modal from "@/components/shared/Modal";
import Pagination from "@/components/shared/Pagination";
import SegmentedControl from "@/components/shared/SegmentedControl";

import RevisionDiffViewer from "./RevisionDiffViewer";
import { useRevisionHistory } from "./useRevisionHistory";
import styles from "./RevisionHistoryModal.module.scss";

interface RevisionHistoryModalProps {
  onClose: () => void;
  slug: string;
  livePost: EditableBlogPost;
  mode: BlogEditorMode;
  onRestoreSuccess: (post: EditableBlogPost) => void;
}

function LoadingState({ children }: { children: string }) {
  return (
    <div className={styles.loadingBox} role="status">
      <LoaderCircle size={20} className={styles.spinner} aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}

export default function RevisionHistoryModal({
  onClose,
  slug,
  livePost,
  mode,
  onRestoreSuccess,
}: RevisionHistoryModalProps) {
  const endpoint = `${BLOG_EDITOR_API_PREFIXES[mode]}/${encodeURIComponent(slug)}/revisions`;
  const history = useRevisionHistory(endpoint);
  const [restoreVersion, setRestoreVersion] = useState<number | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState("");
  const isAdmin = mode === "admin";
  const restoreLabel = isAdmin ? "Restore to live" : "Load into draft";
  const {
    list,
    selectedVersion,
    selectedRevision,
    previousRevision,
    compareMode,
  } = history;

  async function handleRestore() {
    if (restoreVersion === null) return;
    setRestoring(true);
    setRestoreError("");
    try {
      const response = await fetch(`${endpoint}/${restoreVersion}/restore`, {
        method: "POST",
      });
      const data = await expectAppData<{ post: EditableBlogPost }>(response);
      onRestoreSuccess(data.post);
      onClose();
    } catch (error) {
      setRestoreError(
        error instanceof Error ? error.message : "Failed to restore revision.",
      );
      setRestoreVersion(null);
    } finally {
      setRestoring(false);
    }
  }

  // Replace the history dialog while confirming so only one focus trap is active
  if (restoreVersion !== null) {
    return (
      <ConfirmDialog
        title={
          isAdmin
            ? `Restore version ${restoreVersion} to live?`
            : `Load version ${restoreVersion} into draft?`
        }
        description={
          isAdmin
            ? "The live article will be replaced with this version. A new rollback snapshot will be recorded in history."
            : "This version will replace the saved staged draft. You can edit it and request approval before publishing."
        }
        confirmLabel={restoreLabel}
        busyLabel={isAdmin ? "Restoring…" : "Loading…"}
        variant={isAdmin ? "danger" : "primary"}
        busy={restoring}
        onCancel={() => setRestoreVersion(null)}
        onConfirm={() => void handleRestore()}
      />
    );
  }

  return (
    <Modal
      kicker="Blog editor"
      title="Revision history"
      description={livePost.title}
      onClose={onClose}
      maxWidth={1120}
    >
      {restoreError && <InlineNotice tone="error">{restoreError}</InlineNotice>}
      <div className={styles.container}>
        <aside className={styles.timelinePane} aria-label="Revision history">
          <div className={styles.timelineHeader}>
            <h3>Versions</h3>
            {list && (
              <span className={styles.metadata}>
                {list.pagination.total} recorded
              </span>
            )}
          </div>
          {history.loadingList && (
            <LoadingState>Loading revisions…</LoadingState>
          )}
          {history.listError && (
            <>
              <InlineNotice tone="error">{history.listError}</InlineNotice>
              <Button size="small" onClick={history.retryList}>
                Try again
              </Button>
            </>
          )}
          {list && list.revisions.length === 0 && (
            <EmptyState title="No recorded revisions" />
          )}
          {list && list.revisions.length > 0 && (
            <ol className={styles.revisionList}>
              {list.revisions.map((revision, index) => (
                <li key={revision.version}>
                  <button
                    type="button"
                    className={`${styles.revisionItem} ${selectedVersion === revision.version ? styles.selected : ""}`}
                    aria-pressed={selectedVersion === revision.version}
                    onClick={() => history.selectVersion(revision.version)}
                  >
                    <span className={styles.itemHeader}>
                      <span className={styles.versionTag}>
                        v{revision.version}
                      </span>
                      {history.page === 1 && index === 0 && (
                        <span className={styles.liveBadge}>Latest</span>
                      )}
                    </span>
                    <span
                      className={`${styles.sourceBadge} ${styles[revision.source] || ""}`}
                    >
                      {BLOG_REVISION_SOURCE_LABELS[revision.source]}
                    </span>
                    <span className={styles.editorInfo}>
                      By {revision.editor.name}
                    </span>
                    {revision.approvedBy && (
                      <span className={styles.metadata}>
                        Approved by {revision.approvedBy.name}
                      </span>
                    )}
                    <time
                      className={styles.metadata}
                      dateTime={revision.createdAt}
                    >
                      {formatDateTime(revision.createdAt)}
                    </time>
                    {revision.changeSummary && (
                      <span className={styles.summaryText}>
                        {revision.changeSummary}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ol>
          )}
          {list && (
            <Pagination
              page={history.page}
              totalPages={list.pagination.totalPages}
              onPageChange={history.setPage}
              maxVisible={3}
              ariaLabel="Revision pages"
            />
          )}
        </aside>

        <section className={styles.detailPane} aria-label="Revision content">
          {selectedVersion !== null && (
            <>
              <header className={styles.detailHeader}>
                <div className={styles.detailInfo}>
                  <h3>Version {selectedVersion}</h3>
                  {selectedRevision && <p>{selectedRevision.title}</p>}
                  {selectedRevision && selectedRevision.authors.length > 0 && (
                    <p>
                      Authors:{" "}
                      {selectedRevision.authors
                        .map((author) => author.name)
                        .join(", ")}
                    </p>
                  )}
                </div>
                <Button
                  variant={isAdmin ? "danger" : "primary"}
                  size="small"
                  disabled={
                    !selectedRevision ||
                    history.loadingVersion ||
                    Boolean(history.versionError)
                  }
                  onClick={() => setRestoreVersion(selectedVersion)}
                >
                  <RotateCcw size={14} aria-hidden="true" /> {restoreLabel}
                </Button>
              </header>
              <div className={styles.comparisonControls}>
                <SegmentedControl
                  label="Comparison mode"
                  segments={[
                    {
                      label: "Live",
                      active: compareMode === "live",
                      onClick: () => history.setCompareMode("live"),
                    },
                    ...(selectedVersion > 1
                      ? [
                          {
                            label: `Previous (v${selectedVersion - 1})`,
                            active: compareMode === "previous",
                            onClick: () => history.setCompareMode("previous"),
                          },
                        ]
                      : []),
                    {
                      label: "Markdown",
                      active: compareMode === "raw",
                      onClick: () => history.setCompareMode("raw"),
                    },
                  ]}
                />
              </div>
              {history.versionError && (
                <>
                  <InlineNotice tone="error">
                    {history.versionError}
                  </InlineNotice>
                  <Button size="small" onClick={history.retryVersion}>
                    Try again
                  </Button>
                </>
              )}
              {history.loadingVersion && (
                <LoadingState>Loading version content…</LoadingState>
              )}
              {!history.loadingVersion &&
                !history.versionError &&
                selectedRevision && (
                  <div className={styles.diffArea}>
                    {compareMode === "raw" ? (
                      <pre className={styles.rawContent}>
                        <code>
                          {selectedRevision.content || "(empty post)"}
                        </code>
                      </pre>
                    ) : (
                      <RevisionDiffViewer
                        livePost={
                          compareMode === "previous" && previousRevision
                            ? previousRevision
                            : livePost
                        }
                        revision={selectedRevision}
                        baseLabel={
                          compareMode === "previous"
                            ? `v${selectedVersion - 1}`
                            : "Live"
                        }
                        compareLabel={`v${selectedVersion}`}
                        title={
                          compareMode === "previous"
                            ? `Version ${selectedVersion - 1} → ${selectedVersion}`
                            : `Live → version ${selectedVersion}`
                        }
                      />
                    )}
                  </div>
                )}
            </>
          )}
        </section>
      </div>
    </Modal>
  );
}
