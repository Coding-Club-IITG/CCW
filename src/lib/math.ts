import katex from "katex";

type MathDelimiter = {
  pattern: RegExp;
  displayMode: boolean;
};

const MATH_DELIMITERS: MathDelimiter[] = [
  { pattern: /\$\$\$([\s\S]*?)\$\$\$/g, displayMode: false },
  { pattern: /\\\[([\s\S]*?)\\\]/g, displayMode: true },
  { pattern: /\\\(([\s\S]*?)\\\)/g, displayMode: false },
  { pattern: /\$\$([\s\S]*?)\$\$/g, displayMode: true },
];

export function decodeMathEntities(value: string): string {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&nbsp;", " ");
}

export function renderProblemMath(html: string): string {
  if (!html) return html;
  return MATH_DELIMITERS.reduce(
    (rendered, delimiter) =>
      rendered.replace(delimiter.pattern, (_, math: string) =>
        katex.renderToString(decodeMathEntities(math), {
          displayMode: delimiter.displayMode,
          throwOnError: false,
          output: "htmlAndMathml",
        }),
      ),
    html,
  );
}
