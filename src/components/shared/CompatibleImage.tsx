"use client";

import Image, { type ImageProps } from "next/image";
import { useEffect, useState } from "react";

type CompatibleImageProps = Omit<ImageProps, "height" | "width"> & {
  height?: number;
  width?: number;
  fallback?: React.ReactNode;
};

export default function CompatibleImage({
  alt,
  height = 450,
  onError,
  src,
  width = 800,
  fallback,
  ...props
}: CompatibleImageProps) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);

  const isUnoptimizableSource =
    typeof src === "string" &&
    /^(?:blob:|data:|https?:\/\/|\/api\/)/i.test(src);

  if (failed) return fallback ? <>{fallback}</> : null;

  return (
    <Image
      {...props}
      alt={alt}
      src={src}
      width={width}
      height={height}
      unoptimized={isUnoptimizableSource}
      onError={(event) => {
        setFailed(true);
        onError?.(event);
      }}
    />
  );
}
