import { afterEach, describe, expect, it, vi } from "vitest";

import { errorToLogMetadata, logger, setOpsLogReporter } from "@/lib/logger";

afterEach(() => {
  setOpsLogReporter(undefined);
  vi.restoreAllMocks();
});

describe("Ops logger sink", () => {
  it("reports a direct Error", () => {
    const local = vi.spyOn(console, "error").mockImplementation(() => {});
    const reporter = vi.fn();
    const error = new Error("database unavailable");
    setOpsLogReporter(reporter);

    logger.error("Project listing failed", error);

    expect(reporter).toHaveBeenCalledWith({
      level: "error",
      message: "Project listing failed",
      metadata: error,
      error,
    });
    expect(local).not.toHaveBeenCalled();
  });

  it("preserves an Error normalized with errorToLogMetadata", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const reporter = vi.fn();
    const error = new Error("database unavailable");
    setOpsLogReporter(reporter);

    const metadata = {
      operation: "list-projects",
      ...errorToLogMetadata(error),
    };
    logger.error("Project listing failed", metadata);

    expect(reporter.mock.calls[0]?.[0]).toMatchObject({
      message: "Project listing failed",
      level: "error",
      error,
    });
    expect(JSON.stringify(metadata)).not.toContain("original-error");
  });

  it("finds nested and non-Error failures", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const reporter = vi.fn();
    setOpsLogReporter(reporter);
    const nested = new Error("nested failure");

    logger.error("Nested failure", { context: { error: nested } });
    logger.error("String failure", "upstream rejected");
    logger.error("Normalized failure", errorToLogMetadata("bad result"));

    expect(reporter.mock.calls.map(([report]) => report.error)).toEqual([
      nested,
      "upstream rejected",
      "bad result",
    ]);
  });

  it("reports warnings but leaves info and debug local", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "debug").mockImplementation(() => {});
    const reporter = vi.fn();
    setOpsLogReporter(reporter);

    logger.warn("Dependency retry scheduled", { operation: "retry" });
    logger.info("Worker heartbeat");
    logger.debug("Cache lookup");

    expect(reporter).toHaveBeenCalledOnce();
    expect(reporter.mock.calls[0]?.[0]).toMatchObject({
      level: "warn",
      message: "Dependency retry scheduled",
    });
  });
});
