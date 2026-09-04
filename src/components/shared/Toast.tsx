"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

import styles from "./Toast.module.scss";

export type ToastTone = "error" | "info" | "success" | "warning";

// How long each tone stays up (in ms)
const TONE_DURATIONS: Record<ToastTone, number> = {
  info: 4000,
  success: 4000,
  warning: 6000,
  error: 8000,
};

// Oldest toasts drop off once this many are stacked
const MAX_VISIBLE = 4;

interface ToastOptions {
  // Milliseconds on screen, 0 to keep it until dismissed
  duration?: number;
}

interface ToastRecord {
  id: number;
  message: string;
  tone: ToastTone;
  duration: number;
}

interface ToastApi {
  show: (message: string, tone: ToastTone, options?: ToastOptions) => void;
  info: (message: string, options?: ToastOptions) => void;
  success: (message: string, options?: ToastOptions) => void;
  warning: (message: string, options?: ToastOptions) => void;
  error: (message: string, options?: ToastOptions) => void;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast() {
  const value = useContext(ToastContext);
  if (!value) throw new Error("useToast must be used within its provider.");
  return value;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback(
    (message: string, tone: ToastTone, options?: ToastOptions) => {
      const trimmed = message.trim();
      if (!trimmed) return;
      const record: ToastRecord = {
        id: nextId.current++,
        message: trimmed,
        tone,
        duration: options?.duration ?? TONE_DURATIONS[tone],
      };
      setToasts((current) => [...current, record].slice(-MAX_VISIBLE));
    },
    [],
  );

  const api = useMemo<ToastApi>(
    () => ({
      show,
      dismiss,
      info: (message, options) => show(message, "info", options),
      success: (message, options) => show(message, "success", options),
      warning: (message, options) => show(message, "warning", options),
      error: (message, options) => show(message, "error", options),
    }),
    [dismiss, show],
  );

  return (
    <ToastContext value={api}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext>
  );
}

function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: ToastRecord[];
  onDismiss: (id: number) => void;
}) {
  if (typeof document === "undefined" || toasts.length === 0) return null;

  return createPortal(
    <div className={styles.viewport}>
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>,
    document.body,
  );
}

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: ToastRecord;
  onDismiss: (id: number) => void;
}) {
  const [paused, setPaused] = useState(false);
  const isError = toast.tone === "error";

  useEffect(() => {
    if (paused || toast.duration <= 0) return;
    const timer = setTimeout(() => onDismiss(toast.id), toast.duration);
    return () => clearTimeout(timer);
  }, [onDismiss, paused, toast.duration, toast.id]);

  return (
    <div
      className={`${styles.toast} ${styles[toast.tone]}`}
      role={isError ? "alert" : "status"}
      aria-live={isError ? "assertive" : "polite"}
      // Reading a toast should not race its timer
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <span className={styles.marker} aria-hidden="true" />
      <span className={styles.message}>{toast.message}</span>
      <button
        type="button"
        className={styles.close}
        aria-label="Dismiss notification"
        onClick={() => onDismiss(toast.id)}
      >
        <X size={14} />
      </button>
    </div>
  );
}
