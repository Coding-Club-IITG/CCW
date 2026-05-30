import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import styles from "./BackLink.module.scss";

interface BackLinkProps {
  href: string;
  label: string;
}

export default function BackLink({ href, label }: BackLinkProps) {
  return (
    <Link href={href} className={styles.link}>
      <ArrowLeft size={16} />
      {label}
    </Link>
  );
}
