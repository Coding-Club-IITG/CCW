"use client";

import { useState } from "react";

import { signIn } from "@/lib/auth-client";

import styles from "./PulseSignInPrompt.module.scss";

interface PulseSignInPromptProps {
  /** The page URL to return to after successful sign-in. */
  callbackURL: string;
}

/**
 * Prompts the user to sign in with their Microsoft institute account.
 * Used on Pulse host pages when the session is absent or expired.
 * No provider picker — Pulse hosts must use Microsoft (@iitg.ac.in).
 */
export default function PulseSignInPrompt({
  callbackURL,
}: PulseSignInPromptProps) {
  const [busy, setBusy] = useState(false);

  async function handleSignIn() {
    if (busy) return;
    setBusy(true);
    try {
      const result = await signIn.social({
        provider: "microsoft",
        callbackURL,
        errorCallbackURL: `/?error=sign_in_failed`,
      });
      if (result?.error) {
        // Better-auth redirects on success; an error means the redirect didn't happen.
        setBusy(false);
      }
    } catch {
      setBusy(false);
    }
  }

  return (
    <div className={styles.prompt}>
      <p className={styles.message}>
        Sign in with your Microsoft institute account to access Pulse.
      </p>
      <button
        type="button"
        className={styles.button}
        disabled={busy}
        onClick={() => void handleSignIn()}
      >
        {busy ? "Redirecting…" : "Sign in with Microsoft"}
      </button>
    </div>
  );
}
