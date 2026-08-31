"use client";

import { useEffect, useRef, useState } from "react";

import { IconCCLogo } from "@/components/shared/Icons";
import styles from "./PrismMark.module.scss";

const LAYERS = 12;
const LAYER_SPACING = 1.15;

/** Interior tint of each extruded layer */
function layerFill(index: number) {
  const half = (LAYERS - 1) / 2;
  const edge = Math.abs(index - half) / half;
  if (edge > 0.86) return "#ffffff";
  const r = Math.round(29 + edge * 226);
  const g = Math.round(35 + edge * 43);
  const b = Math.round(167 - edge * 102);
  return `rgba(${r}, ${g}, ${b}, ${(0.34 + edge * 0.56).toFixed(2)})`;
}

const EXTRUSION = Array.from({ length: LAYERS }, (_, index) => ({
  z: ((index - (LAYERS - 1) / 2) * LAYER_SPACING).toFixed(2),
  fill: layerFill(index),
}));

export default function PrismMark() {
  const tiltRef = useRef<HTMLDivElement>(null);
  const [interactive, setInteractive] = useState(false);

  useEffect(() => {
    const motionOk = window.matchMedia(
      "(prefers-reduced-motion: no-preference)",
    ).matches;
    const finePointer = window.matchMedia("(pointer: fine)").matches;
    if (!motionOk || !finePointer) return;

    setInteractive(true);

    let frame = 0;
    const onPointerMove = (event: PointerEvent) => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const node = tiltRef.current;
        if (!node) return;
        const x = event.clientX / window.innerWidth - 0.5;
        const y = event.clientY / window.innerHeight - 0.5;
        node.style.transform = `rotateY(${x * 46}deg) rotateX(${-y * 30}deg)`;
      });
    };

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  if (!interactive) {
    return (
      <div className={styles.stage} aria-hidden="true">
        <IconCCLogo width={128} height={172} fill="#ffffff" />
      </div>
    );
  }

  return (
    <div className={styles.stage} aria-hidden="true">
      <div ref={tiltRef} className={styles.tilt}>
        <div className={styles.spin}>
          {EXTRUSION.map((layer) => (
            <IconCCLogo
              key={layer.z}
              width={128}
              height={172}
              fill={layer.fill}
              className={styles.layer}
              style={{ transform: `translateZ(${layer.z}px)` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
