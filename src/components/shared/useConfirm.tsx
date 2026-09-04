"use client";

import { useCallback, useRef, useState } from "react";

import ConfirmDialog from "./ConfirmDialog";

interface ConfirmRequest {
  title: string;
  description: string;
  confirmLabel?: string;
  variant?: "primary" | "danger";
}

/** Promise-based ConfirmDialog, replaces confirm() */
export function useConfirm() {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const resolver = useRef<((confirmed: boolean) => void) | null>(null);

  const confirm = useCallback((next: ConfirmRequest) => {
    setRequest(next);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const settle = useCallback((confirmed: boolean) => {
    setRequest(null);
    resolver.current?.(confirmed);
    resolver.current = null;
  }, []);

  const confirmDialog = request ? (
    <ConfirmDialog
      title={request.title}
      description={request.description}
      confirmLabel={request.confirmLabel ?? "Confirm"}
      variant={request.variant}
      onCancel={() => settle(false)}
      onConfirm={() => settle(true)}
    />
  ) : null;

  return { confirm, confirmDialog };
}
