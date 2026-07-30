import type { ReactElement } from "react";
import { render, type RenderOptions } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

export function renderWithUser(
  ui: ReactElement,
  options?: Omit<RenderOptions, "queries">,
) {
  return {
    user: userEvent.setup(),
    ...render(ui, options),
  };
}
