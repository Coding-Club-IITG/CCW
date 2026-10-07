import { describe, expect, it } from "vitest";

import {
  PULSE_QUIZ_STATUSES,
  PULSE_STATUS_LABELS,
  pulseErrorMessage,
  type PulseAppError,
} from "@/lib/pulse/constants";

describe("PULSE_STATUS_LABELS", () => {
  it("has a label for every PulseQuizStatus", () => {
    for (const status of PULSE_QUIZ_STATUSES) {
      expect(PULSE_STATUS_LABELS[status]).toBeTypeOf("string");
      expect(PULSE_STATUS_LABELS[status].length).toBeGreaterThan(0);
    }
  });

  it("uses the agreed sentence-case labels", () => {
    expect(PULSE_STATUS_LABELS.draft).toBe("Draft");
    expect(PULSE_STATUS_LABELS.lobby_open).toBe("Lobby open");
    expect(PULSE_STATUS_LABELS.interaction_locked).toBe("Interaction locked");
    expect(PULSE_STATUS_LABELS.live).toBe("Live");
    expect(PULSE_STATUS_LABELS.completed).toBe("Completed");
    expect(PULSE_STATUS_LABELS.cancelled).toBe("Cancelled");
    expect(PULSE_STATUS_LABELS.archived).toBe("Archived");
  });
});

describe("pulseErrorMessage", () => {
  function error(
    code: string,
    message = "Server message.",
    fields?: Record<string, string[]>,
  ): PulseAppError {
    return { code, message, fields };
  }

  it("returns a fixed string for PULSE_NOT_AUTHORIZED", () => {
    expect(pulseErrorMessage(error("PULSE_NOT_AUTHORIZED"))).toBe(
      "Sign in to use Pulse.",
    );
  });

  it("returns a fixed string for PULSE_NOT_HOST", () => {
    expect(pulseErrorMessage(error("PULSE_NOT_HOST"))).toBe(
      "You don't have a host assignment for this quiz.",
    );
  });

  it("returns a fixed string for PULSE_QUIZ_NOT_FOUND", () => {
    expect(pulseErrorMessage(error("PULSE_QUIZ_NOT_FOUND"))).toBe(
      "This quiz could not be found.",
    );
  });

  it("returns the server message verbatim for CONFLICT", () => {
    const msg = "The owner is permanent and cannot be changed.";
    expect(pulseErrorMessage(error("CONFLICT", msg))).toBe(msg);
  });

  it("returns a different server message verbatim for CONFLICT", () => {
    const msg = "This email is already assigned to the quiz.";
    expect(pulseErrorMessage(error("CONFLICT", msg))).toBe(msg);
  });

  it("returns the first field message for VALIDATION_ERROR when fields are present", () => {
    expect(
      pulseErrorMessage(
        error("VALIDATION_ERROR", "Invalid.", { email: ["Use an @iitg.ac.in email address."] }),
      ),
    ).toBe("Use an @iitg.ac.in email address.");
  });

  it("falls back to the top-level message for VALIDATION_ERROR with no fields", () => {
    expect(pulseErrorMessage(error("VALIDATION_ERROR", "The submitted data is invalid."))).toBe(
      "The submitted data is invalid.",
    );
  });

  it("falls back to the top-level message for VALIDATION_ERROR with empty fields object", () => {
    expect(
      pulseErrorMessage(error("VALIDATION_ERROR", "The submitted data is invalid.", {})),
    ).toBe("The submitted data is invalid.");
  });

  it("returns a fixed string for NOT_FOUND", () => {
    expect(pulseErrorMessage(error("NOT_FOUND"))).toBe(
      "Co-host assignment not found.",
    );
  });

  it("returns a fixed string for SERVICE_UNAVAILABLE", () => {
    expect(pulseErrorMessage(error("SERVICE_UNAVAILABLE"))).toBe(
      "Something went wrong. Please try again.",
    );
  });

  it("returns the generic fallback for an unknown code", () => {
    expect(pulseErrorMessage(error("INTERNAL_ERROR"))).toBe(
      "An unexpected error occurred. Please try again.",
    );
    expect(pulseErrorMessage(error("RATE_LIMITED"))).toBe(
      "An unexpected error occurred. Please try again.",
    );
  });
});
