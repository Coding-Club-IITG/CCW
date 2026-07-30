import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import AdminHackathonsPage from "./page";
import { renderWithUser } from "../../../../../tests/utils/render";

const push = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

describe("AdminHackathonsPage", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "confirm",
      vi.fn(() => true),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          items: [],
          pagination: { page: 1, totalPages: 1 },
        }),
      ),
    );
  });

  it("creates a hackathon with normalized skills and refreshes the list", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ items: [], pagination: { totalPages: 1 } }),
      )
      .mockResolvedValueOnce(jsonResponse({ hackathon: {} }, 201))
      .mockResolvedValueOnce(
        jsonResponse({ items: [], pagination: { totalPages: 1 } }),
      );
    const { user } = renderWithUser(<AdminHackathonsPage />);

    await screen.findByText("No hackathons yet.");
    await user.click(screen.getByRole("button", { name: "+ New Hackathon" }));
    await user.type(
      screen.getByPlaceholderText("Hackathon name"),
      "Build Sprint",
    );
    await user.type(
      screen.getByPlaceholderText("Organizing body"),
      "Coding Club",
    );
    await user.type(
      screen.getByPlaceholderText("React, Python, ML"),
      " TypeScript, , Design ",
    );
    await user.type(
      screen.getByPlaceholderText("https://hackathon.example.com"),
      "https://example.test/hackathon",
    );
    const deadline = document.querySelector(
      'input[type="datetime-local"]',
    ) as HTMLInputElement;
    await user.type(deadline, "2030-08-03T10:30");
    await user.click(screen.getByRole("button", { name: "Create Hackathon" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    const [, init] = fetchMock.mock.calls[1];
    expect(fetchMock.mock.calls[1][0]).toBe("/api/admin/hackathons");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toMatchObject({
      name: "Build Sprint",
      organization: "Coding Club",
      skills: ["TypeScript", "Design"],
      deadline: "2030-08-03T10:30",
    });
  });

  it("archives an active hackathon after confirmation", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          items: [
            {
              _id: "hackathon-1",
              name: "Build Sprint",
              organization: "Coding Club",
              minMembers: 1,
              maxMembers: 3,
              skills: [],
              websiteUrl: "https://example.test",
              deadline: "2030-08-03T10:30:00.000Z",
              description: "",
              status: "active",
              createdAt: "2030-01-01T00:00:00.000Z",
            },
          ],
          pagination: { totalPages: 1 },
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ hackathon: {} }))
      .mockResolvedValueOnce(
        jsonResponse({ items: [], pagination: { totalPages: 1 } }),
      );
    const { user } = renderWithUser(<AdminHackathonsPage />);

    await user.click(await screen.findByRole("button", { name: "Archive" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/admin/hackathons/hackathon-1",
        { method: "DELETE" },
      ),
    );
    expect(confirm).toHaveBeenCalledWith("Archive this hackathon?");
  });
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
