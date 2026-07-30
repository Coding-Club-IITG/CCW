import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import HackathonDetailPage from "./page";
import { renderWithUser } from "../../../../../../tests/utils/render";

vi.mock("@/lib/auth-client", () => ({
  useSession: () => ({
    data: {
      user: {
        id: "member-1",
        name: "Member One",
        email: "member@example.test",
      },
    },
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn() }),
}));

describe("HackathonDetailPage", () => {
  beforeEach(() => {
    vi.stubGlobal("alert", vi.fn());
  });

  it("creates a team and refreshes the hackathon state", async () => {
    const event = {
      _id: "event-1",
      name: "Build Sprint",
      organization: "Coding Club",
      minMembers: 1,
      maxMembers: 3,
      skills: ["TypeScript"],
      websiteUrl: "https://example.test",
      ogImage: "",
      deadline: "2030-08-03T10:30:00.000Z",
      description: "Build",
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ hackathon: event, teams: [] }))
      .mockResolvedValueOnce(jsonResponse({ team: { _id: "team-1" } }, 201))
      .mockResolvedValueOnce(
        jsonResponse({
          hackathon: event,
          teams: [
            {
              _id: "team-1",
              name: "Test Team",
              owner: "member-1",
              members: ["member-1"],
              memberDetails: [{ id: "member-1", name: "Member One" }],
              status: "open",
              description: "Deterministic",
            },
          ],
        }),
      )
      .mockResolvedValue(jsonResponse({ items: [], users: {} }));
    vi.stubGlobal("fetch", fetchMock);
    const { user } = renderWithUser(
      <HackathonDetailPage params={Promise.resolve({ id: "event-1" })} />,
    );

    expect(await screen.findByText("Build Sprint")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "+ Create a Team" }));
    await user.type(screen.getByPlaceholderText("Your team name"), "Test Team");
    await user.type(
      screen.getByPlaceholderText("What skills are you looking for?"),
      "Deterministic",
    );
    await user.click(screen.getByRole("button", { name: "Create Team" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/hackathons/event-1/teams",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            name: "Test Team",
            description: "Deterministic",
          }),
        }),
      ),
    );
    expect(await screen.findByText("Your Team: Test Team")).toBeInTheDocument();
  });
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
