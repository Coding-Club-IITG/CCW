import React from "react";
import styles from "./DifficultyBadge.module.scss";
import { DIFFICULTY_COLORS, type Difficulty } from "@/lib/constants";

interface DifficultyBadgeProps {
  difficulty: Difficulty;
  className?: string;
  style?: React.CSSProperties;
}

export function DifficultyBadge({
  difficulty,
  className,
  style,
}: DifficultyBadgeProps) {
  const color = DIFFICULTY_COLORS[difficulty] || "#10b981";

  return (
    <span
      className={`${styles.badge} ${className || ""}`}
      style={{
        color: color,
        border: `1px solid ${color}`,
        backgroundColor: `${color}15`,
        ...style,
      }}
    >
      {difficulty}
    </span>
  );
}
