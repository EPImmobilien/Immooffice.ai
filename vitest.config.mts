import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

/**
 * Vitest-Konfiguration.
 *
 * Der Alias `@/` muss hier gespiegelt werden — Vitest liest tsconfig.json
 * nicht aus.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
});
