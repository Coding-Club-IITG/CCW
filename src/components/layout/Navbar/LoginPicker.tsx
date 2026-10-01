"use client";

import { useEffect, useId, useRef, useState } from "react";
import { signIn } from "@/lib/auth-client";
import { AUTH_PROVIDER_LABELS, type AuthProvider } from "@/lib/constants";
import { useRuntimeConfig } from "@/components/layout/Providers";
import { useEscapeLayer } from "@/components/shared/overlayStack";
import styles from "./Navbar.module.scss";

export default function LoginPicker({
  disabled,
  navigationKey,
  onDevelopmentLogin,
  onError,
}: {
  disabled: boolean;
  navigationKey: string;
  onDevelopmentLogin: () => void;
  onError: (code: string) => void;
}) {
  const { developmentAuthEnabled, googleAuthEnabled } = useRuntimeConfig();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    setOpen(false);
  }, [navigationKey]);
  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  useEscapeLayer(open, close);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  async function start(provider: AuthProvider) {
    if (inFlight.current) return;
    inFlight.current = true;
    setOpen(false);
    setBusy(true);
    try {
      const result = await signIn.social({
        provider,
        callbackURL: "/internal/dashboard",
        errorCallbackURL: "/",
      });
      if (result.error) throw new Error("Provider start failed");
    } catch {
      inFlight.current = false;
      setBusy(false);
      onError("temporary");
    }
  }

  return (
    <div
      ref={root}
      className={`${styles.loginPicker} ${open ? styles.loginPickerOpen : ""}`}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setOpen(false);
      }}
    >
      <button
        ref={trigger}
        data-login-trigger=""
        type="button"
        className={styles.authButton}
        disabled={disabled || busy}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => {
          if (developmentAuthEnabled) onDevelopmentLogin();
          else if (open || !googleAuthEnabled) void start("microsoft");
          else setOpen(true);
        }}
      >
        {busy
          ? "Redirecting…"
          : open
            ? AUTH_PROVIDER_LABELS.microsoft
            : "Login"}
      </button>
      <div id={id} hidden={!open} className={styles.loginChoices}>
        <button
          type="button"
          className={styles.authButton}
          disabled={disabled || busy}
          onClick={() => void start("google")}
        >
          Google
        </button>
      </div>
    </div>
  );
}
