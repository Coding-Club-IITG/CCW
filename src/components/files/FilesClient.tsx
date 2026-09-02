"use client";

import { appErrorMessage, expectAppData } from "@/lib/api/result";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Upload,
  Trash2,
  Edit2,
  Eye,
  Download,
  FileIcon,
  AlertCircle,
} from "lucide-react";
import EmptyState from "@/components/public/EmptyState";
import Pagination from "@/components/shared/Pagination";
import SearchInput from "@/components/shared/SearchInput";
import TagBadge from "@/components/shared/TagBadge";
import type { AvailableTag, CurrentUser, FileEntry } from "./types";
import { formatBytes, formatDate, aclSummary } from "./utils";
import { canManageFile } from "@/lib/access/files";
import FileViewer from "./FileViewer";
import UploadModal from "./UploadModal";
import EditModal from "./EditModal";
import styles from "./FilesClient.module.scss";

interface Props {
  currentUser: CurrentUser;
}

export default function FilesClient({ currentUser }: Props) {
  // Data
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [availableTags, setAvailableTags] = useState<AvailableTag[]>([]);
  const latestRequest = useRef(0);

  // Toolbar
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  // Active modal / viewer
  const [viewFile, setViewFile] = useState<FileEntry | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [editFile, setEditFile] = useState<FileEntry | null>(null);

  // Data fetching

  const fetchFiles = useCallback(async () => {
    const requestId = ++latestRequest.current;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "30" });
      if (searchQuery.trim()) params.set("search", searchQuery);
      selectedTags.forEach((tag) => params.append("tag", tag));
      const res = await fetch(`/api/files?${params}`);
      const data = await expectAppData(res);
      if (requestId !== latestRequest.current) return;
      setFiles(data.items || []);
      setTotalPages(data.pagination?.totalPages || 1);
      setAvailableTags(data.availableTags || []);
    } catch (error) {
      if (requestId !== latestRequest.current) return;
      setError(appErrorMessage(error, "Network error. Please try again."));
    } finally {
      if (requestId === latestRequest.current) setLoading(false);
    }
  }, [page, searchQuery, selectedTags]);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  // Delete

  async function handleDelete(file: FileEntry) {
    if (
      !confirm(
        `Delete "${file.title}"?\n\nThis will permanently remove the file from the server.`,
      )
    )
      return;

    try {
      const res = await fetch(`/api/files/${file._id}`, { method: "DELETE" });
      await expectAppData(res);
      fetchFiles();
    } catch (error) {
      alert(appErrorMessage(error, "Network error. Please try again."));
    }
  }

  const existingTags = availableTags.map(({ tag }) => tag);
  const hasFilters = Boolean(searchQuery.trim() || selectedTags.length);

  function toggleTag(tag: string) {
    setPage(1);
    setSelectedTags((current) =>
      current.includes(tag)
        ? current.filter((selected) => selected !== tag)
        : [...current, tag],
    );
  }

  function clearFilters() {
    setPage(1);
    setSearchQuery("");
    setSelectedTags([]);
  }

  // Render

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <div>
          <h1>Internal Files</h1>
          <p>Shared resources, documentation, and module-specific files.</p>
        </div>
        {currentUser.canUpload && (
          <button
            className={styles.uploadBtn}
            onClick={() => setShowUpload(true)}
          >
            <Upload size={15} /> Upload File
          </button>
        )}
      </div>

      {/* Toolbar */}
      <div className={styles.toolbar}>
        <SearchInput
          placeholder="Search files…"
          value={searchQuery}
          onChange={(value) => {
            setPage(1);
            setSearchQuery(value);
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
                active={selectedTags.includes(tag)}
                ariaLabel={`${selectedTags.includes(tag) ? "Remove" : "Add"} ${tag} filter, ${count} files`}
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
        <div className={styles.loadingState}>Loading files…</div>
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
                    currentUser.headModules,
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
                        {formatDate(file.createdAt)}
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
                          {aclSummary(file.accessControl)}
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
            onPageChange={setPage}
          />
        </>
      )}

      {/* Modals */}
      {viewFile && (
        <FileViewer file={viewFile} onClose={() => setViewFile(null)} />
      )}

      {showUpload && (
        <UploadModal
          currentUser={currentUser}
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
    </div>
  );
}
