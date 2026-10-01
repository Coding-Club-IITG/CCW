"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import {
  cancelLoginSwitch,
  getOwnLoginSwitch,
  submitLoginSwitch,
} from "@/lib/actions/loginSwitch";
import { expectAppData } from "@/lib/api/result";
import { signIn } from "@/lib/auth/client";
import { providerForEmail } from "@/lib/auth/policy";
import { AUTH_PROVIDER_LABELS } from "@/lib/constants";
import type { LoginSwitchDto } from "@/lib/auth/loginSwitch";

import { useRuntimeConfig } from "@/components/layout/Providers";
import Button from "@/components/shared/Button";

import styles from "./ProfileForm.module.scss";

export default function SignInMethod({ email }: { email: string }) {
  const { googleAuthEnabled } = useRuntimeConfig();
  const params = useSearchParams();
  const [request, setRequest] = useState<LoginSwitchDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const started = useRef(false);
  const lock = useRef(false);
  const provider = providerForEmail(email);
  const load = useCallback(async () => {
    const result = await getOwnLoginSwitch();
    if (result.ok) setRequest(result.data.request);
    else setError(result.error.message);
    setLoading(false);
  }, []);
  const clearReturnParams = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete("switchError");
    url.searchParams.delete("verifyGoogle");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  };
  const start = useCallback(async () => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    clearReturnParams();
    try {
      const response = await fetch("/api/auth/login-switch/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const result = await expectAppData<{
        reauthenticate: boolean;
        url: string | null;
      }>(response);
      if (result.reauthenticate) {
        const login = await signIn.social({
          provider: "microsoft",
          callbackURL: "/internal/profile?verifyGoogle=1",
          errorCallbackURL: "/",
        });
        if (login.error)
          throw new Error("Institute sign-in could not be started. Try again.");
      } else if (result.url) window.location.assign(result.url);
    } catch {
      setError(
        "Couldn't start verification. Try again with your institute account.",
      );
      lock.current = false;
      setBusy(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (
      params.get("verifyGoogle") === "1" &&
      googleAuthEnabled &&
      !started.current
    ) {
      started.current = true;
      void start();
    }
  }, [params, googleAuthEnabled, start]);
  async function mutate(action: "submit" | "cancel") {
    if (!request || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    clearReturnParams();
    const result = await (action === "submit"
      ? submitLoginSwitch(request.id)
      : cancelLoginSwitch(request.id));
    if (!result.ok) setError(result.error.message);
    await load();
    lock.current = false;
    setBusy(false);
  }
  const switchError = params.get("switchError")
    ? "Google verification could not be completed. Select a verified Gmail account and try again."
    : "";
  return (
    <>
      <div className={styles.emailRow} aria-busy={loading}>
        <input
          type="email"
          id="email"
          value={email}
          disabled
          className={styles.disabledInput}
        />
        {provider === "microsoft" &&
          googleAuthEnabled &&
          request?.status !== "draft" &&
          request?.status !== "pending" && (
            <Button
              size="small"
              disabled={loading || busy}
              onClick={() => void start()}
            >
              {busy ? "Redirecting…" : "Switch to Google"}
            </Button>
          )}
      </div>
      {provider && (
        <span className={styles.hint}>{AUTH_PROVIDER_LABELS[provider]}</span>
      )}
      {(error || switchError) && <p role="alert">{error || switchError}</p>}
      {!loading && provider === "microsoft" && request && (
        <div className={styles.signInDetails}>
          {request?.status === "draft" ? (
            <>
              <p>{request.googleEmail}</p>
              <p className={styles.hint}>
                Approval replaces institute login with this Google account and
                signs out existing sessions.
              </p>
              <div className={styles.signInActions}>
                <Button
                  disabled={busy}
                  size="small"
                  variant="primary"
                  onClick={() => void mutate("submit")}
                >
                  Submit request
                </Button>
                <Button
                  disabled={busy}
                  size="small"
                  onClick={() => void mutate("cancel")}
                >
                  Cancel
                </Button>
              </div>
            </>
          ) : request?.status === "pending" ? (
            <>
              <p>Pending approval · {request.googleEmail}</p>
              <Button
                size="small"
                disabled={busy}
                onClick={() => void mutate("cancel")}
              >
                Cancel request
              </Button>
            </>
          ) : (
            <>
              {request?.status === "rejected" && (
                <p>
                  Request rejected
                  {request.reason
                    ? `: ${request.reason}`
                    : ". Your institute login remains active."}
                </p>
              )}
              {request?.status === "expired" && (
                <p>
                  Your request expired. Your institute login remains active.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </>
  );
}
