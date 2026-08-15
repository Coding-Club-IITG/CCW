import { afterEach, describe, expect, it, vi } from "vitest";

import {
  fetchCodeforcesProblemHtml,
  fetchProblemContentForScheduling,
  renderProblemMath,
} from "@/lib/platforms/problemContent";

const mocks = vi.hoisted(() => ({
  getCodeforcesProblemContent: vi.fn(),
  getAtCoderProblemContent: vi.fn(),
}));

vi.mock("@ronits2407/cp-api", () => ({
  cp: {
    codeforces: { getProblemContent: mocks.getCodeforcesProblemContent },
    atcoder: { getProblemContent: mocks.getAtCoderProblemContent },
  },
}));

const content = {
  platform: "CODEFORCES",
  contestId: "158",
  problemId: "A",
  title: "Next Round",
  statementHtml: "<p>Statement</p>",
  inputSpecificationHtml: "<p>Input</p>",
  outputSpecificationHtml: "<p>Output</p>",
  samples: [{ input: "1", output: "2" }],
  sourceUrl: "https://codeforces.com/contest/158/problem/A?locale=en",
};
const originalJinaApiKey = process.env.JINA_API_KEY;

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  if (originalJinaApiKey === undefined) delete process.env.JINA_API_KEY;
  else process.env.JINA_API_KEY = originalJinaApiKey;
});

describe("renderProblemMath", () => {
  it("renders Codeforces triple-dollar formulas", () => {
    const result = renderProblemMath(
      "<p>Given $$$a_1, a_2, \\ldots, a_n$$$ where $$$2^m \\leq n$$$.</p>",
    );

    expect(result).toContain('class="katex"');
    expect(result).not.toContain("$$$");
    expect(result).toContain("a_1");
  });

  it("renders common inline and display delimiters", () => {
    const result = renderProblemMath(
      "<p>\\(x + y\\)</p><p>\\[x^2\\]</p><p>$$z^2$$</p>",
    );

    expect(result.match(/class="katex"/g)).toHaveLength(3);
    expect(result).not.toMatch(/\\\(|\\\[|\$\$/);
  });
});

describe("problem content acquisition", () => {
  it("uses JINA_API_KEY when fetching through Jina Reader", async () => {
    process.env.JINA_API_KEY = "test-jina-key";
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("<html>Problem</html>"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchCodeforcesProblemHtml(content.sourceUrl)).resolves.toBe(
      "<html>Problem</html>",
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://r.jina.ai/http://codeforces.com/contest/158/problem/A?locale=en",
      {
        headers: {
          Authorization: "Bearer test-jina-key",
          "X-Return-Format": "html",
        },
      },
    );
  });

  it("falls back to Jina only for Codeforces access challenges", async () => {
    const accessError = new Error("blocked");
    accessError.name = "ProblemContentAccessError";
    mocks.getCodeforcesProblemContent
      .mockRejectedValueOnce(accessError)
      .mockResolvedValueOnce(content);

    await expect(
      fetchProblemContentForScheduling("codeforces", "158", "A"),
    ).resolves.toMatchObject({ title: "Next Round" });
    expect(mocks.getCodeforcesProblemContent).toHaveBeenNthCalledWith(
      1,
      158,
      "A",
      undefined,
    );
    expect(mocks.getCodeforcesProblemContent).toHaveBeenNthCalledWith(
      2,
      158,
      "A",
      { fetcher: fetchCodeforcesProblemHtml },
    );
  });

  it("does not hide unrelated content-fetch failures", async () => {
    mocks.getCodeforcesProblemContent.mockRejectedValueOnce(
      new Error("request timed out"),
    );

    await expect(
      fetchProblemContentForScheduling("codeforces", "158", "A"),
    ).rejects.toThrow("request timed out");
    expect(mocks.getCodeforcesProblemContent).toHaveBeenCalledTimes(1);
  });
});
