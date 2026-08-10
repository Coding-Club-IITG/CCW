import { describe, expect, it } from "vitest";

import { renderProblemMath } from "@/lib/platforms/problemContent";

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
