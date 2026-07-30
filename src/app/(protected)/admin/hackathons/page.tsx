"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import BackLink from "@/components/shared/BackLink";
import Pagination from "@/components/shared/Pagination";
import styles from "./Hackathons.module.scss";

interface Hackathon {
  _id: string;
  name: string;
  organization: string;
  minMembers: number;
  maxMembers: number;
  skills: string[];
  websiteUrl: string;
  deadline: string;
  description: string;
  status: string;
  createdAt: string;
}

export default function AdminHackathonsPage() {
  const router = useRouter();
  const [hackathons, setHackathons] = useState<Hackathon[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Form state
  const [name, setName] = useState("");
  const [organization, setOrganization] = useState("");
  const [minMembers, setMinMembers] = useState(1);
  const [maxMembers, setMaxMembers] = useState(4);
  const [skills, setSkills] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [deadline, setDeadline] = useState("");
  const [description, setDescription] = useState("");

  const fetchHackathons = useCallback(async () => {
    setLoading(true);
    try {
      setError("");
      const res = await fetch(`/api/admin/hackathons?page=${page}&limit=20`);
      const data = await res.json();
      setHackathons(data.items || []);
      setTotalPages(data.pagination?.totalPages || 1);
    } catch {
      setError("Failed to fetch hackathons.");
      setTotalPages(1);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    void fetchHackathons();
  }, [fetchHackathons]);

  function resetForm() {
    setName("");
    setOrganization("");
    setMinMembers(1);
    setMaxMembers(4);
    setSkills("");
    setWebsiteUrl("");
    setDeadline("");
    setDescription("");
    setEditingId(null);
  }

  function handleEdit(h: Hackathon) {
    setName(h.name);
    setOrganization(h.organization);
    setMinMembers(h.minMembers);
    setMaxMembers(h.maxMembers);
    setSkills(h.skills.join(", "));
    setWebsiteUrl(h.websiteUrl);
    setDeadline(h.deadline ? h.deadline.slice(0, 16) : "");
    setDescription(h.description || "");
    setEditingId(h._id);
    setShowForm(true);
    setError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");

    const payload = {
      name,
      organization,
      minMembers,
      maxMembers,
      skills: skills
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      websiteUrl,
      deadline,
      description,
    };

    try {
      const url = editingId
        ? `/api/admin/hackathons/${editingId}`
        : "/api/admin/hackathons";
      const method = editingId ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(
          data.error ||
            `Failed to ${editingId ? "update" : "create"} hackathon.`,
        );
        return;
      }

      resetForm();
      setShowForm(false);
      void fetchHackathons();
    } catch {
      setError(`Failed to ${editingId ? "update" : "create"} hackathon.`);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleArchive(id: string) {
    if (!confirm("Archive this hackathon?")) return;
    try {
      await fetch(`/api/admin/hackathons/${id}`, { method: "DELETE" });
      void fetchHackathons();
    } catch {
      setError("Failed to archive hackathon.");
    }
  }

  return (
    <div className={styles.container}>
      <BackLink href="/admin" label="Back to Administration" />
      <header className={styles.header}>
        <h1>Hackathon Management</h1>
        <p>Create and monitor hackathons for club members.</p>
      </header>

      <div className={styles.actions}>
        <button
          className={styles.btnPrimary}
          onClick={() => {
            if (showForm) {
              resetForm();
              setShowForm(false);
            } else {
              resetForm();
              setShowForm(true);
            }
          }}
        >
          {showForm ? "Cancel" : "+ New Hackathon"}
        </button>
      </div>

      {error && <p className={styles.error}>{error}</p>}

      {showForm && (
        <form className={styles.form} onSubmit={handleSubmit}>
          <h2 className={styles.sectionTitle}>
            {editingId ? "Edit Hackathon" : "Create Hackathon"}
          </h2>
          <div className={styles.formGrid}>
            <div className={styles.field}>
              <label>Name *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Hackathon name"
                required
              />
            </div>
            <div className={styles.field}>
              <label>Organization *</label>
              <input
                type="text"
                value={organization}
                onChange={(e) => setOrganization(e.target.value)}
                placeholder="Organizing body"
                required
              />
            </div>
            <div className={styles.field}>
              <label>Min Team Size *</label>
              <input
                type="number"
                value={minMembers}
                onChange={(e) => setMinMembers(Number(e.target.value))}
                min={1}
                required
              />
            </div>
            <div className={styles.field}>
              <label>Max Team Size *</label>
              <input
                type="number"
                value={maxMembers}
                onChange={(e) => setMaxMembers(Number(e.target.value))}
                min={1}
                required
              />
            </div>
            <div className={styles.field}>
              <label>Deadline *</label>
              <input
                type="datetime-local"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                required
              />
            </div>
            <div className={styles.field}>
              <label>Skills (comma-separated)</label>
              <input
                type="text"
                value={skills}
                onChange={(e) => setSkills(e.target.value)}
                placeholder="React, Python, ML"
              />
            </div>
            <div className={styles.field}>
              <label>Website URL *</label>
              <input
                type="url"
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                placeholder="https://hackathon.example.com"
                required
              />
            </div>
          </div>
          <div className={styles.field}>
            <label>Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of the hackathon..."
              rows={3}
            />
          </div>
          <button
            type="submit"
            className={styles.btnPrimary}
            disabled={submitting}
          >
            {submitting
              ? editingId
                ? "Saving..."
                : "Creating..."
              : editingId
                ? "Save Changes"
                : "Create Hackathon"}
          </button>
        </form>
      )}

      <h2 className={styles.sectionTitle}>All Hackathons</h2>

      {loading ? (
        <p className={styles.muted}>Loading...</p>
      ) : hackathons.length === 0 ? (
        <p className={styles.muted}>No hackathons yet.</p>
      ) : (
        <>
          <div className={styles.list}>
            {hackathons.map((h) => (
              <div key={h._id} className={styles.card}>
                <div className={styles.cardHeader}>
                  <h3>{h.name}</h3>
                  <span
                    className={`${styles.badge} ${h.status === "active" ? styles.badgeActive : styles.badgeArchived}`}
                  >
                    {h.status}
                  </span>
                </div>
                <p className={styles.cardOrg}>{h.organization}</p>
                <div className={styles.cardMeta}>
                  <span>
                    Team size:{" "}
                    {h.minMembers === h.maxMembers
                      ? h.maxMembers
                      : `${h.minMembers}-${h.maxMembers}`}
                  </span>
                  <span>
                    Deadline: {new Date(h.deadline).toLocaleDateString()}
                  </span>
                </div>
                {h.skills.length > 0 && (
                  <div className={styles.skills}>
                    {h.skills.map((s) => (
                      <span key={s} className={styles.skill}>
                        {s}
                      </span>
                    ))}
                  </div>
                )}
                <div className={styles.cardActions}>
                  <button
                    className={styles.btnSecondary}
                    onClick={() => handleEdit(h)}
                  >
                    Edit
                  </button>
                  <button
                    className={styles.btnSecondary}
                    onClick={() => router.push(`/admin/hackathons/${h._id}`)}
                  >
                    Monitor Teams
                  </button>
                  {h.status === "active" && (
                    <button
                      className={styles.btnDanger}
                      onClick={() => handleArchive(h._id)}
                    >
                      Archive
                    </button>
                  )}
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
