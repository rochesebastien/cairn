import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    globals: false,
    // The CLI helpers this server reuses colour their output; tests assert on
    // plain payloads, so keep ANSI escapes out of the way.
    env: { NO_COLOR: "1", FORCE_COLOR: "0" },
    // Temp projects and jiti config loading are slower than a unit test.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
