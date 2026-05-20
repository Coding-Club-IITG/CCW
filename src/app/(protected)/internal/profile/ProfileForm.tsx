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
            style={{ background: "#f5f5f5", color: "#666" }}
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
          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
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
              <span style={{ color: "green", fontWeight: "bold" }}>
                Verified ✓
              </span>
            )}
          </div>

          {/* Show verification flow if unverified OR if the handle was edited */}
          {formData.codeforcesId && (!cfVerified || formData.codeforcesId !== savedCodeforcesId) && (
            <div
              style={{
                marginTop: "12px",
                padding: "1rem",
                background: "#fef3c7",
                border: "1px solid #ffeeba",
                borderRadius: "8px",
                color: "#856404",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: cfVerificationToken ? "12px" : "0",
                }}
              >
                <span style={{ fontSize: "0.95rem" }}>
                  <strong>Unverified Handle.</strong>
                  {(!cfVerificationToken || formData.codeforcesId !== tokenHandle) &&
                    " Generate a secure token to begin."}
                </span>
                {/* Show Get Token when: no token yet, or input drifted from the handle the token is for */}
                {(!cfVerificationToken || formData.codeforcesId !== tokenHandle) && (
                  <button
                    type="button"
                    onClick={handleRequestToken}
                    disabled={verifying}
                    style={{
                      padding: "6px 12px",
                      borderRadius: "4px",
                      border: "1px solid #856404",
                      background: "transparent",
                      color: "#856404",
                      cursor: "pointer",
                      fontWeight: "bold",
                    }}
                  >
                    {verifying ? "Wait..." : "Get Token"}
                  </button>
                )}
              </div>

              {/* Only show the token steps + verify button when the input matches the handle
                  the token was generated for — prevents verifying the wrong handle */}
              {cfVerificationToken && formData.codeforcesId === tokenHandle && (
                <div
                  style={{
                    background: "rgba(255,255,255,0.6)",
                    padding: "12px",
                    borderRadius: "6px",
                    fontSize: "0.9rem",
                    lineHeight: "1.6",
                  }}
                >
                  <ol style={{ margin: "0 0 12px 0", paddingLeft: "1.2rem" }}>
                    <li>
                      Update your Codeforces <strong>First Name</strong> to:
                      <code
                        style={{
                          background: "#fff",
                          border: "1px solid #e2e8f0",
                          padding: "3px 8px",
                          borderRadius: "4px",
                          marginLeft: "8px",
                          fontFamily: "monospace",
                          fontSize: "1rem",
                          fontWeight: "bold",
                          color: "#b45309",
                        }}
                      >
                        {cfVerificationToken}
                      </code>
                    </li>
                    <li style={{ marginTop: "6px" }}>
                      Wait a few seconds for Codeforces to update, then click
                      verify.
                    </li>
                  </ol>
                  <button
                    type="button"
                    onClick={handleVerifySubmit}
                    disabled={verifying}
                    style={{
                      padding: "8px 16px",
                      borderRadius: "4px",
                      border: "none",
                      background: "#856404",
                      color: "#fff",
                      cursor: "pointer",
                      fontWeight: "bold",
                    }}
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
            style={{
              padding: "0.75rem 1rem",
              borderRadius: "6px",
              background: message.type === "success" ? "#d1fae5" : "#fee2e2",
              color: message.type === "success" ? "#065f46" : "#991b1b",
              fontSize: "0.9rem",
            }}
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
