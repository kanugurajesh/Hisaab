import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: { include: ["tests/unit/**/*.test.ts"], environment: "node", env: { AI_MOCK: "true" } },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
});
