import type { ReactNode } from "react";

import BackLink from "@/components/shared/BackLink";

import styles from "./AdminPageHeader.module.scss";

/** Back link and title block */
export default function AdminPageHeader({
  title,
  lead,
  action,
}: {
  title: string;
  lead: string;
  /** Primary action shown opposite title, Eg. "New Post" */
  action?: ReactNode;
}) {
  return (
    <>
      <BackLink href="/admin" label="Back to Administration" />
      <header className={styles.header}>
        <div>
          <h1>{title}</h1>
          <p>{lead}</p>
        </div>
        {action}
      </header>
    </>
  );
}
