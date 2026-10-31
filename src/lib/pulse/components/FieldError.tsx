import React from "react";
import { AlertCircle } from "lucide-react";
import styles from "./styles/FieldError.module.scss";

interface FieldErrorProps {
  error?: string;
  id?: string;
  className?: string;
}

export function FieldError({ error, id, className = "" }: FieldErrorProps) {
  if (!error) return null;

  return (
    <div
      id={id}
      role="alert"
      aria-live="polite"
      className={`${styles.errorContainer} ${className}`}
    >
      <AlertCircle className={styles.errorIcon} aria-hidden="true" />
      <span className={styles.errorText}>{error}</span>
    </div>
  );
}
