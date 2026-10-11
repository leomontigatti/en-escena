import { RuleTester } from "oxlint/plugins-dev";
import { describe, it } from "vitest";

import docsTestsPlugin from "./oxlint-docs-tests-plugin.mjs";

RuleTester.describe = describe;
RuleTester.it = it;

const filename = "app/lib/shared/example.test.ts";
const errors = 1;

new RuleTester().run("no-fixed-text", docsTestsPlugin.rules["no-fixed-text"], {
  valid: [
    // A value the doc must state, read from the module that enforces it.
    {
      filename,
      code: `
          const page = await readFile("docs/operations/infrastructure.md", "utf8");
          expect(page).toContain(\`**\${policy.signedUrlExpiresInSeconds}** seconds\`);
        `,
    },
    // Every entry of an authoritative list named in the doc's prose copy.
    {
      filename,
      code: `
          const mapped = docMap.flatMap(({ doc, code }) => [doc, ...code]);
          for (const path of ["docs/agents/coding-standards.md"]) {
            const contents = await readFile(path, "utf8");
            for (const entry of mapped) expect(contents).toContain(entry);
          }
        `,
    },
    // Each part of the doc held to a format: a structural check.
    {
      filename,
      code: `
          const glossary = await readFile("GLOSSARY.md", "utf8");
          const headings = glossary.split("\\n").filter((line) => line.startsWith("**"));
          for (const heading of headings) expect(heading).toMatch(/^\\*\\*\`\\w+\`\\*\\*/);
        `,
    },
    // Not a doc: a workflow file, and a glob that names no document.
    {
      filename,
      code: `
          const ci = await readFile(".github/workflows/ci.yml", "utf8");
          expect(ci).toContain("fail-fast: false");
          expect(staticPrefixOf("*.md")).toBe(".");
        `,
    },
    // Extracting a value from the doc to compare against code is fine.
    {
      filename,
      code: `
          const runbook = readRepositoryFile("docs/operations/backups.md");
          const match = runbook.match(/BUCKETS="([^"]*)"/);
          expect(match).not.toBeNull();
          expect(parseBucketList(match?.[1] ?? "")).toEqual(declaredBuckets);
        `,
    },
  ],
  invalid: [
    {
      filename,
      code: `
          const glossary = await readFile("GLOSSARY.md", "utf8");
          expect(glossary).toContain("At most one active event can exist globally");
        `,
      errors,
    },
    // Removal pinned by a fixed sentence is the same assertion, negated.
    {
      filename,
      code: `
          const rules = await readFile("docs/domain/judging.md", "utf8");
          expect(rules.slice(0, rules.indexOf("## Results"))).not.toContain("up to two decimals");
        `,
      errors,
    },
    // A list of literals walked in a loop, as `domain-docs.test.ts` did.
    {
      filename,
      code: `
          const requirements = ["## Permission Matrix", "Server guards"];
          const extra = ["| admin"];
          const rules = await readFile("docs/domain/access.md", "utf8");
          for (const requirement of [...requirements, ...extra]) {
            expect(rules, requirement).toContain(requirement);
          }
        `,
      errors,
    },
    // The path behind a constant, and the docs behind a `Promise.all`.
    {
      filename,
      code: `
          const mapPath = path.resolve("docs/agents/codebase-map.md");
          const [packageJson, workflowDoc] = await Promise.all([
            readFile("package.json", "utf8"),
            readFile("docs/agents/workflows.md", "utf8"),
          ]);
          expect(readFileSync(mapPath, "utf8")).toMatch(/## Admin Users/);
          expect(workflowDoc).toContain("\`pnpm check:repo-styles\`");
          expect(packageJson).toContain("check:repo-styles");
        `,
      errors: 2,
    },
    // A loop over document paths reads a doc on every pass.
    {
      filename,
      code: `
          const adrs = ["docs/adr/superseded/0001-a.md", "docs/adr/superseded/0005-b.md"];
          for (const adr of adrs) {
            const text = await readFile(adr, "utf8");
            expect(text).toContain("**Status**: superseded by ADR-0013");
          }
        `,
      errors,
    },
    // The same assertion spelled as a boolean, or as a snapshot.
    {
      filename,
      code: `
          const doc = readFileSync("docs/local-auth.md", "utf8");
          expect(doc.includes("requires local Postgres")).toBe(true);
          expect(/requires local Postgres/.test(doc)).toBeTruthy();
          expect(doc).toMatchSnapshot();
        `,
      errors: 3,
    },
  ],
});
