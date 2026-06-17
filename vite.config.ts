import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [tailwindcss(), reactRouter(), tsconfigPaths()],
  resolve: {
    alias: {
      "@opentelemetry/semantic-conventions": fileURLToPath(
        new URL(
          "./tests/stubs/opentelemetry-semantic-conventions.ts",
          import.meta.url,
        ),
      ),
      "@better-auth/core/dist/instrumentation/attributes.mjs": fileURLToPath(
        new URL(
          "./tests/stubs/better-auth-instrumentation-attributes.ts",
          import.meta.url,
        ),
      ),
    },
  },
});
