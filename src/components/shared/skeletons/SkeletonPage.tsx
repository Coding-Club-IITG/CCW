import type { ReactNode } from "react";

import Skeleton from "./Skeleton";
import styles from "./Skeleton.module.scss";

/** Header copy every loading.tsx supplies */
export type SkeletonPageProps = {
  // Page title
  title?: string;
  // Page lead
  lead?: string | true;
  // Names the thing being loaded in the live region, defaults to 'title'
  label?: string;
};

/** Body of a skeleton */
export type SkeletonContentProps = {
  // Names the thing being loaded in the live region, Eg. "files"
  label?: string;
};

/** Shared shell for every loading.tsx */
export default function SkeletonPage({
  title,
  lead,
  children,
}: SkeletonPageProps & { children: ReactNode }) {
  return (
    <div>
      <header className={styles.header}>
        <div>
          {title ? <h1>{title}</h1> : <Skeleton width="240px" height={26} />}
          {lead === true ? (
            <Skeleton width="320px" height={15} />
          ) : (
            lead && <p>{lead}</p>
          )}
        </div>
      </header>
      {children}
    </div>
  );
}

/** Announces the pending load once, for the body it wraps */
export function SkeletonBody({
  label,
  className,
  children,
}: SkeletonContentProps & { className?: string; children: ReactNode }) {
  return (
    <div className={className} aria-busy="true">
      <span className={styles.status} role="status" aria-live="polite">
        Loading {label ?? "content"}…
      </span>
      {children}
    </div>
  );
}
