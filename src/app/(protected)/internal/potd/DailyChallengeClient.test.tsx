import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { TodayChallengeData } from "@/lib/actions/potd";
import { renderWithUser } from "../../../../../tests/utils/render";
import DailyChallengeClient from "./DailyChallengeClient";

const actions = vi.hoisted(() => ({
  markChallengeOpened: vi.fn(),
  syncMySubmission: vi.fn(),
}));

vi.mock("@/lib/actions/potd", () => ({
  markChallengeOpened: actions.markChallengeOpened,
  syncMySubmission: actions.syncMySubmission,
}));

describe("DailyChallengeClient", () => {
  it("explains scoring and registers the challenge when a member opens it", async () => {
    actions.markChallengeOpened.mockResolvedValueOnce({ ok: true });
    const { user } = renderWithUser(
      <DailyChallengeClient
        cfVerified
        acVerified={false}
        initialData={challengeData()}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Points calculation info" }),
    );
    expect(screen.getByText("Problem Rating ÷ 10")).toBeVisible();

    const solveLink = screen.getByRole("link", { name: "Solve" });
    solveLink.addEventListener("click", (event) => event.preventDefault());
    await user.click(solveLink);

    await waitFor(() => {
      expect(screen.getByText("Not synced yet")).toBeVisible();
    });
  });

  it("updates the visible status after a successful answer sync", async () => {
    actions.syncMySubmission.mockResolvedValueOnce({
      ok: true,
      status: "Accepted",
      pointsAwarded: 125,
    });
    const alert = vi.spyOn(window, "alert").mockImplementation(() => undefined);
    const { user } = renderWithUser(
      <DailyChallengeClient
        cfVerified
        acVerified={false}
        initialData={challengeData("Pending")}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Sync My Answer" }));

    await waitFor(() => {
      expect(screen.getByText("Solved (125 pts)")).toBeVisible();
    });
    expect(alert).toHaveBeenCalledWith("Sync complete! You earned 125 pts.");
  });
});

function challengeData(
  status: "none" | "Pending" | "Accepted" | "Late" | "NotSolved" = "none",
): TodayChallengeData {
  return {
    windowStart: "2026-07-30T00:00:00.000Z",
    windowEnd: "2099-07-30T18:29:59.999Z",
    graceEnd: "2099-07-30T20:29:59.999Z",
    challenges: [
      {
        challengeId: "challenge-1",
        difficulty: "Easy",
        platform: "codeforces",
        problem: {
          contestId: "158",
          problemIndex: "A",
          name: "Next Round",
          rating: 800,
        },
        mySubmission: {
          status,
          solvedAt: null,
          pointsAwarded: 0,
        },
      },
    ],
  };
}
