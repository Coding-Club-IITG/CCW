"use client";

import { type KeyboardEvent, type PointerEvent, useRef, useState } from "react";
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
  aspectRatio?: string;
  helpText?: string;
}

interface ImageSize {
  width: number;
  height: number;
}

interface DragStart {
  clientX: number;
  clientY: number;
  point: ImageFocalPoint;
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export default function FocalPointPicker({
  src,
  value,
  onChange,
  aspectRatio = "16 / 10",
  helpText = "Drag the image to choose what stays visible.",
}: FocalPointPickerProps) {
  const point = parseImageFocalPoint(value);
  const imageSize = useRef<ImageSize | null>(null);
  const dragStart = useRef<DragStart | null>(null);
  const [dragging, setDragging] = useState(false);

  function updateFromDrag(event: PointerEvent<HTMLDivElement>) {
    const start = dragStart.current;
    const natural = imageSize.current;
    if (!start || !natural) return;

    const bounds = event.currentTarget.getBoundingClientRect();
    const scale = Math.max(
      bounds.width / natural.width,
      bounds.height / natural.height,
    );
    const overflowX = natural.width * scale - bounds.width;
    const overflowY = natural.height * scale - bounds.height;
    const deltaX = event.clientX - start.clientX;
    const deltaY = event.clientY - start.clientY;

    onChange({
      x:
        overflowX > 0.5
          ? clamp(start.point.x - deltaX / overflowX)
          : start.point.x,
      y:
        overflowY > 0.5
          ? clamp(start.point.y - deltaY / overflowY)
          : start.point.y,
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
      x: clamp(point.x + offset[0]),
      y: clamp(point.y + offset[1]),
    });
  }

  return (
    <div className={styles.wrapper}>
      <p className={styles.help}>{helpText}</p>
      <div
        className={styles.preview}
        data-dragging={dragging}
        style={{ aspectRatio }}
        role="slider"
        tabIndex={0}
        aria-label="Cover image focal point"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(point.x * 100)}
        aria-valuetext={`${Math.round(point.x * 100)}% from left, ${Math.round(point.y * 100)}% from top`}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          dragStart.current = {
            clientX: event.clientX,
            clientY: event.clientY,
            point,
          };
          setDragging(true);
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            updateFromDrag(event);
          }
        }}
        onPointerUp={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
          dragStart.current = null;
          setDragging(false);
        }}
        onPointerCancel={() => {
          dragStart.current = null;
          setDragging(false);
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
          onLoad={(event) => {
            imageSize.current = {
              width: event.currentTarget.naturalWidth,
              height: event.currentTarget.naturalHeight,
            };
          }}
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
