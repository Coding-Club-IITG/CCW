import { cp } from "@ronits2407/cp-api";
import katex from "katex";

import type { Platform } from "@/lib/constants";

export type ProblemContentSnapshot = {
  title: string;
  statementHtml: string;
  inputSpecificationHtml: string;
  outputSpecificationHtml: string;
  constraintsHtml?: string;
  notesHtml?: string;
  samples: Array<{ input: string; output: string }>;
  timeLimitMs?: number;
  memoryLimitMb?: number;
  sourceUrl: string;
};

export type ProblemContentFetcher = (url: string) => Promise<string>;

type ProblemContentOptions = {
  fetcher?: ProblemContentFetcher;
};

const READER_URL = "https://r.jina.ai/";

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

function decodeMathEntities(value: string): string {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&nbsp;", " ");
}

export function renderProblemMath(html: string): string {
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

type ProblemContentClient = {
  getProblemContent: (
    contestId: number | string,
    problemIndex: string,
    options?: ProblemContentOptions,
  ) => Promise<
    ProblemContentSnapshot & {
      platform: string;
      contestId: string;
      problemId: string;
    }
  >;
};

export async function fetchProblemContent(
  platform: Platform,
  contestId: string,
  problemIndex: string,
  options?: ProblemContentOptions,
): Promise<ProblemContentSnapshot> {
  const client = cp[platform] as unknown as Partial<ProblemContentClient>;
  if (!client.getProblemContent) {
    throw new Error("Installed CP-API does not support problem content");
  }

  const content =
    platform === "codeforces"
      ? await client.getProblemContent(Number(contestId), problemIndex, options)
      : await client.getProblemContent(contestId, problemIndex);

  return {
    title: content.title,
    statementHtml: content.statementHtml,
    inputSpecificationHtml: content.inputSpecificationHtml,
    outputSpecificationHtml: content.outputSpecificationHtml,
    constraintsHtml: content.constraintsHtml,
    notesHtml: content.notesHtml,
    samples: content.samples,
    timeLimitMs: content.timeLimitMs,
    memoryLimitMb: content.memoryLimitMb,
    sourceUrl: content.sourceUrl,
  };
}

/** Fetch a Codeforces problem page through Jina Reader */
export const fetchCodeforcesProblemHtml: ProblemContentFetcher = async (
  url,
) => {
  const target = new URL(url);
  if (target.hostname !== "codeforces.com") {
    throw new Error("Jina fallback only supports Codeforces URLs");
  }

  // Jina accepts the target URL as part of the Reader endpoint path
  target.protocol = "http:";
  const apiKey = process.env.JINA_API_KEY?.trim();
  const response = await fetch(`${READER_URL}${target.toString()}`, {
    headers: {
      "X-Return-Format": "html",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
  });
  if (!response.ok) {
    throw new Error(`Jina Reader returned HTTP ${response.status}`);
  }
  return response.text();
};

/**
 * Fetch content while scheduling, retrying Codeforces verification challenges
 */
export async function fetchProblemContentForScheduling(
  platform: Platform,
  contestId: string,
  problemIndex: string,
): Promise<ProblemContentSnapshot> {
  try {
    return await fetchProblemContent(platform, contestId, problemIndex);
  } catch (error) {
    if (
      platform !== "codeforces" ||
      !(error instanceof Error) ||
      error.name !== "ProblemContentAccessError"
    ) {
      throw error;
    }

    return fetchProblemContent(platform, contestId, problemIndex, {
      fetcher: fetchCodeforcesProblemHtml,
    });
  }
}
