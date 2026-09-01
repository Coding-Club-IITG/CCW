"use client";

import { expectAppData } from "@/lib/api/result";

import { useState, useRef } from "react";
import CompatibleImage from "./CompatibleImage";
import FocalPointPicker from "./FocalPointPicker";
import type { ImageFocalPoint } from "@/lib/imageFocalPoint";
import styles from "./ImageUpload.module.scss";

interface ImageUploadProps {
  value: string;
  onChange: (url: string) => void;
  uploadEndpoint: string;
  label?: string;
  previewClassName?: string;
  focalPoint?: ImageFocalPoint;
  onFocalPointChange?: (value: ImageFocalPoint) => void;
  focalPointAspectRatio?: string;
  focalPointHelpText?: string;
}

export default function ImageUpload({
  value,
  onChange,
  uploadEndpoint,
  label = "Image",
  previewClassName,
  focalPoint,
  onFocalPointChange,
  focalPointAspectRatio,
  focalPointHelpText,
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

      const { url } = await expectAppData(res);
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
        {value && !onFocalPointChange && (
          <CompatibleImage
            src={value}
            alt={`${label} preview`}
            className={previewClassName || styles.preview}
            width={192}
            height={108}
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
      {value && onFocalPointChange && (
        <FocalPointPicker
          src={value}
          value={focalPoint}
          onChange={onFocalPointChange}
          aspectRatio={focalPointAspectRatio}
          helpText={focalPointHelpText}
        />
      )}
    </div>
  );
}
