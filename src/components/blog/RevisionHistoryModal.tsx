"use client";

import {
  Clock as IconClock,
  RotateCcw as IconRotateCcw,
} from "lucide-react";
import { useEffect, useState } from "react";

import RevisionDiffViewer from "@/components/blog/RevisionDiffViewer";
import Button from "@/components/shared/Button";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import Modal from "@/components/shared/Modal";
import { expectAppData } from "@/lib/api/result";
import type {
  BlogRevisionDto,
  BlogRevisionSummaryDto,
} from "@/lib/blog/revisions";
import type { ImageFocalPoint } from "@/lib/imageFocalPoint";
import { formatDateTime } from "@/lib/utils";

import styles from "./RevisionHistoryModal.module.scss";

interface LivePostData {
  title: string;
  content: string;
  excerpt?: string;
  coverImage?: string;
  coverFocalPoint?: ImageFocalPoint;
  tags?: string[];
}

interface RevisionHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  slug: string;
  livePost: LivePostData;
  endpointPrefix: "/api/admin/blog" | "/api/internal/blog";
  userRole: "admin" | "author";
  onRestoreSuccess?: (post: any) => void;
}

type CompareMode = "live" | "previous" | "raw";

export default function RevisionHistoryModal({
  isOpen,
  onClose,
  slug,
  livePost,
  endpointPrefix,
  userRole,
  onRestoreSuccess,
}: RevisionHistoryModalProps) {
  const [revisions, setRevisions] = useState<BlogRevisionSummaryDto[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const [versionCache, setVersionCache] = useState<
    Record<number, BlogRevisionDto>
  >({});
  const [loadingVersion, setLoadingVersion] = useState(false);
  const [compareMode, setCompareMode] = useState<CompareMode>("live");
  const [restoreConfirmOpen, setRestoreConfirmOpen] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState("");

  // Fetch revisions list when modal opens
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;

    async function loadList() {
      setLoadingList(true);
      setError("");
      try {
        const response = await fetch(`${endpointPrefix}/${slug}/revisions`);
        const data = await expectAppData(response);
        if (!cancelled) {
          const list: BlogRevisionSummaryDto[] = data.revisions || [];
          setRevisions(list);
          if (list.length > 0) {
            setSelectedVersion(list[0].version);
          }
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load revisions.",
          );
        }
      } finally {
        if (!cancelled) setLoadingList(false);
      }
    }

    void loadList();
    return () => {
      cancelled = true;
    };
  }, [isOpen, endpointPrefix, slug]);

  // Fetch full details for selected version and previous version if needed
  useEffect(() => {
    if (!isOpen || selectedVersion === null) return;
    const currentVersion = selectedVersion;
    let cancelled = false;

    async function loadVersionDetails() {
      const neededVersions: number[] = [currentVersion];
      if (compareMode === "previous" && currentVersion > 1) {
        neededVersions.push(currentVersion - 1);
      }

      const missingVersions = neededVersions.filter((v) => !versionCache[v]);
      if (missingVersions.length === 0) return;

      setLoadingVersion(true);
      try {
        const results = await Promise.all(
          missingVersions.map(async (v) => {
            const res = await fetch(
              `${endpointPrefix}/${slug}/revisions?version=${v}`,
            );
            const data = await expectAppData(res);
            return { version: v, data: data.revision as BlogRevisionDto };
          }),
        );

        if (!cancelled) {
          setVersionCache((prev) => {
            const updated = { ...prev };
            for (const item of results) {
              updated[item.version] = item.data;
            }
            return updated;
          });
        }
      } catch {
        if (!cancelled) {
          setError("Failed to load revision content.");
        }
      } finally {
        if (!cancelled) setLoadingVersion(false);
      }
    }

    void loadVersionDetails();
    return () => {
      cancelled = true;
    };
  }, [isOpen, selectedVersion, compareMode, endpointPrefix, slug, versionCache]);

  if (!isOpen) return null;

  const selectedRev =
    selectedVersion !== null ? versionCache[selectedVersion] : null;
  const previousRev =
    selectedVersion !== null && selectedVersion > 1
      ? versionCache[selectedVersion - 1]
      : null;

  const handleRestore = async () => {
    if (selectedVersion === null) return;
    setRestoring(true);
    try {
      const response = await fetch(
        `${endpointPrefix}/${slug}/revisions/${selectedVersion}/restore`,
        { method: "POST" },
      );
      const data = await expectAppData(response);
      setRestoreConfirmOpen(false);
      onRestoreSuccess?.(data.post);
      onClose();
    } catch {
      setError("Failed to restore revision.");
      setRestoreConfirmOpen(false);
    } finally {
      setRestoring(false);
    }
  };

  const getSourceLabel = (source: string) => {
    switch (source) {
      case "initial_publish":
        return "Initial Publish";
      case "admin_edit":
        return "Admin Edit";
      case "approved_revision":
        return "Approved Edit";
      case "rollback":
        return "Rollback";
      default:
        return source;
    }
  };

  return (
    <Modal
      kicker="Blog Revisions"
      title={`Revision History: ${livePost.title}`}
      description="Inspect chronological versions, compare changes, or restore earlier states."
      onClose={onClose}
      maxWidth={1120}
    >
      <div className={styles.container}>
        {/* Left Timeline Pane */}
        <aside className={styles.timelinePane} aria-label="Revisions timeline">
          <div className={styles.timelineHeader}>
            <h3>Timeline</h3>
            <span className={styles.countBadge}>
              {revisions.length} revision{revisions.length === 1 ? "" : "s"}
            </span>
          </div>

          {loadingList && (
            <div className={styles.loadingBox}>
              <div className={styles.spinner} />
              <span>Loading revisions…</span>
            </div>
          )}

          {!loadingList && revisions.length === 0 && (
            <div className={styles.emptyBox}>
              <IconClock width={24} height={24} />
              <span>No recorded revisions.</span>
            </div>
          )}

          {!loadingList && revisions.length > 0 && (
            <div className={styles.revisionList} role="tablist">
              {revisions.map((rev, index) => {
                const isSelected = selectedVersion === rev.version;
                const isLive = index === 0;

                return (
                  <button
                    key={rev.version}
                    type="button"
                    role="tab"
                    aria-selected={isSelected}
                    className={`${styles.revisionItem} ${isSelected ? styles.selected : ""}`}
                    onClick={() => setSelectedVersion(rev.version)}
                  >
                    <div className={styles.itemHeader}>
                      <span className={styles.versionTag}>
                        v{rev.version}
                      </span>
                      <span
                        className={`${styles.sourceBadge} ${styles[rev.source] || ""}`}
                      >
                        {getSourceLabel(rev.source)}
                      </span>
                      {isLive && (
                        <span className={styles.liveBadge}>Live</span>
                      )}
                    </div>

                    <div className={styles.metaRow}>
                      <span className={styles.editorInfo}>
                        By {rev.editor.name}
                      </span>
                      {rev.approvedBy && (
                        <span className={styles.approverInfo}>
                          Approved by {rev.approvedBy.name}
                        </span>
                      )}
                      <time className={styles.timeInfo}>
                        {formatDateTime(rev.createdAt)}
                      </time>
                    </div>

                    {rev.changeSummary && (
                      <div
                        className={styles.summaryText}
                        title={rev.changeSummary}
                      >
                        &ldquo;{rev.changeSummary}&rdquo;
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </aside>

        {/* Right Detail / Diff Pane */}
        <section className={styles.detailPane} aria-label="Revision content">
          {error && <p className={styles.errorText}>{error}</p>}

          {selectedVersion !== null && (
            <>
              <header className={styles.detailHeader}>
                <div className={styles.detailInfo}>
                  <h4>Version {selectedVersion}</h4>
                  {selectedRev && (
                    <span className={styles.countBadge}>
                      {selectedRev.title}
                    </span>
                  )}
                </div>

                <div className={styles.detailActions}>
                  <div
                    className={styles.modeSelector}
                    role="group"
                    aria-label="Comparison mode"
                  >
                    <button
                      type="button"
                      className={`${styles.modeBtn} ${compareMode === "live" ? styles.active : ""}`}
                      onClick={() => setCompareMode("live")}
                    >
                      Compare with Live
                    </button>
                    {selectedVersion > 1 && (
                      <button
                        type="button"
                        className={`${styles.modeBtn} ${compareMode === "previous" ? styles.active : ""}`}
                        onClick={() => setCompareMode("previous")}
                      >
                        vs Previous (v{selectedVersion - 1})
                      </button>
                    )}
                    <button
                      type="button"
                      className={`${styles.modeBtn} ${compareMode === "raw" ? styles.active : ""}`}
                      onClick={() => setCompareMode("raw")}
                    >
                      Raw Markdown
                    </button>
                  </div>

                  {userRole === "admin" ? (
                    <Button
                      variant="danger"
                      size="small"
                      onClick={() => setRestoreConfirmOpen(true)}
                    >
                      <IconRotateCcw width={14} height={14} /> Restore to Live
                    </Button>
                  ) : (
                    <Button
                      variant="primary"
                      size="small"
                      onClick={() => setRestoreConfirmOpen(true)}
                    >
                      <IconRotateCcw width={14} height={14} /> Load into Draft
                    </Button>
                  )}
                </div>
              </header>

              <div className={styles.diffScrollArea}>
                {loadingVersion && (
                  <div className={styles.loadingBox}>
                    <div className={styles.spinner} />
                    <span>Loading version content…</span>
                  </div>
                )}

                {!loadingVersion && selectedRev && (
                  <>
                    {compareMode === "live" && (
                      <RevisionDiffViewer
                        livePost={livePost}
                        revision={selectedRev}
                        baseLabel="Live"
                        compareLabel={`v${selectedRev.version}`}
                        title={`Differences: Live vs Version ${selectedRev.version}`}
                      />
                    )}

                    {compareMode === "previous" && previousRev && (
                      <RevisionDiffViewer
                        livePost={previousRev}
                        revision={selectedRev}
                        baseLabel={`v${previousRev.version}`}
                        compareLabel={`v${selectedRev.version}`}
                        title={`Differences: Version ${previousRev.version} → Version ${selectedRev.version}`}
                      />
                    )}

                    {compareMode === "raw" && (
                      <pre className={styles.rawContent}>
                        <code>{selectedRev.content || "(empty post)"}</code>
                      </pre>
                    )}
                  </>
                )}
              </div>
            </>
          )}
        </section>
      </div>

      {restoreConfirmOpen && selectedVersion !== null && (
        <ConfirmDialog
          title={
            userRole === "admin"
              ? `Restore Version ${selectedVersion} to Live?`
              : `Load Version ${selectedVersion} into Draft Revision?`
          }
          description={
            userRole === "admin"
              ? `The live article will be reverted to match Version ${selectedVersion} immediately, and a new rollback version will be recorded in history.`
              : `Version ${selectedVersion} will be loaded into your staged draft. You can continue editing it and submit for review. The live article will not change.`
          }
          confirmLabel={
            userRole === "admin"
              ? "Restore to Live"
              : "Load into Draft"
          }
          busyLabel={
            userRole === "admin" ? "Restoring…" : "Loading…"
          }
          variant={userRole === "admin" ? "danger" : "primary"}
          busy={restoring}
          onCancel={() => setRestoreConfirmOpen(false)}
          onConfirm={() => void handleRestore()}
        />
      )}
    </Modal>
  );
}
