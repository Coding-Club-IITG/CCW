import ControlOptionItem, {
  optionKey,
  type ControlOption,
} from "./ControlOption";
import styles from "./FilterControls.module.scss";

export type FilterOption = ControlOption;

/** Row of outlined filter chips */
export default function FilterChips({
  options,
  label,
}: {
  options: FilterOption[];
  label: string;
}) {
  return (
    <div className={styles.chipRow} role="group" aria-label={label}>
      {options.map((option) => (
        <ControlOptionItem
          key={optionKey(option)}
          option={option}
          className={`${styles.chip} ${option.active ? styles.chipActive : ""}`}
        />
      ))}
    </div>
  );
}
