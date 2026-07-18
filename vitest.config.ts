import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "core/src/**/*.test.ts",
      "schema/src/**/*.test.ts",
      "cli/src/**/*.test.ts",
      "importer/src/**/*.test.ts",
      "drivers/*/src/**/*.test.ts",
      "ui/src/**/*.test.ts",
    ],
  },
});
