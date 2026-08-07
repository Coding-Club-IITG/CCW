import { ButtonHTMLAttributes, forwardRef, ReactNode } from "react";

import styles from "./Button.module.scss";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "small" | "medium";
  iconOnly?: boolean;
  children: ReactNode;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "secondary",
    size = "medium",
    iconOnly = false,
    className,
    children,
    type = "button",
    ...props
  },
  ref,
) {
  return (
    <button
      type={type}
      ref={ref}
      className={`${styles.button} ${styles[variant]} ${styles[size]} ${iconOnly ? styles.iconOnly : ""} ${className || ""}`}
      {...props}
    >
      {children}
    </button>
  );
});

export default Button;
