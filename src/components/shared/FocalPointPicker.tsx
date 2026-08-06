"use client";

import { type KeyboardEvent, type PointerEvent } from "react";
import type { ImageFocalPoint } from "@/lib/imageFocalPoint";
import {
  DEFAULT_IMAGE_FOCAL_POINT,
  focalPointObjectPosition,
  parseImageFocalPoint,
} from "@/lib/imageFocalPoint";
import CompatibleImage from "./CompatibleImage";
import styles from "./FocalPointPicker.module.scss";

interface FocalPointPickerProps {
  src: string;
  value?: ImageFocalPoint;
  onChange: (value: ImageFocalPoint) => void;
}

export default function FocalPointPicker({
  src,
  value,
  onChange,
}: FocalPointPickerProps) {
  const point = parseImageFocalPoint(value);

  function updateFromPointer(event: PointerEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    onChange({
      x: Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width)),
      y: Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height)),
    });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? 0.1 : 0.02;
    const offsets: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const offset = offsets[event.key];
    if (!offset) return;
    event.preventDefault();
    onChange({
      x: Math.min(1, Math.max(0, point.x + offset[0])),
      y: Math.min(1, Math.max(0, point.y + offset[1])),
    });
  }

  return (
    <div className={styles.wrapper}>
      <p className={styles.help}>
        Choose the important part of the image for cropped previews.
      </p>
      <div
        className={styles.preview}
        role="slider"
        tabIndex={0}
        aria-label="Cover image focal point"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(point.x * 100)}
        aria-valuetext={`${Math.round(point.x * 100)}% from left, ${Math.round(point.y * 100)}% from top`}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          updateFromPointer(event);
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            updateFromPointer(event);
          }
        }}
        onKeyDown={handleKeyDown}
      >
        <CompatibleImage
          src={src}
          alt=""
          className={styles.image}
          style={{ objectPosition: focalPointObjectPosition(point) }}
          width={640}
          height={360}
        />
        <span
          className={styles.marker}
          style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}
        />
      </div>
      <button
        type="button"
        className={styles.reset}
        onClick={() => onChange(DEFAULT_IMAGE_FOCAL_POINT)}
      >
        Reset to center
      </button>
    </div>
  );
}
