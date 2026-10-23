import { defineConfig } from "vitest/config";

// One test run for the whole monorepo: `pnpm test` from the root.
export default defineConfig({
  test: {
    projects: ["packages/shared", "apps/api", "apps/web", "infra"],
  },
});
