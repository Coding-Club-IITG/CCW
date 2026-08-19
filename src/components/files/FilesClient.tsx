"use client";

import { appErrorMessage, expectAppData } from "@/lib/api/result";

import { useState, useEffect, useCallback } from "react";
import {
  Upload,
  Trash2,
  Edit2,
  Eye,
  Download,
  FileIcon,
  AlertCircle,
} from "lucide-react";
import Pagination from "@/components/shared/Pagination";
import SearchInput from "@/components/shared/SearchInput";
import type { CurrentUser, FileEntry } from "./types";
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

  // Toolbar
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFolder, setSelectedFolder] = useState("__all__");

  // Active modal / viewer
  const [viewFile, setViewFile] = useState<FileEntry | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [editFile, setEditFile] = useState<FileEntry | null>(null);

  // Data fetching

  const fetchFiles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/files?page=${page}&limit=30`);
      const data = await expectAppData(res);
      setFiles(data.items || []);
      setTotalPages(data.pagination?.totalPages || 1);
    } catch (error) {
      setError(appErrorMessage(error, "Network error. Please try again."));
    } finally {
      setLoading(false);
    }
  }, [page]);

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

  // Derived

  const folders = [
    "__all__",
    ...Array.from(new Set(files.map((f) => f.folder))).sort(),
  ];

  const existingFolders = folders.filter((f) => f !== "__all__");

  const filteredFiles = files.filter((f) => {
    const matchesFolder =
      selectedFolder === "__all__" || f.folder === selectedFolder;
    const matchesSearch =
      !searchQuery ||
      f.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.uploadedByName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.folder.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFolder && matchesSearch;
  });

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
          onChange={setSearchQuery}
          className={styles.searchBox}
        />

        <div className={styles.folderTabs}>
          {folders.map((folder) => (
            <button
              key={folder}
              className={`${styles.folderTab} ${selectedFolder === folder ? styles.active : ""}`}
              onClick={() => setSelectedFolder(folder)}
            >
              {folder === "__all__" ? "All Files" : folder}
              <span className={styles.folderCount}>
                {folder === "__all__"
                  ? files.length
                  : files.filter((f) => f.folder === folder).length}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* File Table */}
      {loading ? (
        <div className={styles.emptyState}>Loading files…</div>
      ) : error ? (
        <div className={styles.errorState}>
          <AlertCircle size={18} /> {error}
        </div>
      ) : filteredFiles.length === 0 ? (
        <div className={styles.emptyState}>
          {searchQuery
            ? `No files matching "${searchQuery}".`
            : "No files here yet."}
        </div>
      ) : (
        <>
          <div className={styles.tableContainer}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Folder</th>
                  <th>Uploaded By</th>
                  <th>Date</th>
                  <th>Size</th>
                  <th>Access</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredFiles.map((file) => {
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
                        <span className={styles.folderBadge}>
                          {file.folder}
                        </span>
                      </td>
                      <td className={styles.subtle}>{file.uploadedByName}</td>
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
          existingFolders={existingFolders}
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
          existingFolders={existingFolders}
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
