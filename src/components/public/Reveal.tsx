"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";

import styles from "./Reveal.module.scss";

/**  Releases its children when they scroll into view */
export default function Reveal({
  children,
  className = "",
  delay = 0,
  style,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const show = () => node.setAttribute("data-reveal", "in");

    if (
      !("IntersectionObserver" in window) ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      show();
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            show();
            observer.unobserve(entry.target);
          }
        }
      },
      { rootMargin: "0px 0px -6% 0px", threshold: 0.08 },
    );
    observer.observe(node);

    const fallback = window.setTimeout(() => {
      const box = node.getBoundingClientRect();
      if (box.top < window.innerHeight && box.bottom > 0) show();
    }, 2400);
    return () => {
      observer.disconnect();
      window.clearTimeout(fallback);
    };
  }, []);

  return (
    <div
      ref={ref}
      data-reveal="out"
      className={`${styles.reveal} ${className}`}
      style={
        delay
          ? { ...style, transitionDelay: `${Math.min(delay, 4) * 70}ms` }
          : style
      }
    >
      {children}
    </div>
  );
}
