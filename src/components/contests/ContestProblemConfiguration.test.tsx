import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import ContestProblemConfiguration from "@/components/contests/ContestProblemConfiguration";
import {
  ContestCreationForm,
  createInitialContestForm,
} from "@/components/contests/contestCreationForm";

function Harness() {
  const [form, setForm] = useState<ContestCreationForm>(
    createInitialContestForm,
  );

  return (
    <ContestProblemConfiguration
      form={form}
      setForm={setForm}
      presetLocked={false}
      fineTunedCountError=""
      setFineTunedCountError={() => undefined}
      bracketRoundProblems={[]}
      setBracketRoundProblems={() => undefined}
    />
  );
}

describe("ContestProblemConfiguration", () => {
  it("preserves the problem-selection control and its bulk fields", () => {
    render(<Harness />);

    expect(
      screen.getByRole("combobox", { name: "Selection Mode" }),
    ).toHaveValue("bulk");
    expect(screen.getByRole("spinbutton", { name: "Min Rating" })).toHaveValue(
      800,
    );
  });

  it("switches to the existing fine-tuned controls", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Selection Mode" }),
      "fine-tuned",
    );

    expect(
      screen.getByRole("spinbutton", { name: "Number of Problems" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: "Problem 1" }),
    ).toBeInTheDocument();
  });
});
