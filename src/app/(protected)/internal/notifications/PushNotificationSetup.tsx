"use client";

import { useCallback, useEffect, useState } from "react";
import { BellRing, MonitorSmartphone } from "lucide-react";

import { expectAppData } from "@/lib/api/result";
import {
  disablePushNotifications,
  enablePushNotifications,
  getCurrentPushSubscription,
  requiresIosInstallation,
  supportsPushNotifications,
  syncPushSubscription,
} from "@/lib/push/client";

import styles from "./Notifications.module.scss";

type SetupState =
  | "checking"
  | "unsupported"
  | "unconfigured"
  | "ios-install"
  | "ready"
  | "denied"
  | "enabled"
  | "error";

interface PushConfiguration {
  configured: boolean;
  publicKey?: string;
}

export default function PushNotificationSetup() {
  const [state, setState] = useState<SetupState>("checking");
  const [publicKey, setPublicKey] = useState<string>();
  const [busy, setBusy] = useState(false);
  const permission =
    typeof window !== "undefined" && "Notification" in window
      ? Notification.permission
      : "default";

  const inspect = useCallback(async () => {
    setState("checking");
    try {
      const configuration = await expectAppData<PushConfiguration>(
        await fetch("/api/push-subscriptions"),
      );
      if (!configuration.configured || !configuration.publicKey) {
        setState("unconfigured");
        return;
      }
      setPublicKey(configuration.publicKey);

      if (requiresIosInstallation()) {
        setState("ios-install");
        return;
      }
      if (!supportsPushNotifications()) {
        setState("unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        setState("denied");
        return;
      }

      const subscription = await getCurrentPushSubscription();
      if (subscription) await syncPushSubscription(subscription);
      setState(subscription ? "enabled" : "ready");
    } catch {
      setState("error");
    }
  }, []);

  useEffect(() => {
    void inspect();
  }, [inspect]);

  async function enable() {
    if (!publicKey) return;
    setBusy(true);
    try {
      const subscription = await enablePushNotifications(publicKey);
      setState(subscription ? "enabled" : "denied");
    } catch {
      setState("error");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      await disablePushNotifications();
      setState("ready");
    } catch {
      setState("error");
    } finally {
      setBusy(false);
    }
  }

  if (
    state === "checking" ||
    state === "unsupported" ||
    state === "unconfigured"
  ) {
    return null;
  }

  const content = {
    "ios-install": [
      "Install CCW PWA first",
      "In Safari, tap Share, choose Add to Home Screen, then open CCW from the new Home Screen icon.",
    ],
    ready: [
      permission === "default"
        ? "Enable browser notifications"
        : "Browser notifications are off",
      "Get CCW notifications in this browser. Permission is requested only when you enable it.",
    ],
    denied: [
      "Notifications are blocked",
      "Allow notifications for CCW in your browser or device settings, then return here.",
    ],
    enabled: [
      "Browser notifications are enabled",
      "This browser will receive all CCW notifications.",
    ],
    error: [
      "Browser notification setup failed",
      "Check your connection and try again.",
    ],
  } satisfies Record<
    Exclude<SetupState, "checking" | "unsupported" | "unconfigured">,
    [string, string]
  >;

  return (
    <section className={styles.pushCard} aria-live="polite">
      <div className={styles.pushIcon} aria-hidden="true">
        {state === "enabled" ? (
          <BellRing size={20} />
        ) : (
          <MonitorSmartphone size={20} />
        )}
      </div>
      <div className={styles.pushContent}>
        <h2>{content[state][0]}</h2>
        {content[state][1] && <p>{content[state][1]}</p>}
      </div>
      {state === "ready" && (
        <button className={styles.btnPrimary} disabled={busy} onClick={enable}>
          {busy ? "Enabling…" : "Enable notifications"}
        </button>
      )}
      {state === "enabled" && (
        <button
          className={styles.btnSecondary}
          disabled={busy}
          onClick={disable}
        >
          {busy ? "Disabling…" : "Disable in this browser"}
        </button>
      )}
      {state === "error" && (
        <button
          className={styles.btnSecondary}
          disabled={busy}
          onClick={inspect}
        >
          Try again
        </button>
      )}
    </section>
  );
}
