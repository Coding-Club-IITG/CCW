import { describe, expect, it } from "vitest";
import { rankRelatedPosts, type RelatedPostCandidate } from "./relatedPosts";

function post(
  _id: string,
  tags: string[],
  publishedAt: string,
  status = "published",
): RelatedPostCandidate {
  return { _id, tags, publishedAt, status };
}

describe("rankRelatedPosts", () => {
  it("filters drafts, the current post, and posts without matching tags", () => {
    const result = rankRelatedPosts(
      [
        post("current", ["web"], "2026-01-04"),
        post("draft", ["web"], "2026-01-03", "draft"),
        post("unrelated", ["systems"], "2026-01-02"),
        post("match", ["web"], "2026-01-01"),
      ],
      "current",
      ["web"],
    );
    expect(result.map(({ _id }) => _id)).toEqual(["match"]);
  });

  it("ranks by shared tags, then publication date, and limits to three", () => {
    const result = rankRelatedPosts(
      [
        post("new-one-tag", ["web"], "2026-04-01"),
        post("old-two-tags", ["web", "react"], "2026-01-01"),
        post("new-two-tags", ["web", "react"], "2026-03-01"),
        post("third", ["web"], "2026-02-01"),
        post("fourth", ["web"], "2026-01-01"),
      ],
      "current",
      ["web", "react"],
    );
    expect(result.map(({ _id }) => _id)).toEqual([
      "new-two-tags",
      "old-two-tags",
      "new-one-tag",
    ]);
  });

  it("returns no fallback posts when the tag set is empty", () => {
    expect(
      rankRelatedPosts([post("one", ["web"], "2026-01-01")], "current", []),
    ).toEqual([]);
  });
});
