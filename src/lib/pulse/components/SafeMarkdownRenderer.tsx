"use client";

import React, { useMemo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { ShieldAlert } from "lucide-react";
import { auditMarkdownSafety, isSafeUrl } from "../safeMarkdown";
import styles from "./styles/SafeMarkdown.module.scss";

import "katex/dist/katex.min.css";
import "highlight.js/styles/github-dark.css";

interface SafeMarkdownRendererProps {
  content: string;
  className?: string;
  showSafetyWarnings?: boolean;
}

export function SafeMarkdownRenderer({
  content,
  className = "",
  showSafetyWarnings = false,
}: SafeMarkdownRendererProps) {
  // Safety audit
  const audit = useMemo(() => auditMarkdownSafety(content), [content]);

  // Custom components enforcing Safe Markdown Policy
  const components: Components = useMemo(
    () => ({
      a: ({ href, children, ...props }) => {
        if (!isSafeUrl(href)) {
          return (
            <span
              className={styles.blockedLink}
              title="Blocked potentially unsafe link"
            >
              <ShieldAlert size={12} aria-hidden="true" />
              <span>{children} [Blocked Link]</span>
            </span>
          );
        }

        const isExternal =
          href?.startsWith("http://") || href?.startsWith("https://");

        return (
          <a
            href={href}
            {...(isExternal
              ? { target: "_blank", rel: "noopener noreferrer" }
              : {})}
            {...props}
          >
            {children}
          </a>
        );
      },
      img: ({ src, alt, ...props }) => {
        if (!isSafeUrl(src)) {
          return (
            <span
              className={styles.blockedLink}
              title="Blocked potentially unsafe image source"
            >
              <ShieldAlert size={12} aria-hidden="true" />
              <span>[Blocked Image: {alt || "unsafe src"}]</span>
            </span>
          );
        }
        // eslint-disable-next-line @next/next/no-img-element
        return <img src={src} alt={alt || ""} loading="lazy" {...props} />;
      },
    }),
    [],
  );

  return (
    <div className={`${styles.safeProse} ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeHighlight, rehypeKatex]}
        components={components}
      >
        {audit.sanitized}
      </ReactMarkdown>

      {showSafetyWarnings && audit.warnings.length > 0 && (
        <div className={styles.warningBox} role="alert">
          <strong>Safe Markdown Notice:</strong>
          <ul>
            {audit.warnings.map((warn, i) => (
              <li key={i}>{warn}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
