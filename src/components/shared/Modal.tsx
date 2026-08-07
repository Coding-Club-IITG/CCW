"use client";

import { ReactNode, useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

import Button from "@/components/shared/Button";
import styles from "./Modal.module.scss";

interface ModalProps {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  closeDisabled?: boolean;
  maxWidth?: number;
  className?: string;
  contentClassName?: string;
}

export default function Modal({
  title,
  description,
  children,
  footer,
  onClose,
  closeDisabled = false,
  maxWidth = 640,
  className = "",
  contentClassName = "",
}: ModalProps) {
  const titleId = useId();
  const descriptionId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const disabledRef = useRef(closeDisabled);

  useEffect(() => {
    disabledRef.current = closeDisabled;
  }, [closeDisabled]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !disabledRef.current) onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return createPortal(
    <div
      className={styles.backdrop}
      onMouseDown={() => !closeDisabled && onClose()}
    >
      <section
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
            <h2 id={titleId}>{title}</h2>
            {description && <p id={descriptionId}>{description}</p>}
          </div>
          <Button
            ref={closeRef}
            variant="ghost"
            iconOnly
            aria-label={`Close ${title}`}
            onClick={onClose}
            disabled={closeDisabled}
          >
            <X size={20} />
          </Button>
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
