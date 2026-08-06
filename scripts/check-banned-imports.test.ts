import { describe, expect, test } from "vitest";

import {
  checkBannedImports,
  findBannedImportsInSource,
} from "./check-banned-imports";

const filePath = "app/lib/auth/example.server.ts";

function specifiersIn(contents: string): string[] {
  return findBannedImportsInSource({ contents, filePath }).map(
    (violation) => violation.specifier,
  );
}

describe("banned-import guardrail (#582)", () => {
  test("fires on every import form the repo uses", () => {
    expect(
      specifiersIn(`import { createClient } from "@supabase/supabase-js";`),
    ).toEqual(["@supabase/supabase-js"]);
    expect(specifiersIn(`import "@supabase/ssr";`)).toEqual(["@supabase/ssr"]);
    expect(specifiersIn(`const mod = await import("@supabase/ssr");`)).toEqual([
      "@supabase/ssr",
    ]);
    expect(specifiersIn(`const mod = require("@supabase/ssr");`)).toEqual([
      "@supabase/ssr",
    ]);
    expect(
      specifiersIn(`export { createClient } from "@supabase/ssr";`),
    ).toEqual(["@supabase/ssr"]);
  });

  test("fires on a subpath import, which is the same package", () => {
    expect(
      specifiersIn(`import { parse } from "@supabase/ssr/dist/module";`),
    ).toEqual(["@supabase/ssr/dist/module"]);
  });

  test("reports the reason, which is the whole point of the rule", () => {
    const [violation] = findBannedImportsInSource({
      contents: `import { createClient } from "@supabase/supabase-js";`,
      filePath,
    });

    expect(violation.reason).toContain("ADR-0013");
    expect(violation.lineNumber).toBe(1);
    expect(violation.filePath).toBe(filePath);
  });

  // Explaining why a package is gone must stay cheap to write, or the guardrail
  // buys freshness at the cost of silence.
  test("ignores a comment that names a retired package", () => {
    expect(
      specifiersIn(`// Superseded: we no longer import from "@supabase/ssr".`),
    ).toEqual([]);
    expect(
      specifiersIn(` * The bridge used to import from "@supabase/ssr".`),
    ).toEqual([]);
  });

  test("ignores packages that are not banned, including near-misses", () => {
    expect(specifiersIn(`import { z } from "zod";`)).toEqual([]);
    expect(specifiersIn(`import x from "@supabase-community/other";`)).toEqual(
      [],
    );
    expect(specifiersIn(`import x from "better-auth";`)).toEqual([]);
  });

  // The assertion that actually guards the repo: after #582, no non-test file
  // under app/ or scripts/ may reach for the retired packages.
  test("the repository imports none of them", async () => {
    await expect(checkBannedImports()).resolves.toEqual([]);
  });

  // Test files are out of scope by design — this very file carries the banned
  // specifiers as fixtures. Pinned so the exclusion is a decision, not a
  // coincidence someone tightens away without noticing what breaks.
  test("excludes test files from the repository scan", async () => {
    await expect(
      checkBannedImports({ files: ["scripts/check-banned-imports.test.ts"] }),
    ).resolves.not.toEqual([]);
  });
});
