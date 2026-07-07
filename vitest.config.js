import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./tests/setup.js"],
    include: ["src/**/__tests__/**/*.test.js"],
  },
});
