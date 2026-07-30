import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import UploadModal from "./UploadModal";
import type { CurrentUser } from "./types";
import { renderWithUser } from "../../../tests/utils/render";

const currentUser: CurrentUser = {
  id: "head-1",
  name: "Design Head",
  email: "head@example.test",
  role: "Head",
  moduleRoles: [{ module: "Design" }],
  canUpload: true,
  isGlobalAdmin: false,
  isAdmin: true,
  headModules: ["Design"],
};

describe("UploadModal", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("requires a selected file before submitting", async () => {
    const { user } = renderWithUser(
      <UploadModal
        currentUser={currentUser}
        existingFolders={[]}
        onSuccess={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    await user.type(
      screen.getByPlaceholderText("Eg. Q3 Meeting Notes"),
      "Required title",
    );
    await user.click(screen.getByRole("button", { name: /upload file/i }));

    expect(screen.getByText("Please select a file.")).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("submits trimmed metadata and the selected file", async () => {
    const fetchMock = vi
      .mocked(fetch)
      .mockResolvedValue(new Response(JSON.stringify({ file: {} })));
    const onSuccess = vi.fn();
    const { user } = renderWithUser(
      <UploadModal
        currentUser={currentUser}
        existingFolders={["General"]}
        onSuccess={onSuccess}
        onClose={vi.fn()}
      />,
    );

    expect(
      screen.queryByRole("option", { name: "Competitive Programming" }),
    ).toBeNull();
    const fileInput = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    await user.upload(
      fileInput,
      new File(["hello"], "agenda.txt", { type: "text/plain" }),
    );
    const title = screen.getByPlaceholderText("Eg. Q3 Meeting Notes");
    await user.clear(title);
    await user.type(title, "  Team agenda  ");
    await user.click(screen.getByRole("button", { name: /upload file/i }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalledOnce());
    const [, init] = fetchMock.mock.calls[0];
    const body = init?.body as FormData;
    expect(fetchMock.mock.calls[0][0]).toBe("/api/files");
    expect(init?.method).toBe("POST");
    expect(body.get("title")).toBe("Team agenda");
    expect((body.get("file") as File).name).toBe("agenda.txt");
    expect(body.get("uploaderModule")).toBe("Design");
  });
});
