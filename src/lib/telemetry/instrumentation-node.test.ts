import { afterEach, describe, expect, it, vi } from "vitest";

import { logger, setOpsLogReporter } from "@/lib/logger";
import { installOpsLoggerSink } from "@/lib/telemetry/instrumentation-node";

afterEach(() => {
  setOpsLogReporter(undefined);
  vi.restoreAllMocks();
});

describe("web Ops logger compatibility sink", () => {
  it("forwards only approved attributes and aliases action to operation", () => {
    const error = vi.fn();
    installOpsLoggerSink({ error } as never);

    logger.error("Project update failed", {
      action: "update-project",
      component: "server-action",
      retryable: false,
      arbitrary: "must-not-leave-ccw",
    });

    expect(error).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledWith("Project update failed", {
      attributes: {
        operation: "update-project",
        component: "server-action",
        retryable: false,
      },
    });
  });

  it("keeps default logging local when no server sink is installed", () => {
    const local = vi.spyOn(console, "warn").mockImplementation(() => {});

    logger.warn("Browser-safe warning", { action: "render" });

    expect(local).toHaveBeenCalledOnce();
  });
});
