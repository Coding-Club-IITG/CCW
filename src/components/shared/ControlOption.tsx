import Link from "next/link";
import type { ReactNode } from "react";

type ControlOptionBase = {
  label: string;
  active: boolean;
  ariaLabel?: string;
};

/**
 * One option of a chip row or segmented control
 * URL-driven options are links for SSR and shareability,
 * rest are buttons.
 */
export type ControlOption = ControlOptionBase &
  ({ href: string; onClick?: never } | { href?: never; onClick: () => void });

/** Stable key for an option within its own group */
export function optionKey(option: ControlOption) {
  return `${option.href ?? ""}${option.label}`;
}

export default function ControlOptionItem({
  option,
  className,
  children,
}: {
  option: ControlOption;
  className: string;
  /** Richer label content, Eg. an icon before text */
  children?: ReactNode;
}) {
  const content = children ?? option.label;

  return option.href !== undefined ? (
    <Link
      href={option.href}
      className={className}
      aria-current={option.active ? "true" : undefined}
      aria-label={option.ariaLabel}
    >
      {content}
    </Link>
  ) : (
    <button
      type="button"
      className={className}
      onClick={option.onClick}
      aria-pressed={option.active}
      aria-label={option.ariaLabel}
    >
      {content}
    </button>
  );
}
