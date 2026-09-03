"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { deleteProject } from "@/lib/actions/admin/projects";
import { expectAppData } from "@/lib/api/result";

import BackLink from "@/components/shared/BackLink";
import Pagination from "@/components/shared/Pagination";
import { TableSkeletonContent } from "@/components/shared/skeletons/TableSkeleton";

import styles from "../events/AdminEvents.module.scss";
import AdminProjectsLoading from "./loading";

interface ProjectItem {
  _id: string;
  title: string;
  module: string;
  date: string;
  status: "Upcoming" | "Completed";
}

function formatMonthYear(date: string) {
  return new Date(date).toLocaleDateString("en-IN", {
    month: "short",
    year: "numeric",
  });
}

export default function AdminProjectsPage() {
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

  async function handleDelete(id: string) {
    if (!window.confirm("Are you sure you want to delete this project?")) {
      return;
    }

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

  if (loading && projects.length === 0) return <AdminProjectsLoading />;

  return (
    <div className={styles.container}>
      <BackLink href="/admin" label="Back to Administration" />

      <div className={styles.header}>
        <div>
          <h1>Project Management</h1>
          <p>Manage showcase projects for the public website.</p>
        </div>
        <Link href="/admin/projects/new" className={styles.addBtn}>
          Add Project
        </Link>
      </div>

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
                    onClick={() => void handleDelete(project._id)}
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
    </div>
  );
}
