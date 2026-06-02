"use client";

import { useState, useRef } from "react";
import styles from "./ImageUpload.module.scss";

interface ImageUploadProps {
  value: string;
  onChange: (url: string) => void;
  uploadEndpoint: string;
  label?: string;
  previewClassName?: string;
}

export default function ImageUpload({
  value,
  onChange,
  uploadEndpoint,
  label = "Image",
  previewClassName,
}: ImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (file: File) => {
    setUploading(true);
    setError("");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(uploadEndpoint, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Upload failed");
      }

      const { url } = await res.json();
      onChange(url);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to upload image.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className={styles.wrapper}>
      {error && <div className={styles.error}>{error}</div>}
      <div className={styles.row}>
        {value && (
          <img
            src={value}
            alt={`${label} preview`}
            className={previewClassName || styles.preview}
          />
        )}
        <label className={styles.uploadBtn}>
          {uploading
            ? "Uploading..."
            : value
              ? `Change ${label}`
              : `Upload ${label}`}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            hidden
            disabled={uploading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleUpload(file);
              e.target.value = "";
            }}
          />
        </label>
        {value && (
          <button
            type="button"
            className={styles.removeBtn}
            onClick={() => onChange("")}
          >
            Remove
          </button>
        )}
      </div>
    </div>
  );
}
