import { globSync, readFileSync } from "node:fs";
import path from "node:path";

// Why two projects in each suite: without per-file isolation a worker imports
// shared modules once instead of once per file, which is where most of a
// suite's time goes. But a file that swaps modules or globals (`vi.mock`,
// `vi.stubGlobal`, ...) would leak them into the next file on the same worker,
// so those files keep the default `isolate: true`.
//
// The split is derived from file contents at config-load time, so a test that
// starts calling `vi.mock` moves on its own, with no list to maintain. A test
// also counts when it imports a local helper that makes those calls on its
// behalf (`app/features/portal/test-support/submission.tsx` does).
const swapsModulesOrGlobals =
  /\bvi\.(mock|doMock|hoisted|stubGlobal|stubEnv)\(/;

const withoutExtension = (file: string) =>
  file.replace(/\.[cm]?[jt]sx?$/, "").replace(/\/index$/, "");

export function findModuleSwappingFiles(rootDir: string, testFiles: string[]) {
  const readSource = (file: string) =>
    readFileSync(path.join(rootDir, file), "utf8");
  const mockingHelpers = new Set(
    globSync("{app,tests,scripts}/**/*.{ts,tsx}", { cwd: rootDir })
      .filter((file) => !/\.test\.[jt]sx?$/.test(file))
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
          resolved !== undefined &&
          mockingHelpers.has(withoutExtension(resolved))
        );
      },
    );

  return testFiles.filter((file) => {
    const source = readSource(file);
    return (
      swapsModulesOrGlobals.test(source) || importsMockingHelper(file, source)
    );
  });
}

export const asGlob = (file: string) => file.replace(/[()[\]{}*?!+@]/g, "\\$&");
