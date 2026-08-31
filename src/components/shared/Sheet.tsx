"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

import { useFocusTrap } from "./useFocusTrap";
import styles from "./Sheet.module.scss";

interface SheetProps {
  label: string;
  accent?: string;
  children: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
  maxWidth?: number;
  className?: string;
}

export default function Sheet({
  label,
  accent,
  children,
  onClose,
  footer,
  maxWidth = 1120,
  className = "",
}: SheetProps) {
  const labelId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useFocusTrap(panelRef);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return createPortal(
    <div className={styles.backdrop} onMouseDown={onClose}>
      <div
        ref={panelRef}
        className={`${styles.panel} ${className}`}
        style={{ maxWidth }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelId}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <span id={labelId} className={styles.srOnly}>
          {label}
        </span>
        <div
          className={styles.rail}
          style={accent ? { background: accent } : undefined}
        />
        <button
          ref={closeRef}
          type="button"
          className={styles.close}
          aria-label={`Close ${label}`}
          onClick={onClose}
        >
          <X size={16} />
        </button>
        <div className={styles.body}>{children}</div>
        {footer && <div className={styles.footer}>{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
