"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { deleteProject } from "@/lib/actions/admin/projects";
import { expectAppData } from "@/lib/api/result";
import type { ProjectStatus } from "@/lib/constants";
import { formatMonthYear } from "@/lib/utils";

import AdminPageHeader from "@/components/admin/AdminPageHeader";
import Pagination from "@/components/shared/Pagination";
import { TableSkeletonContent } from "@/components/shared/skeletons/TableSkeleton";
import { useConfirm } from "@/components/shared/useConfirm";

import styles from "./AdminProjects.module.scss";

interface ProjectItem {
  _id: string;
  title: string;
  module: string;
  date: string;
  status: ProjectStatus;
}

export default function AdminProjectsPage() {
  const { confirm, confirmDialog } = useConfirm();
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    async function fetchProjects() {
      setLoading(true);
      try {
        setError("");
        const res = await fetch(`/api/admin/projects?page=${page}&limit=20`);
        const data = await expectAppData(res);

        setProjects(data.items || []);
        setTotalPages(data.pagination?.totalPages || 1);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to fetch projects.",
        );
        setTotalPages(1);
      } finally {
        setLoading(false);
      }
    }

    void fetchProjects();
  }, [page]);

  async function handleDelete(id: string, title: string) {
    const confirmed = await confirm({
      title: "Delete this project?",
      description: `"${title}" will be removed from the public website. This cannot be undone.`,
      confirmLabel: "Delete project",
    });
    if (!confirmed) return;

    setDeleting(id);
    setError("");

    const result = await deleteProject(id);
    if (result.ok) {
      setProjects((prev) => prev.filter((project) => project._id !== id));
    } else {
      setError(result.error.message);
    }

    setDeleting(null);
  }

  return (
    <div>
      <AdminPageHeader
        title="Project Management"
        lead="Manage showcase projects for the public website."
        action={
          <Link href="/admin/projects/new" className={styles.addBtn}>
            Add Project
          </Link>
        }
      />

      {error && <div className={styles.error}>{error}</div>}

      {loading ? (
        <TableSkeletonContent label="projects" columns={4} />
      ) : projects.length === 0 ? (
        <p className={styles.empty}>No projects yet.</p>
      ) : (
        <>
          <div className={styles.list}>
            {projects.map((project) => (
              <div key={project._id} className={styles.item}>
                <div className={styles.itemInfo}>
                  <div className={styles.itemTop}>
                    <span className={styles.itemTitle}>{project.title}</span>
                    <span
                      className={`${styles.statusBadge} ${styles[project.status.toLowerCase()]}`}
                    >
                      {project.status}
                    </span>
                  </div>
                  <span className={styles.itemMeta}>
                    {project.module} · {formatMonthYear(project.date)}
                  </span>
                </div>
                <div className={styles.itemActions}>
                  <Link
                    href={`/admin/projects/${project._id}`}
                    className={styles.editBtn}
                  >
                    Edit
                  </Link>
                  <button
                    type="button"
                    className={styles.deleteBtn}
                    onClick={() =>
                      void handleDelete(project._id, project.title)
                    }
                    disabled={deleting === project._id}
                  >
                    {deleting === project._id ? "Deleting..." : "Delete"}
                  </button>
                </div>
              </div>
            ))}
          </div>
          <Pagination
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
          />
        </>
      )}
      {confirmDialog}
    </div>
  );
}
