import { mergeConfig } from "vitest/config";
import { defineConfig } from "vitest/config";

import viteConfig from "./vite.config";

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      fileParallelism: false,
      include: ["**/*.db.test.ts"],
      setupFiles: ["./tests/db/setup.ts"],
      hookTimeout: 30_000,
      testTimeout: 30_000,
    },
  }),
);
