"use client";

import { useEffect, useRef } from "react";

type Layer = {
  onEscape: () => void;
  canClose: () => boolean;
};

const layers: Layer[] = [];
let bound = false;

function handleKeyDown(event: KeyboardEvent) {
  if (event.key !== "Escape") return;
  const layer = layers.at(-1);
  if (!layer || !layer.canClose()) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  layer.onEscape();
}

function bind() {
  if (bound) return;
  document.addEventListener("keydown", handleKeyDown);
  bound = true;
}

function unbind() {
  if (!bound || layers.length > 0) return;
  document.removeEventListener("keydown", handleKeyDown);
  bound = false;
}

/**
 * Registers an overlay as a dismissable layer while 'active'
 * Only the top-most layer can receive Escape.
 */
export function useEscapeLayer(
  active: boolean,
  onEscape: () => void,
  canClose: () => boolean = () => true,
) {
  const onEscapeRef = useRef(onEscape);
  const canCloseRef = useRef(canClose);

  useEffect(() => {
    onEscapeRef.current = onEscape;
    canCloseRef.current = canClose;
  });

  useEffect(() => {
    if (!active) return;
    const layer: Layer = {
      onEscape: () => onEscapeRef.current(),
      canClose: () => canCloseRef.current(),
    };
    layers.push(layer);
    bind();
    return () => {
      const index = layers.lastIndexOf(layer);
      if (index !== -1) layers.splice(index, 1);
      unbind();
    };
  }, [active]);
}
