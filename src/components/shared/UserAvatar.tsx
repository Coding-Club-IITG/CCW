"use client";

import { useEffect, useState } from "react";

import CompatibleImage from "@/components/shared/CompatibleImage";

import styles from "./UserAvatar.module.scss";

interface UserAvatarProps {
  name?: string;
  image?: string | null;
  size: number;
  imageClassName?: string;
  fallbackClassName?: string;
}

export default function UserAvatar({
  name,
  image,
  size,
  imageClassName = "",
  fallbackClassName = "",
}: UserAvatarProps) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [image]);

  const displayName = name || "User";
  const initials = displayName
    .split(" ")
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  if (image && !failed) {
    return (
      <CompatibleImage
        src={image}
        alt={displayName}
        className={`${styles.image} ${imageClassName}`}
        width={size}
        height={size}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <span
      className={`${styles.fallback} ${fallbackClassName}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
      aria-label={displayName}
    >
      {initials}
    </span>
  );
}
