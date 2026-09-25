import { mergeConfig } from "vitest/config";
import { configDefaults, defineConfig } from "vitest/config";
import { globSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { UserConfig } from "vite";

import viteConfig from "./vite.config";

const testExclude = [
  ...configDefaults.exclude,
  "**/*.db.test.ts",
  "**/.sandcastle/**",
  "**/.claude/worktrees/**",
];

// Why two projects: without per-file isolation each worker imports shared
// modules once instead of once per file, which is where most of this suite's
// time goes. But a file that swaps modules or globals (`vi.mock`,
// `vi.stubGlobal`, ...) would leak them into the next file on the same worker,
// so those files keep the default `isolate: true` in `unit-isolated`, and every
// other file runs in `unit-shared` with `isolate: false`.
//
// The split is derived from file contents at config-load time, so a test that
// starts calling `vi.mock` moves to `unit-isolated` on its own, with no list to
// maintain. A test also counts when it imports a local helper that makes those
// calls on its behalf (`app/features/portal/test-support/submission.tsx` does).
const swapsModulesOrGlobals =
  /\bvi\.(mock|doMock|hoisted|stubGlobal|stubEnv)\(/;

const rootDir = fileURLToPath(new URL(".", import.meta.url));
const readSource = (file: string) =>
  readFileSync(path.join(rootDir, file), "utf8");
const withoutExtension = (file: string) =>
  file.replace(/\.[cm]?[jt]sx?$/, "").replace(/\/index$/, "");

const testFiles = configDefaults.include.flatMap((pattern) =>
  globSync(pattern, { cwd: rootDir, exclude: testExclude }),
);
const mockingHelpers = new Set(
  globSync("{app,tests,scripts}/**/*.{ts,tsx}", { cwd: rootDir })
    .filter((file) => !testFiles.includes(file))
    .filter((file) => swapsModulesOrGlobals.test(readSource(file)))
    .map(withoutExtension),
);
const importsMockingHelper = (file: string, source: string) =>
  [...source.matchAll(/(?:from|import\(?)\s*["']([^"']+)["']/g)].some(
    ([, specifier]) => {
      const resolved = specifier.startsWith("@/")
        ? path.join("app", specifier.slice(2))
        : specifier.startsWith(".")
          ? path.join(path.dirname(file), specifier)
          : undefined;
      return (
        resolved !== undefined && mockingHelpers.has(withoutExtension(resolved))
      );
    },
  );
const isolatedFiles = testFiles.filter((file) => {
  const source = readSource(file);
  return (
    swapsModulesOrGlobals.test(source) || importsMockingHelper(file, source)
  );
});
const asGlob = (file: string) => file.replace(/[()[\]{}*?!+@]/g, "\\$&");

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
