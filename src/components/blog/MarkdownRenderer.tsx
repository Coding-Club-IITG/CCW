"use client";

import {
  Children,
  isValidElement,
  type HTMLAttributes,
  type ReactNode,
  useState,
} from "react";
import { Check, Copy, Link as LinkIcon, TriangleAlert } from "lucide-react";
import ReactMarkdown, {
  type Components,
  type ExtraProps,
} from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkGithubBlockquoteAlert from "remark-github-blockquote-alert";
import remarkMath from "remark-math";

import { writeClipboardText } from "@/lib/blog/articleReader";
import { remarkHeadingAnchors } from "@/lib/blog/markdownHeadings";

import "katex/dist/katex.min.css";
import "remark-github-blockquote-alert/alert.css";
import styles from "./MarkdownRenderer.module.scss";

interface MarkdownRendererProps {
  content: string;
  className?: string;
  enableHeadingAnchors?: boolean;
  enableCodeCopy?: boolean;
}

function reactNodeText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (Array.isArray(node)) return node.map(reactNodeText).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) {
    return reactNodeText(node.props.children);
  }
  return "";
}

function fencedCodeStartLines(content: string): Set<number> {
  const lines = new Set<number>();
  content.split(/\r?\n/).forEach((line, index) => {
    if (/^ {0,3}(?:`{3,}|~{3,})/.test(line)) lines.add(index + 1);
  });
  return lines;
}

interface CopyButtonProps {
  label: string;
  getText: () => string;
  compact?: boolean;
}

function CopyButton({ label, getText, compact = false }: CopyButtonProps) {
  const [result, setResult] = useState<"idle" | "copied" | "failed">("idle");

  const handleCopy = async () => {
    try {
      await writeClipboardText(getText(), globalThis.navigator?.clipboard);
      setResult("copied");
    } catch {
      setResult("failed");
    }
  };

  const accessibleResult =
    result === "copied"
      ? `${label} copied.`
      : result === "failed"
        ? `${label} could not be copied.`
        : "";

  return (
    <>
      <button
        type="button"
        className={compact ? styles.headingCopy : styles.codeCopy}
        onClick={() => void handleCopy()}
        aria-label={label}
      >
        {result === "copied" ? (
          <Check aria-hidden="true" size={15} />
        ) : result === "failed" ? (
          <TriangleAlert aria-hidden="true" size={15} />
        ) : compact ? (
          <LinkIcon aria-hidden="true" size={15} />
        ) : (
          <Copy aria-hidden="true" size={15} />
        )}
        {!compact && (
          <span>
            {result === "copied"
              ? "Copied"
              : result === "failed"
                ? "Copy failed"
                : "Copy"}
          </span>
        )}
      </button>
      <span className={styles.srOnly} aria-live="polite">
        {accessibleResult}
      </span>
    </>
  );
}

type ArticleHeadingProps = HTMLAttributes<HTMLHeadingElement> &
  ExtraProps & {
    level: 1 | 2 | 3;
  };

function ArticleHeading({
  level,
  node: _node,
  children,
  id,
  ...props
}: ArticleHeadingProps) {
  const contents = (
    <>
      <span>{children}</span>
      {id && (
        <CopyButton
          compact
          label={`Copy link to ${reactNodeText(children)}`}
          getText={() => {
            const url = new URL(window.location.href);
            url.hash = id;
            return url.toString();
          }}
        />
      )}
    </>
  );

  if (level === 1)
    return (
      <h1 id={id} {...props}>
        {contents}
      </h1>
    );
  if (level === 2)
    return (
      <h2 id={id} {...props}>
        {contents}
      </h2>
    );
  return (
    <h3 id={id} {...props}>
      {contents}
    </h3>
  );
}

export default function MarkdownRenderer({
  content,
  className,
  enableHeadingAnchors = false,
  enableCodeCopy = false,
}: MarkdownRendererProps) {
  const codeFenceLines = fencedCodeStartLines(content);
  const remarkPlugins = [
    remarkGfm,
    remarkMath,
    remarkGithubBlockquoteAlert,
    ...(enableHeadingAnchors ? [remarkHeadingAnchors] : []),
  ];
  const components: Components = {};

  if (enableHeadingAnchors) {
    components.h1 = (props) => <ArticleHeading level={1} {...props} />;
    components.h2 = (props) => <ArticleHeading level={2} {...props} />;
    components.h3 = (props) => <ArticleHeading level={3} {...props} />;
  }

  if (enableCodeCopy) {
    components.pre = ({ node, children, ...props }) => {
      const isFenced = codeFenceLines.has(node?.position?.start.line ?? -1);
      if (!isFenced) return <pre {...props}>{children}</pre>;

      const code = Children.toArray(children).map(reactNodeText).join("");
      return (
        <div className={styles.codeBlock}>
          <pre {...props}>{children}</pre>
          <CopyButton
            label="Copy code"
            getText={() => code.replace(/\n$/, "")}
          />
        </div>
      );
    };
  }

  return (
    <div className={`${styles.prose} ${className || ""}`}>
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={[rehypeHighlight, rehypeKatex]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
