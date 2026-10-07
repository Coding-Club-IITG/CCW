"use client";

import {
  Upload,
  Trash2,
  Edit2,
  Eye,
  Download,
  FileIcon,
  AlertCircle,
  Share2,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { canManageFile } from "@/lib/access/files";
import { appErrorMessage, expectAppData } from "@/lib/api/result";
import { formatShortDate } from "@/lib/shared/dates";
import { normalizeAccessControl } from "@/lib/files/accessControl";
import {
  DEFAULT_FILE_QUERY,
  fileQueryFromParams,
  fileQueryParams,
  type FileQuery,
} from "@/lib/files/query";
import { prepareSearchQuery } from "@/lib/shared/search";
import type { PaginatedResult } from "@/lib/shared/pagination";

import EmptyState from "@/components/shared/EmptyState";
import Pagination from "@/components/shared/Pagination";
import SearchInput from "@/components/shared/SearchInput";
import TagBadge from "@/components/shared/TagBadge";
import { useToast } from "@/components/shared/Toast";
import { useConfirm } from "@/components/shared/useConfirm";
import { TableSkeletonContent } from "@/components/shared/skeletons/TableSkeleton";

import EditModal from "./EditModal";
import FileViewer from "./FileViewer";
import styles from "./FilesClient.module.scss";
import UploadModal from "./UploadModal";
import GroupManager from "./GroupManager";
import ShareModal from "./ShareModal";
import type { AvailableTag, CurrentUser, FileEntry } from "./types";
import { formatBytes, aclSummary } from "./utils";

interface Props {
  currentUser: CurrentUser;
  maxFileUploadBytes: number;
}

export default function FilesClient({
  currentUser,
  maxFileUploadBytes,
}: Props) {
  const params = useSearchParams();
  const router = useRouter();
  const query = useMemo(
    () => fileQueryFromParams(new URLSearchParams(params)),
    [params],
  );
  const { page, search: searchQuery, tag: selectedTags } = query;
  function applyQuery(next: FileQuery) {
    const url = fileQueryParams(next, new URLSearchParams(params));
    router.push("/internal/files" + (url.size ? "?" + url : ""), {
      scroll: false,
    });
  }
  const toast = useToast();
  const { confirm, confirmDialog } = useConfirm();

  // Data
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalPages, setTotalPages] = useState(1);
  const [availableTags, setAvailableTags] = useState<AvailableTag[]>([]);
  const [groupNames, setGroupNames] = useState<Record<string, string>>({});
  const latestRequest = useRef(0);
  const cancelPending = useCallback(() => {
    latestRequest.current++;
  }, []);

  // Toolbar
  const [searchInput, setSearchInput] = useState(searchQuery);
  useEffect(() => {
    setSearchInput(searchQuery);
  }, [searchQuery]);

  // Active modal / viewer
  const [viewFile, setViewFile] = useState<FileEntry | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [editFile, setEditFile] = useState<FileEntry | null>(null);
  const [shareFile, setShareFile] = useState<FileEntry | null>(null);
  const [showGroups, setShowGroups] = useState(false);

  // Data fetching

  const fetchFiles = useCallback(async () => {
    const requestId = ++latestRequest.current;
    setLoading(true);
    setError(null);
    try {
      const params = fileQueryParams(query);
      const res = await fetch(`/api/files?${params}`);
      const data = await expectAppData<
        PaginatedResult<FileEntry> & {
          availableTags: AvailableTag[];
          groupNames: Record<string, string>;
        }
      >(res);
      if (requestId !== latestRequest.current) return;
      setFiles(
        data.items.map((file) => ({
          ...file,
          accessControl: normalizeAccessControl(file.accessControl),
        })),
      );
      setGroupNames(data.groupNames);
      setTotalPages(data.pagination?.totalPages || 1);
      setAvailableTags(data.availableTags || []);
    } catch (error) {
      if (requestId !== latestRequest.current) return;
      setError(appErrorMessage(error, "Network error. Please try again."));
    } finally {
      if (requestId === latestRequest.current) setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    void fetchFiles();
    return cancelPending;
  }, [fetchFiles, cancelPending]);

  // Delete

  async function handleDelete(file: FileEntry) {
    const confirmed = await confirm({
      title: "Delete this file?",
      description: `"${file.title}" will be permanently removed from the server. This cannot be undone.`,
      confirmLabel: "Delete file",
    });
    if (!confirmed) return;

    try {
      const res = await fetch(`/api/files/${file._id}`, { method: "DELETE" });
      await expectAppData(res);
      fetchFiles();
    } catch (error) {
      toast.error(appErrorMessage(error, "Network error. Please try again."));
    }
  }

  const existingTags = availableTags.map(({ tag }) => tag);
  const hasFilters = Boolean(searchQuery.trim() || selectedTags.length);
  const isSelectedTag = (tag: string) =>
    selectedTags.some(
      (selected) => selected.toLowerCase() === tag.toLowerCase(),
    );

  function toggleTag(tag: string) {
    applyQuery({
      ...query,
      page: 1,
      tag: isSelectedTag(tag)
        ? selectedTags.filter(
            (selected) => selected.toLowerCase() !== tag.toLowerCase(),
          )
        : [...selectedTags, tag],
    });
  }

  function clearFilters() {
    setSearchInput("");
    applyQuery({ ...DEFAULT_FILE_QUERY, limit: query.limit });
  }

  // Render

  return (
    <div>
      {/* Header */}
      <div className={styles.header}>
        <div>
          <h1>Internal Files</h1>
          <p>Shared resources, documentation, and module-specific files.</p>
        </div>
        {currentUser.canUpload && (
          <div className={styles.headerActions}>
            <button
              type="button"
              className={styles.secondaryBtn}
              onClick={() => setShowGroups(true)}
            >
              <Users size={15} /> Manage groups
            </button>
            <button
              className={styles.toolbarPrimaryBtn}
              onClick={() => setShowUpload(true)}
            >
              <Upload size={15} /> Upload File
            </button>
          </div>
        )}
      </div>

      {/* Toolbar */}
      <div className={styles.toolbar}>
        <SearchInput
          placeholder="Search files…"
          value={searchInput}
          onChange={setSearchInput}
          onSearch={(value) => {
            const search = prepareSearchQuery(value)?.query ?? "";
            setSearchInput(search);
            applyQuery({ ...query, search, page: 1 });
          }}
          className={styles.searchBox}
        />

        {availableTags.length > 0 && (
          <div className={styles.tagFilters} aria-label="Filter files by tag">
            {availableTags.map(({ tag, count }) => (
              <TagBadge
                key={tag.toLowerCase()}
                tag={tag}
                count={count}
                active={isSelectedTag(tag)}
                ariaLabel={`${isSelectedTag(tag) ? "Remove" : "Add"} ${tag} filter, ${count} files`}
                disabled={!isSelectedTag(tag) && selectedTags.length >= 10}
                onClick={() => toggleTag(tag)}
              />
            ))}
          </div>
        )}

        {hasFilters && (
          <div className={styles.selectedFilters} aria-live="polite">
            <span>
              {selectedTags.length
                ? `Selected tags: ${selectedTags.join(", ")}`
                : "Search filter active"}
            </span>
            <button type="button" onClick={clearFilters}>
              Clear filters
            </button>
          </div>
        )}
      </div>

      {/* File Table */}
      {loading ? (
        <TableSkeletonContent label="files" columns={7} />
      ) : error ? (
        <div className={styles.errorState}>
          <AlertCircle size={18} /> {error}
        </div>
      ) : files.length === 0 ? (
        <EmptyState
          title={
            hasFilters
              ? "No files match the selected filters."
              : "No files here yet."
          }
        />
      ) : (
        <>
          <div className={styles.tableContainer}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Tags</th>
                  <th>Uploaded By</th>
                  <th>Date</th>
                  <th>Size</th>
                  <th>Access</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {files.map((file) => {
                  const canManage = canManageFile(
                    currentUser.id,
                    currentUser.access,
                    currentUser.modules,
                    file,
                  );
                  return (
                    <tr key={file._id}>
                      <td>
                        <div className={styles.fileTitle}>
                          <FileIcon size={15} className={styles.fileIcon} />
                          <div>
                            <span className={styles.fileName}>
                              {file.title}
                            </span>
                            {file.description && (
                              <span className={styles.fileDesc}>
                                {file.description}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className={styles.fileTags}>
                          {file.tags.map((tag) => (
                            <TagBadge key={tag.toLowerCase()} tag={tag} />
                          ))}
                        </div>
                      </td>
                      <td className={styles.person}>{file.uploadedByName}</td>
                      <td className={styles.subtle}>
                        {formatShortDate(file.createdAt)}
                      </td>
                      <td className={styles.subtle}>
                        {formatBytes(file.size)}
                      </td>
                      <td>
                        <span
                          className={`${styles.accessBadge} ${
                            file.isDownloadable
                              ? styles.download
                              : styles.viewOnly
                          }`}
                        >
                          {file.isDownloadable ? (
                            <>
                              <Download size={11} /> Download
                            </>
                          ) : (
                            <>
                              <Eye size={11} /> View only
                            </>
                          )}
                        </span>
                        <div className={styles.aclHint}>
                          {aclSummary(file.accessControl, groupNames)}
                        </div>
                      </td>
                      <td>
                        <div className={styles.actions}>
                          {file.isDownloadable ? (
                            <a
                              href={`/api/files/${file._id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={styles.actionBtn}
                              title="Download file"
                            >
                              <Download size={15} />
                            </a>
                          ) : (
                            <button
                              className={styles.actionBtn}
                              title="View file"
                              onClick={() => setViewFile(file)}
                            >
                              <Eye size={15} />
                            </button>
                          )}

                          {canManage && (
                            <>
                              <button
                                type="button"
                                className={styles.actionBtn}
                                title="Share"
                                aria-label={`Share ${file.title}`}
                                onClick={() => setShareFile(file)}
                              >
                                <Share2 size={15} />
                              </button>
                              <button
                                className={styles.actionBtn}
                                title="Edit"
                                onClick={() => setEditFile(file)}
                              >
                                <Edit2 size={15} />
                              </button>
                              <button
                                className={`${styles.actionBtn} ${styles.danger}`}
                                title="Delete"
                                onClick={() => handleDelete(file)}
                              >
                                <Trash2 size={15} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination
            page={page}
            totalPages={totalPages}
            onPageChange={(page) => applyQuery({ ...query, page })}
          />
        </>
      )}

      {/* Modals */}
      {showGroups && (
        <GroupManager
          currentUser={currentUser}
          onClose={() => setShowGroups(false)}
          onChanged={fetchFiles}
        />
      )}
      {shareFile && (
        <ShareModal
          file={shareFile}
          onClose={() => setShareFile(null)}
          onSuccess={() => {
            setShareFile(null);
            toast.success("Sharing settings saved.");
            fetchFiles();
          }}
        />
      )}
      {viewFile && (
        <FileViewer file={viewFile} onClose={() => setViewFile(null)} />
      )}

      {showUpload && (
        <UploadModal
          currentUser={currentUser}
          maxFileUploadBytes={maxFileUploadBytes}
          existingTags={existingTags}
          onSuccess={() => {
            setShowUpload(false);
            fetchFiles();
          }}
          onClose={() => setShowUpload(false)}
        />
      )}

      {editFile && (
        <EditModal
          file={editFile}
          existingTags={existingTags}
          onSuccess={() => {
            setEditFile(null);
            fetchFiles();
          }}
          onClose={() => setEditFile(null)}
        />
      )}
      {confirmDialog}
    </div>
  );
}
