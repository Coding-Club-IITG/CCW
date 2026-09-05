import { describe, expect, it, vi } from "vitest";

const fetchProblemContentForScheduling = vi.hoisted(() => vi.fn());

vi.mock("@/lib/platforms/problemContent", () => ({
  fetchProblemContentForScheduling,
}));

import { fetchContestProblemContent } from "@/lib/contests/problemContent";

describe("fetchContestProblemContent", () => {
  it("loads Codeforces content from a compound problem id", async () => {
    fetchProblemContentForScheduling.mockResolvedValueOnce({
      title: "Next Round",
      statementHtml: "<p>Statement</p>",
      inputSpecificationHtml: "<p>Input</p>",
      outputSpecificationHtml: "<p>Output</p>",
      samples: [{ input: "1", output: "2" }],
      sourceUrl: "https://codeforces.com/contest/158/problem/A",
    });

    await expect(
      fetchContestProblemContent({ problemId: "158A" }),
    ).resolves.toMatchObject({ title: "Next Round" });
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
