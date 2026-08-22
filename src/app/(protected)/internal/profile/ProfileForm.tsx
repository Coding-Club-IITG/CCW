"use client";

import { expectAppData } from "@/lib/api/result";

import { useState, useEffect } from "react";
import { useSession } from "@/lib/auth-client";
import { updateProfile } from "@/lib/actions/user";
import { requestHandleVerification } from "@/lib/actions/cp-verification";
import { getCPStatus } from "@/lib/actions/cp-status";
import ImageUpload from "@/components/shared/ImageUpload";
import { Check as IconCheck } from "lucide-react";
import styles from "./ProfileForm.module.scss";

export default function ProfileForm() {
  const { data: session, isPending } = useSession();
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState<"" | "cf" | "ac">("");
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    image: "",
    codeforcesId: "",
    atcoderId: "",
    githubId: "",
    bio: "",
    phoneNumber: "",
  });

  const [cfVerificationToken, setCfVerificationToken] = useState("");
  const [cfVerified, setCfVerified] = useState(false);
  const [savedCodeforcesId, setSavedCodeforcesId] = useState("");
  const [tokenHandleCF, setTokenHandleCF] = useState("");

  const [acVerificationToken, setAcVerificationToken] = useState("");
  const [acVerified, setAcVerified] = useState(false);
  const [savedAtcoderId, setSavedAtcoderId] = useState("");
  const [tokenHandleAC, setTokenHandleAC] = useState("");

  useEffect(() => {
    if (!session?.user) return;

    const cfHandle = session.user.codeforcesId || "";
    const acHandle = session.user.atcoderId || "";
    setFormData({
      name: session.user.name || "",
      image: session.user.image || "",
      codeforcesId: cfHandle,
      atcoderId: acHandle,
      githubId: session.user.githubId || "",
      bio: session.user.bio || "",
      phoneNumber: session.user.phoneNumber || "",
    });
    setSavedCodeforcesId(cfHandle);
    setSavedAtcoderId(acHandle);

    getCPStatus().then((res) => {
      if (res.ok) {
        setCfVerified(res.data.cfVerified ?? false);
        setCfVerificationToken(res.data.cfVerificationToken ?? "");
        setTokenHandleCF(res.data.cfHandle ?? "");
        setAcVerified(res.data.acVerified ?? false);
        setAcVerificationToken(res.data.acVerificationToken ?? "");
        setTokenHandleAC(res.data.acHandle ?? "");
      }
    });
  }, [session]);

  async function handleVerifySubmit(platform: "codeforces" | "atcoder") {
    setVerifying(platform === "codeforces" ? "cf" : "ac");
    setMessage(null);
    try {
      const res = await fetch(`/api/cp/verify-handle?platform=${platform}`, {
        method: "POST",
      });
      await expectAppData(res);
      if (platform === "codeforces") {
        setCfVerified(true);
        setCfVerificationToken("");
        setTokenHandleCF("");
        setSavedCodeforcesId(formData.codeforcesId);
        setMessage({ type: "success", text: "Codeforces handle verified!" });
      } else {
        setAcVerified(true);
        setAcVerificationToken("");
        setTokenHandleAC("");
        setSavedAtcoderId(formData.atcoderId);
        setMessage({ type: "success", text: "AtCoder handle verified!" });
      }
    } catch {
      setMessage({ type: "error", text: "Network error. Please try again." });
    } finally {
      setVerifying("");
    }
  }

  async function handleRequestToken(platform: "codeforces" | "atcoder") {
    const handle =
      platform === "codeforces" ? formData.codeforcesId : formData.atcoderId;
    setVerifying(platform === "codeforces" ? "cf" : "ac");
    setMessage(null);
    const result = await requestHandleVerification(handle, platform);
    setVerifying("");
    if (!result.ok) {
      setMessage({
        type: "error",
        text: result.error.message,
      });
    } else {
      if (platform === "codeforces") {
        setCfVerificationToken(result.data.token!);
        setTokenHandleCF(formData.codeforcesId);
        setCfVerified(false);
        setMessage({
          type: "success",
          text: "Token generated. Please update your CF profile.",
        });
      } else {
        setAcVerificationToken(result.data.token!);
        setTokenHandleAC(formData.atcoderId);
        setAcVerified(false);
        setMessage({
          type: "success",
          text: "Token generated. Please update your AtCoder profile.",
        });
      }
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    const result = await updateProfile(formData);
    setLoading(false);

    if (!result.ok) {
      setMessage({
        type: "error",
        text: result.error.message,
      });
    } else {
      if (result.data.handleChanged) {
        setCfVerified(false);
        setCfVerificationToken("");
      }
      setSavedCodeforcesId(formData.codeforcesId);
      setSavedAtcoderId(formData.atcoderId);
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
          <label>Profile Picture</label>
          <ImageUpload
            value={formData.image}
            onChange={(url) => setFormData({ ...formData, image: url })}
            uploadEndpoint="/api/profile/upload-image"
            label="Photo"
            previewClassName={styles.avatarPreview}
          />
        </div>

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

        {/* Codeforces ID */}
        <div className={styles.field}>
          <label htmlFor="codeforces">Codeforces ID</label>
          <div className={styles.cpRow}>
            <input
              type="text"
              id="codeforces"
              value={formData.codeforcesId}
              onChange={(e) =>
                setFormData({ ...formData, codeforcesId: e.target.value })
              }
              placeholder="Eg. tourist"
            />
            {cfVerified && formData.codeforcesId === savedCodeforcesId && (
              <span className={styles.verifiedBadge}>
                Verified <IconCheck width="12" height="12" />
              </span>
            )}
          </div>

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
                      formData.codeforcesId !== tokenHandleCF) &&
                      " Generate a secure token to begin."}
                  </span>
                  {(!cfVerificationToken ||
                    formData.codeforcesId !== tokenHandleCF) && (
                    <button
                      type="button"
                      onClick={() => handleRequestToken("codeforces")}
                      disabled={verifying === "cf"}
                      className={styles.tokenButton}
                    >
                      {verifying === "cf" ? "Wait..." : "Get Token"}
                    </button>
                  )}
                </div>

                {cfVerificationToken &&
                  formData.codeforcesId === tokenHandleCF && (
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
                        onClick={() => handleVerifySubmit("codeforces")}
                        disabled={verifying === "cf"}
                        className={styles.verifyButton}
                      >
                        {verifying === "cf" ? "Verifying..." : "Verify Handle"}
                      </button>
                    </div>
                  )}
              </div>
            )}
        </div>

        {/* AtCoder ID */}
        <div className={styles.field}>
          <label htmlFor="atcoder">AtCoder ID</label>
          <div className={styles.cpRow}>
            <input
              type="text"
              id="atcoder"
              value={formData.atcoderId}
              onChange={(e) =>
                setFormData({ ...formData, atcoderId: e.target.value })
              }
              placeholder="Eg. chokudai"
            />
            {acVerified && formData.atcoderId === savedAtcoderId && (
              <span className={styles.verifiedBadge}>
                Verified <IconCheck width="12" height="12" />
              </span>
            )}
          </div>

          {formData.atcoderId &&
            (!acVerified || formData.atcoderId !== savedAtcoderId) && (
              <div className={styles.verificationBox}>
                <div
                  className={
                    acVerificationToken
                      ? styles.verificationHeaderWithMargin
                      : styles.verificationHeader
                  }
                >
                  <span className={styles.verificationText}>
                    <strong>Unverified Handle.</strong>
                    {(!acVerificationToken ||
                      formData.atcoderId !== tokenHandleAC) &&
                      " Generate a secure token to begin."}
                  </span>
                  {(!acVerificationToken ||
                    formData.atcoderId !== tokenHandleAC) && (
                    <button
                      type="button"
                      onClick={() => handleRequestToken("atcoder")}
                      disabled={verifying === "ac"}
                      className={styles.tokenButton}
                    >
                      {verifying === "ac" ? "Wait..." : "Get Token"}
                    </button>
                  )}
                </div>

                {acVerificationToken &&
                  formData.atcoderId === tokenHandleAC && (
                    <div className={styles.tokenSteps}>
                      <ol className={styles.tokenStepsList}>
                        <li>
                          Update your AtCoder <strong>Affiliation</strong> to:
                          <code className={styles.tokenCode}>
                            {acVerificationToken}
                          </code>
                        </li>
                        <li className={styles.tokenStepItem}>
                          Wait a few seconds for AtCoder to update, then click
                          verify.
                        </li>
                      </ol>
                      <button
                        type="button"
                        onClick={() => handleVerifySubmit("atcoder")}
                        disabled={verifying === "ac"}
                        className={styles.verifyButton}
                      >
                        {verifying === "ac" ? "Verifying..." : "Verify Handle"}
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
            placeholder="Eg. octocat"
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
            placeholder="Eg. +91 9876543210"
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
