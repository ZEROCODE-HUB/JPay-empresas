import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Config aparte de vite.config.ts: la de Lovable/TanStack Start arma el servidor SSR y no hace falta para tests.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./src/test/setup.ts"],
  },
});
