import GithubSlugger from "github-slugger";
import { fromMarkdown } from "mdast-util-from-markdown";

export interface MarkdownHeading {
  id: string;
  text: string;
  depth: 1 | 2 | 3;
}

interface MarkdownNode {
  type?: string;
  value?: string;
  alt?: string;
  depth?: number;
  children?: MarkdownNode[];
  data?: {
    hProperties?: Record<string, unknown>;
  };
}

function visibleText(node: MarkdownNode): string {
  if (node.type === "image") return node.alt ?? "";
  if (typeof node.value === "string") return node.value;
  return node.children?.map(visibleText).join("") ?? "";
}

function isOutlineHeading(
  node: MarkdownNode,
): node is MarkdownNode & { depth: 1 | 2 | 3 } {
  return (
    node.type === "heading" &&
    (node.depth === 1 || node.depth === 2 || node.depth === 3)
  );
}

function walkMarkdown(node: MarkdownNode, visit: (node: MarkdownNode) => void) {
  visit(node);
  for (const child of node.children ?? []) walkMarkdown(child, visit);
}

export function extractMarkdownHeadings(content: string): MarkdownHeading[] {
  const tree = fromMarkdown(content) as MarkdownNode;
  const slugger = new GithubSlugger();
  const headings: MarkdownHeading[] = [];

  walkMarkdown(tree, (node) => {
    if (!isOutlineHeading(node)) return;
    const text = visibleText(node).trim();
    if (!text) return;
    headings.push({ id: slugger.slug(text), text, depth: node.depth });
  });
  return headings;
}

export function remarkHeadingAnchors() {
  return (tree: MarkdownNode) => {
    const slugger = new GithubSlugger();

    walkMarkdown(tree, (node) => {
      if (!isOutlineHeading(node)) return;
      const text = visibleText(node).trim();
      if (!text) return;
      node.data ??= {};
      node.data.hProperties = {
        ...node.data.hProperties,
        id: slugger.slug(text),
      };
    });
  };
}
