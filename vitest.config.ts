import { mergeConfig } from "vitest/config";
import { configDefaults, defineConfig } from "vitest/config";
import { globSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { UserConfig } from "vite";

import {
  asGlob,
  findModuleSwappingFiles,
} from "./tests/setup/module-swapping-files";
import { testReporters } from "./tests/setup/test-reporters";
import viteConfig from "./vite.config";

const testExclude = [
  ...configDefaults.exclude,
  "**/*.db.test.ts",
  "**/.claude/worktrees/**",
];

const rootDir = fileURLToPath(new URL(".", import.meta.url));
const testFiles = configDefaults.include.flatMap((pattern) =>
  globSync(pattern, { cwd: rootDir, exclude: testExclude }),
);
const isolatedFiles = findModuleSwappingFiles(rootDir, testFiles);

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
      reporters: testReporters,
      // Two or three sessions run this suite on the same laptop at once, and
      // each took Vitest's default of (cores - 1) workers, which starved tests
      // that take under a second alone past the default 5 s timeout (#1426).
      // Half the cores runs the suite no slower there, and 20 s still fails a
      // test that truly hangs. CI keeps the default: its runner is not shared,
      // and on 4 cores the cap made the unit job ~60% slower.
      maxWorkers: process.env.CI ? undefined : "50%",
      testTimeout: 20_000,
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
      exclude: testExclude,
      projects: [
        {
          extends: true,
          test: {
            name: "unit-isolated",
            include: isolatedFiles.map(asGlob),
          },
        },
        {
          extends: true,
          test: {
            name: "unit-shared",
            // `extends: true` appends this to the root `exclude`.
            exclude: isolatedFiles.map(asGlob),
            isolate: false,
          },
        },
      ],
    },
  }),
);
