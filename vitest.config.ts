import { mergeConfig } from "vitest/config";
import { configDefaults, defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import type { UserConfig } from "vite";

import viteConfig from "./vite.config";

export default mergeConfig(
  viteConfig as UserConfig,
  defineConfig({
    resolve: {
      alias: {
        "@opentelemetry/semantic-conventions": fileURLToPath(
          new URL(
            "./tests/stubs/opentelemetry-semantic-conventions.ts",
            import.meta.url,
          ),
        ),
      },
    },
    test: {
      setupFiles: ["./tests/setup/react-test-env.ts"],
      server: {
        deps: {
          // `better-auth` drags in `@opentelemetry/semantic-conventions`, whose
          // `build/esm/index.js` does `export * from './trace'` — a directory
          // import that Node's native ESM loader does not resolve. Left
          // external, `better-auth` is loaded natively and its import of
          // semantic-conventions dodges the alias/stub → "Directory import ...
          // is not supported". Inlined, Vite processes the chain and the stub's
          // alias applies.
          // (`vitest.db.fast.config.ts` does not fail because it uses `inline: true`.)
          inline: [
            /@opentelemetry\/semantic-conventions/,
            /(^|\/)better-auth/,
            /@better-auth\//,
          ],
        },
      },
      exclude: [
        ...configDefaults.exclude,
        "**/*.db.test.ts",
        "**/.sandcastle/**",
        "**/.claude/worktrees/**",
      ],
    },
  }),
);
