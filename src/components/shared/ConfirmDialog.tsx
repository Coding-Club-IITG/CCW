"use client";

import Button from "./Button";
import Modal from "./Modal";
import styles from "./ConfirmDialog.module.scss";

interface ConfirmDialogProps {
  title: string;
  description: string;
  confirmLabel: string;
  busyLabel?: string;
  variant?: "primary" | "danger";
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export default function ConfirmDialog({
  title,
  description,
  confirmLabel,
  busyLabel = "Working…",
  variant = "danger",
  busy = false,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <Modal
      kicker="Confirm action"
      title={title}
      onClose={onCancel}
      closeDisabled={busy}
      maxWidth={520}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant={variant} onClick={onConfirm} disabled={busy}>
            {busy ? busyLabel : confirmLabel}
          </Button>
        </>
      }
    >
      <p className={styles.description}>{description}</p>
    </Modal>
  );
}
