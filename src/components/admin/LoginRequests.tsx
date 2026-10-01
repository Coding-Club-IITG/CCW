"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import {
  listLoginSwitchRequests,
  reviewLoginSwitch,
} from "@/lib/actions/loginSwitch";
import { useSession } from "@/lib/auth/client";
import { LOGIN_SWITCH_STATUSES } from "@/lib/constants";
import type { LoginRequestDto } from "@/lib/auth/loginSwitch";
import { formatShortDate } from "@/lib/shared/dates";
import { getDisplayName } from "@/lib/users/identity";

import { useRuntimeConfig } from "@/components/layout/Providers";
import Button from "@/components/shared/Button";
import Modal from "@/components/shared/Modal";
import Pagination from "@/components/shared/Pagination";
import { TableSkeletonContent } from "@/components/shared/skeletons/TableSkeleton";
import { useToast } from "@/components/shared/Toast";
import { useConfirm } from "@/components/shared/useConfirm";

import styles from "./UserManagement.module.scss";

export default function LoginRequests() {
  const params = useSearchParams();
  const router = useRouter();
  const rawPage = Number(params.get("requestPage") ?? 1);
  const page = Number.isSafeInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const rawStatus = params.get("status");
  const status =
    rawStatus === "all" ||
    LOGIN_SWITCH_STATUSES.some(
      (value) => value !== "draft" && value === rawStatus,
    )
      ? rawStatus!
      : "pending";
  const { data: session } = useSession();
  const toast = useToast();
  const { googleAuthEnabled } = useRuntimeConfig();
  const { confirm, confirmDialog } = useConfirm();
  const [items, setItems] = useState<LoginRequestDto[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState<LoginRequestDto | null>(null);
  const [reason, setReason] = useState("");
  const generation = useRef(0);
  const cancelPending = useCallback(() => {
    generation.current++;
  }, []);
  const load = useCallback(async () => {
    const current = ++generation.current;
    setLoading(true);
    const result = await listLoginSwitchRequests({ page, status });
    if (current !== generation.current) return;
    if (result.ok) {
      setItems(result.data.items);
      setTotal(result.data.total);
    } else {
      setItems([]);
      setTotal(0);
      toast.error(result.error.message);
    }
    setLoading(false);
  }, [page, status, toast]);
  useEffect(() => {
    void load();
    return cancelPending;
  }, [load, cancelPending]);
  function navigate(values: Record<string, string>) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(values)) next.set(key, value);
    router.push(`/admin/users?${next}`, { scroll: false });
  }
  async function review(item: LoginRequestDto, action: "approve" | "reject") {
    if (busy) return;
    setBusy(true);
    if (
      action === "approve" &&
      !(await confirm({
        title: "Approve Google login?",
        description: `${getDisplayName(item.name, item.pizza_count)} will use the verified Google account in place of institute login.`,
        confirmLabel: "Approve switch",
        variant: "primary",
      }))
    ) {
      setBusy(false);
      return;
    }
    const result = await reviewLoginSwitch(
      item.id,
      action,
      action === "reject" ? reason : "",
    );
    if (!result.ok) toast.error(result.error.message);
    else {
      setRejecting(null);
      setReason("");
    }
    setBusy(false);
    await load();
  }
  return (
    <>
      <div className={styles.toolbar}>
        <div className={styles.field}>
          <label htmlFor="login-request-status">Status</label>
          <select
            id="login-request-status"
            value={status}
            onChange={(event) =>
              navigate({ status: event.target.value, requestPage: "1" })
            }
          >
            <option value="all">All</option>
            {LOGIN_SWITCH_STATUSES.filter((value) => value !== "draft").map(
              (value) => (
                <option key={value} value={value}>
                  {value[0].toUpperCase() + value.slice(1)}
                </option>
              ),
            )}
          </select>
        </div>
        <span className={styles.resultCount}>
          {total} {total === 1 ? "request" : "requests"}
        </span>
      </div>
      {loading ? (
        <TableSkeletonContent label="login requests" columns={5} />
      ) : !items.length ? (
        <p className={styles.emptyState}>
          No login requests match this status.
        </p>
      ) : (
        <>
          <div className={styles.tableContainer}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Institute email</th>
                  <th>Verified Gmail</th>
                  <th>Submitted</th>
                  <th>Review</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>{getDisplayName(item.name, item.pizza_count)}</td>
                    <td>{item.sourceEmail}</td>
                    <td>{item.googleEmail}</td>
                    <td>
                      {item.submittedAt
                        ? formatShortDate(item.submittedAt)
                        : "—"}
                    </td>
                    <td>
                      {item.status === "pending" ? (
                        item.userId === session?.user.id ? (
                          "Awaiting another reviewer"
                        ) : (
                          <div className={styles.filterActions}>
                            <Button
                              size="small"
                              disabled={busy || !googleAuthEnabled}
                              title={
                                googleAuthEnabled
                                  ? undefined
                                  : "Google sign-in is unavailable"
                              }
                              onClick={() => void review(item, "approve")}
                            >
                              Approve
                            </Button>
                            <Button
                              size="small"
                              disabled={busy}
                              onClick={() => {
                                setReason("");
                                setRejecting(item);
                              }}
                            >
                              Reject
                            </Button>
                          </div>
                        )
                      ) : (
                        item.status
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={page}
            totalPages={Math.max(1, Math.ceil(total / 20))}
            onPageChange={(value) => navigate({ requestPage: String(value) })}
          />
        </>
      )}
      {rejecting && (
        <Modal
          title="Reject login request"
          onClose={() => setRejecting(null)}
          closeDisabled={busy}
          maxWidth={480}
          footer={
            <>
              <Button disabled={busy} onClick={() => setRejecting(null)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                disabled={busy}
                onClick={() => void review(rejecting, "reject")}
              >
                {busy ? "Saving…" : "Reject request"}
              </Button>
            </>
          }
        >
          <div className={styles.field}>
            <label htmlFor="login-request-reason">Reason (optional)</label>
            <textarea
              id="login-request-reason"
              maxLength={300}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </div>
        </Modal>
      )}
      {confirmDialog}
    </>
  );
}
