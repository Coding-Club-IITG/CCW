import { describe, expect, it } from "vitest";
import { chooseArenaProblem } from "./useContestWorkspace";
import { mergeRoomActivity } from "./useRoomActivity";

describe("contest workspace presentation", () => {
  it("restores last viewed Arena problem before choosing an unclaimed fallback", () => {
    const problems = [{ problemId: "1A" }, { problemId: "4A" }];
    expect(
      chooseArenaProblem(problems, { "1A": "claimed" }, "1A")?.problemId,
    ).toBe("1A");
    expect(
      chooseArenaProblem(problems, { "1A": "claimed" }, "missing")?.problemId,
    ).toBe("4A");
    expect(
      chooseArenaProblem(problems, { "1A": "claimed", "4A": "claimed" })
        ?.problemId,
    ).toBe("1A");
    expect(chooseArenaProblem([], {})).toBeUndefined();
  });
  it("merges retained snapshots and live activity by ID, newest first and bounded", () => {
    const entries = Array.from({ length: 60 }, (_, id) => ({
      id,
      icon: "info",
      text: String(id),
      timestamp: id,
      color: "text-primary",
    }));
    const merged = mergeRoomActivity(entries.slice(20), entries.slice(0, 40));
    expect(merged).toHaveLength(50);
    expect(new Set(merged.map((entry) => entry.id)).size).toBe(50);
    expect(merged[0].id).toBe(59);
    expect(merged.at(-1)?.id).toBe(10);
  });
});
