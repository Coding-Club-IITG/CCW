"use client";

import { ReactNode, useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";

import { useFocusTrap } from "./useFocusTrap";
import { useScrollLock } from "./useScrollLock";
import { useEscapeLayer } from "./overlayStack";
import styles from "./Modal.module.scss";

interface ModalProps {
  /** Mono kicker above the title, Eg. "Files" */
  kicker?: string;
  title: ReactNode;
  /** Needed for the close button's label when 'title' is not a string */
  closeLabel?: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  closeDisabled?: boolean;
  maxWidth?: number;
  className?: string;
  contentClassName?: string;
  /** Per-consumer backdrop treatment, Eg. a blur or grayscale filter */
  backdropClassName?: string;
}

export default function Modal({
  kicker,
  title,
  closeLabel,
  description,
  children,
  footer,
  onClose,
  closeDisabled = false,
  maxWidth = 640,
  className = "",
  contentClassName = "",
  backdropClassName = "",
}: ModalProps) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const disabledRef = useRef(closeDisabled);

  useFocusTrap(dialogRef);
  useScrollLock();
  useEscapeLayer(true, onClose, () => !disabledRef.current);

  useEffect(() => {
    disabledRef.current = closeDisabled;
  }, [closeDisabled]);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  if (typeof document === "undefined") return null;

  const label =
    closeLabel ?? (typeof title === "string" ? `Close ${title}` : "Close");

  return createPortal(
    <div
      className={`${styles.backdrop} ${backdropClassName}`}
      onMouseDown={() => !closeDisabled && onClose()}
    >
      <section
        ref={dialogRef}
        className={`${styles.modal} ${className}`}
        style={{ maxWidth }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className={styles.header}>
          <div>
            {kicker && <span className={styles.kicker}>{kicker}</span>}
            <h2 id={titleId}>{title}</h2>
            {description && <p id={descriptionId}>{description}</p>}
          </div>
          <button
            ref={closeRef}
            type="button"
            className={styles.close}
            aria-label={label}
            onClick={onClose}
            disabled={closeDisabled}
          >
            Esc
          </button>
        </header>
        <div className={`${styles.content} ${contentClassName}`}>
          {children}
        </div>
        {footer && <footer className={styles.footer}>{footer}</footer>}
      </section>
    </div>,
    document.body,
  );
}
