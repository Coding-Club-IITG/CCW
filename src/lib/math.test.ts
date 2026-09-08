import { describe, expect, it } from "vitest";
import { decodeMathEntities, renderProblemMath } from "@/lib/math";

describe("decodeMathEntities", () => {
  it("decodes HTML entities used inside mathematical expressions", () => {
    expect(decodeMathEntities("x &lt; y &amp;&amp; a &gt; b")).toBe(
      "x < y && a > b",
    );
    expect(decodeMathEntities("&quot;hello&#39;&nbsp;world")).toBe(
      '"hello\' world',
    );
  });
});

describe("renderProblemMath", () => {
  it("renders Codeforces triple-dollar formulas accurately into KaTeX", () => {
    const raw =
      "<p>You are given two numbers $$$x, y$$$. You need to determine if there exists an integer $$$n$$$ such that $$$S(n) = x$$$, $$$S(n + 1) = y$$$.</p>";
    const rendered = renderProblemMath(raw);

    expect(rendered).toContain('class="katex"');
    expect(rendered).not.toContain("$$$");
    expect(rendered).toContain("S(n)");
  });

  it("handles complex LaTeX formulas with sub/superscripts and inequalities", () => {
    const raw =
      "<p>Constraints: $$$1 \\le t \\le 500$$$ and $$$10^{111}-1$$$ with $$$a_i \\neq b_j$$$.</p>";
    const rendered = renderProblemMath(raw);

    expect(rendered).toContain('class="katex"');
    expect(rendered).not.toContain("$$$");
  });

  it("renders display math and alternative delimiters: \\[, \\], \\(, \\), and $$", () => {
    const raw = "<p>\\[x^2 + y^2 = z^2\\]</p><p>\\(a + b\\)</p><p>$$c^2$$</p>";
    const rendered = renderProblemMath(raw);

    expect(rendered.match(/class="katex"/g)).toHaveLength(3);
    expect(rendered).not.toMatch(/\\\(|\\\[|\$\$/);
  });

  it("is idempotent when run multiple times on already-rendered HTML", () => {
    const raw = "<p>Formula $$$x \\le y$$$</p>";
    const firstPass = renderProblemMath(raw);
    const secondPass = renderProblemMath(firstPass);

    expect(secondPass).toBe(firstPass);
  });

  it("safely handles empty or missing inputs", () => {
    expect(renderProblemMath("")).toBe("");
    expect(renderProblemMath(null as unknown as string)).toBeNull();
  });
});
