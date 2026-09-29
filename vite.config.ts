import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, loadEnv } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

// A worktree's `.env.local` (`pnpm db:worktree`) holds its own PORT. Strict, so
// a port another server holds fails loudly instead of drifting to the next one
// and leaving the session screenshotting someone else's server. An object
// config, not a callback: the vitest configs `mergeConfig` it.
const port = Number(loadEnv("development", process.cwd(), "").PORT) || 5173;

export default defineConfig({
  plugins: [tailwindcss(), reactRouter(), tsconfigPaths()],
  server: { port, strictPort: true },
});
