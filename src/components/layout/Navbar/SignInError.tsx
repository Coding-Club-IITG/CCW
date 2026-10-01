"use client";

import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { loginErrorMessage } from "@/lib/auth/policy";

import Button from "@/components/shared/Button";

const Modal = dynamic(() => import("@/components/shared/Modal"), {
  ssr: false,
});

export default function SignInError({
  immediateError,
  onDismiss,
}: {
  immediateError: string | null;
  onDismiss: () => void;
}) {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const error =
    immediateError ?? (pathname === "/" ? params.get("error") : null);
  if (!error) return null;
  const message = loginErrorMessage(error);
  const dismiss = () => {
    onDismiss();
    const next = new URLSearchParams(params);
    for (const key of ["error", "error_description", "error_code"])
      next.delete(key);
    router.replace(`${pathname}${next.size ? `?${next}` : ""}`, {
      scroll: false,
    });
  };
  return (
    <Modal
      title={message.title}
      onClose={dismiss}
      maxWidth={480}
      footer={<Button onClick={dismiss}>Close</Button>}
    >
      <p>{message.message}</p>
    </Modal>
  );
}
