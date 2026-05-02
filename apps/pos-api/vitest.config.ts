import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    testTimeout: 10000,
    env: {
      NODE_ENV: "test",
      PORT: "3002",
      LOG_LEVEL: "error",
      // DEV ONLY test secret — 32+ chars
      POS_JWT_SECRET: "test-secret-do-not-use-in-production-x7k2",
    },
  },
});
