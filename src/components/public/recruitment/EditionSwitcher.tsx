import type { RecruitmentDto } from "@/lib/recruitment";

import FilterChips from "@/components/shared/FilterChips";

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
      <FilterChips
        label="Recruitment editions"
        options={editions.map((edition) => ({
          label: edition.label,
          href: `/recruitment?edition=${edition.slug}`,
          active: edition.slug === selected,
        }))}
      />
    </div>
  );
}
