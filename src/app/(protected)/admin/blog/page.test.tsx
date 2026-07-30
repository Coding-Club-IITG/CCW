import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminBlogPage from "./page";
import { renderWithUser } from "../../../../../tests/utils/render";

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, back: vi.fn() }),
}));

describe("AdminBlogPage", () => {
  beforeEach(() => {
    push.mockReset();
    vi.stubGlobal(
      "confirm",
      vi.fn(() => true),
    );
    vi.stubGlobal("alert", vi.fn());
  });

  it("creates a draft and opens its editor", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ items: [], pagination: { totalPages: 1 } }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ post: { slug: "untitled-post" } }, 201),
      );
    vi.stubGlobal("fetch", fetchMock);
    const { user } = renderWithUser(<AdminBlogPage />);

    await screen.findByText(/No blog posts yet/);
    await user.click(screen.getByRole("button", { name: "New Post" }));

    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/admin/blog/untitled-post/edit"),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/blog",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          title: "Untitled Post",
          content: "",
          excerpt: "",
          tags: [],
          status: "draft",
        }),
      }),
    );
  });

  it("removes a confirmed deleted post from the rendered list", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          items: [
            {
              _id: "post-1",
              slug: "published-post",
              title: "Published Post",
              excerpt: "",
              tags: [],
              status: "published",
              authors: [{ userId: "author", name: "Author" }],
              publishedAt: "2030-01-01T00:00:00.000Z",
              createdAt: "2030-01-01T00:00:00.000Z",
              updatedAt: "2030-01-01T00:00:00.000Z",
            },
          ],
          pagination: { totalPages: 1 },
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ success: true }));
    vi.stubGlobal("fetch", fetchMock);
    const { user } = renderWithUser(<AdminBlogPage />);

    expect(await screen.findByText("Published Post")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() =>
      expect(screen.queryByText("Published Post")).not.toBeInTheDocument(),
    );
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/blog/published-post", {
      method: "DELETE",
    });
  });
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
