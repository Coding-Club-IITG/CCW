"use client";

import { Plus, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { appErrorMessage, expectAppData } from "@/lib/api/result";
import type { SharingGroupSummary } from "@/lib/files/types";
import type { PaginatedResult } from "@/lib/shared/pagination";
import EmptyState from "@/components/shared/EmptyState";
import Pagination from "@/components/shared/Pagination";
import SearchInput from "@/components/shared/SearchInput";
import Sheet from "@/components/shared/Sheet";

import GroupModal from "./GroupModal";
import type { CurrentUser } from "./types";
import styles from "./FilesClient.module.scss";

export default function GroupManager({
  currentUser,
  onClose,
  onChanged,
}: {
  currentUser: CurrentUser;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [groups, setGroups] = useState<SharingGroupSummary[]>([]);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => {
    setRevision((value) => value + 1);
    onChanged();
  }, [onChanged]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void fetch(
      `/api/files/groups?search=${encodeURIComponent(query)}&page=${page}`,
      { signal: controller.signal },
    )
      .then((response) =>
        expectAppData<PaginatedResult<SharingGroupSummary>>(response),
      )
      .then((data) => {
        if (controller.signal.aborted) return;
        setGroups(data.items);
        setTotalPages(data.pagination.totalPages);
        if (page > 1 && !data.items.length) setPage(page - 1);
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setError(appErrorMessage(error, "Could not load sharing groups."));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [page, query, revision]);

  return (
    <>
      <Sheet label="Manage sharing groups" onClose={onClose} maxWidth={800}>
        <div className={styles.groupManager}>
          <div className={styles.groupHeader}>
            <span className={styles.aclGroupLabel}>Internal Files</span>
            <h2>Sharing groups</h2>
            <p>Create a team once, then share files with its members.</p>
          </div>
          <div className={styles.headerActions}>
            <SearchInput
              value={query}
              onChange={(value) => {
                setQuery(value);
                setPage(1);
              }}
              placeholder="Find a group…"
            />
            <button
              type="button"
              className={styles.toolbarPrimaryBtn}
              onClick={() => setActive("new")}
            >
              <Plus size={14} /> Create group
            </button>
          </div>
          {loading ? (
            <p role="status" className={styles.hint}>
              Loading groups…
            </p>
          ) : error ? (
            <div role="alert" className={styles.formError}>
              {error}
              <button
                type="button"
                onClick={() => setRevision((value) => value + 1)}
              >
                Retry
              </button>
            </div>
          ) : groups.length === 0 ? (
            <EmptyState
              title={
                query
                  ? "No matching groups."
                  : "Create your first sharing group."
              }
            />
          ) : (
            <ul className={styles.groupList}>
              {groups.map((group) => (
                <li key={group.id}>
                  <Users size={18} aria-hidden="true" />
                  <div>
                    <strong>{group.name}</strong>
                    <span className={styles.hint}>
                      {group.memberCount}{" "}
                      {group.memberCount === 1 ? "member" : "members"}
                      {group.module ? ` · ${group.module}` : ""}
                    </span>
                    {group.description && <p>{group.description}</p>}
                  </div>
                  <button
                    type="button"
                    className={styles.secondaryBtn}
                    onClick={() => setActive(group.id)}
                    aria-label={`${group.canManage ? "Edit" : "View"} ${group.name}`}
                  >
                    {group.canManage ? "Edit" : "View"}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <Pagination
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
          />
        </div>
      </Sheet>
      {active && (
        <GroupModal
          groupId={active === "new" ? undefined : active}
          currentUser={currentUser}
          onClose={() => setActive(null)}
          onSaved={refresh}
        />
      )}
    </>
  );
}
