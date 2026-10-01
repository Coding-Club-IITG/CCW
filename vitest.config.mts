import { defineConfig } from "vitest/config";

const coreCoveragePaths = [
  "src/lib/shared/search.ts",
  "src/lib/auth/policy.ts",
  "src/lib/auth/security.ts",
  "src/lib/auth/identityStore.ts",
  "src/lib/auth/loginSwitch.ts",
  "src/lib/auth/loginSwitchPlugin.ts",
  "src/lib/actions/loginSwitch.ts",
  "src/lib/users/query.ts",
  "src/lib/users/roles.ts",
  "src/lib/shared/pagination.ts",
  "src/proxy.ts",
  "src/app/api/notifications/route.ts",
  "src/lib/potd/schedule.ts",
  "src/lib/potd/scoring.ts",
  "src/lib/potd/derive.ts",
  "src/lib/potd/submit.ts",
  "src/lib/access/*.ts",
  "src/lib/jobs/hackathonReminder.ts",
];

const sharedTestConfig = {
  clearMocks: true,
  restoreMocks: true,
  setupFiles: ["./tests/setup/environment.ts"],
};

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov", "json-summary"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.ts", "src/**/*.d.ts"],
      thresholds: {
        statements: 30,
        branches: 25,
        functions: 23,
        lines: 31,
        [`{${coreCoveragePaths.join(",")}}`]: {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80,
        },
      },
    },
    projects: [
      {
        extends: true,
        test: {
          ...sharedTestConfig,
          name: "node",
          environment: "node",
          fileParallelism: false,
          include: ["src/**/*.test.ts", "tests/integration/**/*.test.ts"],
        },
      },
    ],
  },
});
