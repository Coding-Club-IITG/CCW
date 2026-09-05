import Link from "next/link";

import type { RecruitmentDto } from "@/lib/recruitment";

import styles from "./Recruitment.module.scss";

export default function EditionSwitcher({
  editions,
  selected,
}: {
  editions: Pick<RecruitmentDto, "slug" | "label">[];
  selected: string;
}) {
  return (
    <div className={styles.switcher}>
      <nav className={styles.pills} aria-label="Recruitment editions">
        {editions.map((edition) => (
          <Link
            key={edition.slug}
            href={`/recruitment?edition=${edition.slug}`}
            aria-current={edition.slug === selected ? "page" : undefined}
            className={styles.pill}
          >
            {edition.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
