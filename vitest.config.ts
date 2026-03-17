import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname),
    },
  },
  test: {
    setupFiles: ["src/test-setup.ts"],
    exclude: ["dist/**", "node_modules/**"],
  },
});
