import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import FilesClient from "./FilesClient";
import type { CurrentUser, FileEntry } from "./types";
import { renderWithUser } from "../../../tests/utils/render";

const files: FileEntry[] = [
  {
    _id: "view-file",
    title: "Design handbook",
    description: "Brand guidance",
    originalName: "handbook.txt",
    mimeType: "text/plain",
    size: 2048,
    folder: "Design",
    uploadedBy: "owner-2",
    uploadedByName: "Design Head",
    uploaderModule: "Design",
    isDownloadable: false,
    accessControl: {
      allMembers: true,
      allowedModules: [],
      allowedGlobalRoles: [],
      allowedModuleRoles: [],
      allowedUsers: [],
    },
    createdAt: "2026-01-15T00:00:00.000Z",
  },
  {
    _id: "owned-file",
    title: "Meeting notes",
    description: "",
    originalName: "notes.pdf",
    mimeType: "application/pdf",
    size: 512,
    folder: "Minutes",
    uploadedBy: "member-1",
    uploadedByName: "Test Member",
    uploaderModule: null,
    isDownloadable: true,
    accessControl: {
      allMembers: false,
      allowedModules: [],
      allowedGlobalRoles: [],
      allowedModuleRoles: [],
      allowedUsers: [],
    },
    createdAt: "2026-01-16T00:00:00.000Z",
  },
];

const currentUser: CurrentUser = {
  id: "member-1",
  name: "Test Member",
  email: "member@example.test",
  role: "Member",
  moduleRoles: [],
  canUpload: false,
  isGlobalAdmin: false,
  isAdmin: false,
  headModules: [],
};

describe("FilesClient", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          items: files,
          pagination: { page: 1, totalPages: 1 },
        }),
      ),
    );
    vi.stubGlobal("confirm", vi.fn(() => true));
    vi.stubGlobal("alert", vi.fn());
    URL.createObjectURL = vi.fn(() => "blob:test-file");
    URL.revokeObjectURL = vi.fn();
  });

  it("filters fetched files and exposes management actions only for owned files", async () => {
    const { user } = renderWithUser(<FilesClient currentUser={currentUser} />);

    expect(await screen.findByText("Design handbook")).toBeInTheDocument();
    expect(screen.getByText("Meeting notes")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /upload file/i })).toBeNull();

    const designRow = screen.getByText("Design handbook").closest("tr")!;
    const ownedRow = screen.getByText("Meeting notes").closest("tr")!;
    expect(within(designRow).queryByTitle("Edit")).toBeNull();
    expect(within(ownedRow).getByTitle("Edit")).toBeInTheDocument();
    expect(within(ownedRow).getByTitle("Delete")).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText("Search files…"), "design");

    expect(screen.getByText("Design handbook")).toBeInTheDocument();
    expect(screen.queryByText("Meeting notes")).toBeNull();
  });

  it("opens a view-only file and deletes an owned file after confirmation", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          items: files,
          pagination: { page: 1, totalPages: 1 },
        }),
      )
      .mockResolvedValueOnce(
        new Response(new Blob(["preview"], { type: "text/plain" }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ success: true }))
      .mockResolvedValueOnce(
        jsonResponse({
          items: files,
          pagination: { page: 1, totalPages: 1 },
        }),
      );
    const { user } = renderWithUser(<FilesClient currentUser={currentUser} />);

    const designRow = (await screen.findByText("Design handbook")).closest(
      "tr",
    )!;
    await user.click(within(designRow).getByTitle("View file"));
    expect(await screen.findByText("handbook.txt")).toBeInTheDocument();

    await user.click(screen.getByTitle("Close"));
    const ownedRow = screen.getByText("Meeting notes").closest("tr")!;
    await user.click(within(ownedRow).getByTitle("Delete"));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/files/owned-file", {
        method: "DELETE",
      });
    });
    expect(confirm).toHaveBeenCalledWith(
      expect.stringContaining('Delete "Meeting notes"?'),
    );
  });
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
