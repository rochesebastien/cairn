import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    globals: false,
    // Assertions are made on plain text: no ANSI escapes, ever.
    env: { NO_COLOR: "1", FORCE_COLOR: "0" },
    // Spawning stub runners and writing temp projects is slower than a unit test.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
