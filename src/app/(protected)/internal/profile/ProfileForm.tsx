"use client";

import { useState, useEffect } from "react";
import { useSession } from "@/lib/auth-client";
import { updateProfile } from "@/lib/actions/user";
import { requestHandleVerification } from "@/lib/actions/cf";
import { getCFStatus } from "@/lib/actions/cfStatus";
import styles from "./ProfileForm.module.scss";

export default function ProfileForm() {
  const { data: session, isPending } = useSession();
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    codeforcesId: "",
    githubId: "",
    bio: "",
    phoneNumber: "",
  });

  const [cfVerificationToken, setCfVerificationToken] = useState("");
  const [cfVerified, setCfVerified] = useState(false);
  // Tracks the last-saved handle so we can detect unsaved edits
  const [savedCodeforcesId, setSavedCodeforcesId] = useState("");
  // Tracks which handle the current pending token was generated for
  const [tokenHandle, setTokenHandle] = useState("");

  useEffect(() => {
    if (!session?.user) return;

    const cfHandle = (session.user as any).codeforcesId || "";
    setFormData({
      name: session.user.name || "",
      codeforcesId: cfHandle,
      githubId: (session.user as any).githubId || "",
      bio: (session.user as any).bio || "",
      phoneNumber: (session.user as any).phoneNumber || "",
    });
    setSavedCodeforcesId(cfHandle);

    getCFStatus().then((res) => {
      if (res.ok) {
        setCfVerified(res.cfVerified ?? false);
        setCfVerificationToken(res.cfVerificationToken ?? "");
        // tokenHandle = the handle the pending token belongs to
        setTokenHandle(res.cfHandle ?? "");
      }
    });
  }, [session]);

  async function handleVerifySubmit() {
    setVerifying(true);
    setMessage(null);
    try {
      const res = await fetch("/api/cf/verify-handle", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setMessage({
          type: "error",
          text: data.error || "Verification failed",
        });
        return;
      }
      setCfVerified(true);
      setCfVerificationToken("");
      setTokenHandle("");
      // Verification saved the handle to User.codeforcesId on the backend —
      // advance savedCodeforcesId so the verified badge appears immediately
      setSavedCodeforcesId(formData.codeforcesId);
      setMessage({ type: "success", text: "Codeforces handle verified!" });
    } catch {
      setMessage({ type: "error", text: "Network error. Please try again." });
    } finally {
      setVerifying(false);
    }
  }

  async function handleRequestToken() {
    setVerifying(true);
    setMessage(null);
    const result = await requestHandleVerification(formData.codeforcesId);
    setVerifying(false);
    if (!result.ok) {
      setMessage({
        type: "error",
        text: result.error || "Failed to generate token",
      });
    } else {
      setCfVerificationToken(result.token!);
      // Record which handle this token was generated for;
      // the token display + verify button only appear when input matches this
      setTokenHandle(formData.codeforcesId);
      // Backend reset cfVerified on the CFUser record
      setCfVerified(false);
      setMessage({
        type: "success",
        text: "Token generated. Please update your CF profile.",
      });
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    const result = await updateProfile(formData);
    setLoading(false);

    if (!result.success) {
      setMessage({
        type: "error",
        text: result.error || "Failed to update profile.",
      });
    } else {
      // If the handle changed, the backend has already reset verification —
      // update local state so the UI immediately shows the verification flow
      if (result.handleChanged) {
        setCfVerified(false);
        setCfVerificationToken("");
      }
      setSavedCodeforcesId(formData.codeforcesId);
      setMessage({
        type: "success",
        text: "Profile updated successfully!",
      });
    }
  }

  if (isPending) return <div>Loading...</div>;

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Your Profile</h1>
      <p className={styles.subtitle}>
        Update your personal details and platform IDs.
      </p>

      <form onSubmit={handleSubmit} className={styles.form}>
        <div className={styles.field}>
          <label htmlFor="email">Email</label>
          <input
            type="email"
            id="email"
            value={session?.user?.email || ""}
            disabled
            className={styles.disabledInput}
          />
          <span className={styles.hint}>Email cannot be changed.</span>
        </div>

        <div className={styles.field}>
          <label htmlFor="name">Display Name</label>
          <input
            type="text"
            id="name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
            placeholder="Enter your full name"
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="codeforces">Codeforces ID</label>
          <div className={styles.cfRow}>
            <input
              type="text"
              id="codeforces"
              value={formData.codeforcesId}
              onChange={(e) =>
                setFormData({ ...formData, codeforcesId: e.target.value })
              }
              placeholder="e.g. tourist"
            />
            {/* Only show verified badge if the handle matches the saved (verified) one */}
            {cfVerified && formData.codeforcesId === savedCodeforcesId && (
              <span className={styles.verifiedBadge}>Verified ✓</span>
            )}
          </div>

          {/* Show verification flow if unverified OR if the handle was edited */}
          {formData.codeforcesId &&
            (!cfVerified || formData.codeforcesId !== savedCodeforcesId) && (
              <div className={styles.verificationBox}>
                <div
                  className={
                    cfVerificationToken
                      ? styles.verificationHeaderWithMargin
                      : styles.verificationHeader
                  }
                >
                  <span className={styles.verificationText}>
                    <strong>Unverified Handle.</strong>
                    {(!cfVerificationToken ||
                      formData.codeforcesId !== tokenHandle) &&
                      " Generate a secure token to begin."}
                  </span>
                  {/* Show Get Token when: no token yet, or input drifted from the handle the token is for */}
                  {(!cfVerificationToken ||
                    formData.codeforcesId !== tokenHandle) && (
                    <button
                      type="button"
                      onClick={handleRequestToken}
                      disabled={verifying}
                      className={styles.tokenButton}
                    >
                      {verifying ? "Wait..." : "Get Token"}
                    </button>
                  )}
                </div>

                {/* Only show the token steps + verify button when the input matches the handle
                  the token was generated for — prevents verifying the wrong handle */}
                {cfVerificationToken &&
                  formData.codeforcesId === tokenHandle && (
                    <div className={styles.tokenSteps}>
                      <ol className={styles.tokenStepsList}>
                        <li>
                          Update your Codeforces <strong>First Name</strong> to:
                          <code className={styles.tokenCode}>
                            {cfVerificationToken}
                          </code>
                        </li>
                        <li className={styles.tokenStepItem}>
                          Wait a few seconds for Codeforces to update, then
                          click verify.
                        </li>
                      </ol>
                      <button
                        type="button"
                        onClick={handleVerifySubmit}
                        disabled={verifying}
                        className={styles.verifyButton}
                      >
                        {verifying ? "Verifying..." : "Verify Handle"}
                      </button>
                    </div>
                  )}
              </div>
            )}
        </div>

        <div className={styles.field}>
          <label htmlFor="github">GitHub ID</label>
          <input
            type="text"
            id="github"
            value={formData.githubId}
            onChange={(e) =>
              setFormData({ ...formData, githubId: e.target.value })
            }
            placeholder="e.g. octocat"
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="bio">Bio</label>
          <textarea
            id="bio"
            value={formData.bio}
            onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
            placeholder="A short bio about yourself"
            rows={3}
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="phone">Phone Number</label>
          <input
            type="tel"
            id="phone"
            value={formData.phoneNumber}
            onChange={(e) =>
              setFormData({ ...formData, phoneNumber: e.target.value })
            }
            placeholder="e.g. +91 9876543210"
          />
        </div>

        {message && (
          <div
            className={
              message.type === "success"
                ? styles.messageSuccess
                : styles.messageError
            }
          >
            {message.text}
          </div>
        )}

        <button type="submit" disabled={loading} className={styles.saveButton}>
          {loading ? "Saving..." : "Save Changes"}
        </button>
      </form>
    </div>
  );
}
