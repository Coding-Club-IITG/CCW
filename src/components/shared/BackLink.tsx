"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import styles from "./BackLink.module.scss";

interface BackLinkProps {
  href?: string;
  label?: string;
  back?: boolean;
}

export default function BackLink({
  href,
  label = "Go Back",
  back = false,
}: BackLinkProps) {
  const router = useRouter();

  if (back || !href) {
    return (
      <button
        type="button"
        onClick={() => router.back()}
        className={styles.link}
      >
        <ArrowLeft size={16} />
        {label}
      </button>
    );
  }

  return (
    <Link href={href} className={styles.link}>
      <ArrowLeft size={16} />
      {label}
    </Link>
  );
}
