import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import BlogEditor from "./BlogEditor";
import { renderWithUser } from "../../../tests/utils/render";

describe("BlogEditor", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("validates a title before saving", async () => {
    const onSave = vi.fn();
    const { user } = renderWithUser(
      <BlogEditor
        onSave={onSave}
        isNew
        canManageAuthors={false}
        canManageStatus={false}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Create Post" }));
    expect(screen.getByText("Title is required.")).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("submits content, custom tags, publication status, and selected authors", async () => {
    const fetchMock = vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [{ _id: "author-2", name: "Second Author" }],
        }),
        { status: 200 },
      ),
    );
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { user } = renderWithUser(
      <BlogEditor
        onSave={onSave}
        isNew
        initialData={{
          title: "",
          content: "",
          excerpt: "",
          coverImage: "",
          tags: [],
          status: "draft",
          authors: [],
        }}
      />,
    );

    await user.type(screen.getByPlaceholderText("Post title"), "New article");
    await user.type(
      screen.getByPlaceholderText("Brief summary shown in the blog listing..."),
      "Summary",
    );
    await user.type(
      screen.getByPlaceholderText("Write your blog post in Markdown..."),
      "# Content",
    );
    await user.type(screen.getByPlaceholderText("Add custom tag..."), "Custom");
    await user.click(screen.getByRole("button", { name: "Add" }));
    await user.selectOptions(
      screen.getAllByRole("combobox").at(-1)!,
      "published",
    );
    await user.type(
      screen.getByPlaceholderText(
        "Search members by name or email to add as author…",
      ),
      "Second",
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    await user.selectOptions(
      screen.getByRole("option", { name: "Add an author..." })
        .parentElement as HTMLSelectElement,
      "author-2",
    );
    await user.click(screen.getByRole("button", { name: "Create Post" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onSave).toHaveBeenCalledWith({
      title: "New article",
      content: "# Content",
      excerpt: "Summary",
      coverImage: "",
      coverFocalPoint: { x: 0.5, y: 0.5 },
      tags: ["Custom"],
      status: "published",
      authors: [{ userId: "author-2", name: "Second Author" }],
    });
  });
});
