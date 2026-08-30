import { describe, expect, it } from "vitest";
import { extractMarkdownHeadings } from "./markdownHeadings";

describe("extractMarkdownHeadings", () => {
  it("extracts h1 through h3 and ignores deeper headings", () => {
    expect(
      extractMarkdownHeadings(
        "# Overview\n\n## Details with *emphasis*\n\n### `API` notes\n\n#### Hidden",
      ),
    ).toEqual([
      { id: "overview", text: "Overview", depth: 1 },
      {
        id: "details-with-emphasis",
        text: "Details with emphasis",
        depth: 2,
      },
      { id: "api-notes", text: "API notes", depth: 3 },
    ]);
  });

  it("creates GitHub-compatible duplicate and Unicode anchors", () => {
    expect(
      extractMarkdownHeadings(
        "## Café 你好\n\n## Café 你好\n\n## Punctuation: yes!",
      ),
    ).toEqual([
      { id: "café-你好", text: "Café 你好", depth: 2 },
      { id: "café-你好-1", text: "Café 你好", depth: 2 },
      { id: "punctuation-yes", text: "Punctuation: yes!", depth: 2 },
    ]);
  });

  it("returns an empty outline when there are no eligible headings", () => {
    expect(extractMarkdownHeadings("A paragraph\n\n#### Too deep")).toEqual([]);
  });

  it("preserves document order for headings nested in other blocks", () => {
    expect(
      extractMarkdownHeadings("> ## Quoted section\n\n- ### List section"),
    ).toEqual([
      { id: "quoted-section", text: "Quoted section", depth: 2 },
      { id: "list-section", text: "List section", depth: 3 },
    ]);
  });
});
