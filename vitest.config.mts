import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const sharedTestConfig = {
  clearMocks: true,
  restoreMocks: true,
  setupFiles: ["./tests/setup/environment.ts"],
};

export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "./coverage",
      include: [
        "src/lib/search.ts",
        "src/lib/roles.ts",
        "src/lib/pagination.ts",
        "src/proxy.ts",
        "src/app/api/notifications/route.ts",
        "src/components/shared/SearchInput.tsx",
        "src/lib/potd/utils.ts",
        "src/lib/potd/derive.ts",
        "src/lib/potd/submit.ts",
      ],
      thresholds: {
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80,
      },
    },
    projects: [
      {
        extends: true,
        test: {
          ...sharedTestConfig,
          name: "node",
          environment: "node",
          include: ["src/**/*.test.ts", "tests/integration/**/*.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          ...sharedTestConfig,
          name: "components",
          environment: "jsdom",
          include: ["src/**/*.test.tsx"],
          setupFiles: [
            "./tests/setup/environment.ts",
            "./tests/setup/components.ts",
          ],
        },
      },
    ],
  },
});
