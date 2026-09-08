import { describe, expect, it, vi } from "vitest";

const fetchProblemContentForScheduling = vi.hoisted(() => vi.fn());

vi.mock("@/lib/platforms/problemContent", () => ({
  fetchProblemContentForScheduling,
}));

import { fetchContestProblemContent } from "@/lib/contests/problemContent";

describe("fetchContestProblemContent", () => {
  it("loads Codeforces content from a compound problem id and renders math", async () => {
    fetchProblemContentForScheduling.mockResolvedValueOnce({
      title: "Next Round",
      statementHtml: "<p>You are given two numbers $$$x, y$$$.</p>",
      inputSpecificationHtml: "<p>Input $$$1 \\le t \\le 500$$$</p>",
      outputSpecificationHtml: "<p>Output</p>",
      notesHtml: "<p>Notes $$$10^{111}-1$$$</p>",
      samples: [{ input: "1", output: "2" }],
      sourceUrl: "https://codeforces.com/contest/158/problem/A",
    });

    const result = await fetchContestProblemContent({ problemId: "158A" });
    expect(result).not.toBeNull();
    expect(result?.statementHtml).toContain('class="katex"');
    expect(result?.statementHtml).not.toContain("$$$");
    expect(result?.inputSpecificationHtml).toContain('class="katex"');
    expect(result?.notesHtml).toContain('class="katex"');
    expect(fetchProblemContentForScheduling).toHaveBeenCalledWith(
      "codeforces",
      "158",
      "A",
    );
  });

  it("returns no content for malformed or unsupported problems", async () => {
    await expect(
      fetchContestProblemContent({ problemId: "not-a-problem" }),
    ).resolves.toBeNull();
    await expect(
      fetchContestProblemContent({ platform: "atcoder", problemId: "abc_a" }),
    ).resolves.toBeNull();
  });

  it("keeps room provisioning resilient when content fetch fails", async () => {
    fetchProblemContentForScheduling.mockRejectedValueOnce(
      new Error("Codeforces unavailable"),
    );

    await expect(
      fetchContestProblemContent({ problemId: "158A" }),
    ).resolves.toBeNull();
  });
});
