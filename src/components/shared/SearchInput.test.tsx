import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithUser } from "../../../tests/utils/render";
import SearchInput from "./SearchInput";

describe("SearchInput", () => {
  it("submits typed text with Enter and clears it with the clear button", async () => {
    const onSearch = vi.fn();
    const { user } = renderWithUser(<SearchInput onSearch={onSearch} />);
    const input = screen.getByRole("textbox");

    await user.click(input);
    await user.paste("regex [safe]");
    await user.keyboard("{Enter}");

    expect(onSearch).toHaveBeenCalledWith("regex [safe]");

    await user.click(screen.getByRole("button", { name: "Clear search" }));

    expect(input).toHaveValue("");
    expect(input).toHaveFocus();
    expect(onSearch).toHaveBeenLastCalledWith("");
  });
});
