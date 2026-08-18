import ProtectedLayoutClient from "./ProtectedLayoutClient";
import Navbar from "@/components/layout/Navbar/Navbar";
import styles from "./ProtectedLayoutClient.module.scss";
import type { Metadata } from "next";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={styles.protectedShell}>
      <Navbar />
      <ProtectedLayoutClient>{children}</ProtectedLayoutClient>
    </div>
  );
}
