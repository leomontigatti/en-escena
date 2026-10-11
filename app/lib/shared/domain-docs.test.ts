import { readdir, readFile, stat } from "node:fs/promises";

import { describe, expect, test } from "vitest";

import { assetKindPolicies } from "@/lib/storage/asset-kinds";

import {
  DOC_MAP_PATH,
  isExcludedFromDocGate,
  matchesCodePattern,
  parseDocMap,
  staticPrefixOf,
} from "../../../scripts/doc-map.mjs";

describe("domain documentation", () => {
  test("gives every glossary term its canonical code identifier", async () => {
    const glossary = await readFile("GLOSSARY.md", "utf8");
    const entryHeadings = glossary
      .split("\n")
      .filter((line) => line.startsWith("**"));

    expect(entryHeadings.length).toBeGreaterThan(80);

    for (const heading of entryHeadings) {
      if (heading.includes("_(retired term)_")) {
        expect(heading, heading).toMatch(
          /^\*\*.+\*\* _\(retired term\)_ — no code identifier$/,
        );
        continue;
      }

      expect(heading, heading).toMatch(
        /^\*\*`[A-Za-z][A-Za-z0-9]*`\*\* — ui: ".+"$/,
      );
    }
  });

  test("keeps every glossary code identifier unique", async () => {
    const glossary = await readFile("GLOSSARY.md", "utf8");
    const identifiers = [
      ...glossary.matchAll(/^\*\*`([^`]+)`\*\* — ui: /gm),
    ].map(([, identifier]) => identifier);

    expect(identifiers.length).toBeGreaterThan(80);
    expect(new Set(identifiers).size).toBe(identifiers.length);
  });

  // Where an ADR lives says whether it still holds, so the file has to say the
  // same: an ADR moved into `superseded/` without its status still reads as a
  // live decision to whoever opens it from a link.
  test("marks every ADR under superseded/ as superseded", async () => {
    const supersededAdrs = (await readdir("docs/adr/superseded")).filter(
      (name) => /^\d{4}-.+\.md$/.test(name),
    );

    expect(supersededAdrs.length).toBeGreaterThan(0);

    for (const name of supersededAdrs) {
      const adr = await readFile(`docs/adr/superseded/${name}`, "utf8");

      expect(adr, name).toMatch(/^\*\*Status\*\*: superseded by ADR-\d{4}$/m);
    }
  });

  // Rehoming the contract out of ADR-0010 only helps if the new home cannot go
  // stale the way ADR-0010 did. Literal pins cannot catch that: they keep
  // saying "50 MB" long after the constant says otherwise. So read the enforced
  // values out of the module itself and require the page to state those, which
  // makes changing a constant without touching the page a failing test (#629).
  test("keeps the rehomed music contract pinned to the code that enforces it", async () => {
    const page = await readFile("docs/operations/infrastructure.md", "utf8");

    // Read straight from the policy registry rather than regexing its source
    // (#571): the values are now plain data with no server imports, so the
    // pin no longer depends on how the module happens to be formatted.
    const policy = assetKindPolicies.choreographyMusic;
    const maxFileSizeMegabytes = policy.maxFileSizeBytes / (1024 * 1024);
    const extensions = [
      ...new Set(
        Object.values(policy.extensionByContentType).map((extension) =>
          extension.toUpperCase(),
        ),
      ),
    ];

    expect(extensions.length).toBeGreaterThan(3);

    expect(page).toContain(`\`${policy.bucket}\``);
    expect(page).toContain(`**${policy.signedUrlExpiresInSeconds}** seconds`);
    expect(page).toContain(`**${maxFileSizeMegabytes} MB**`);

    for (const extension of extensions) {
      expect(page, extension).toContain(extension);
    }
  });

  // Two-way sync rather than a hardcoded count: a new ADR that never reaches
  // the index now fails, and the index can no longer link a file that does not
  // exist. The previous `/000\d-/` regex silently skipped ADR-0010 and up, so
  // the old count of 9 was passing against a partial set. See #625.
  //
  // Recursive on both sides (README link path and `readdir`) so that moving a
  // file into `docs/adr/superseded/` cannot make it vanish from both lists at
  // once and leave the `toEqual` green over a partial set — the trap #625
  // called out for whoever split this directory.
  test("keeps the ADR index and the ADR files in sync", async () => {
    const index = await readFile("docs/adr/README.md", "utf8");
    const linkedFiles = [
      ...index.matchAll(/\]\(\.\/((?:superseded\/)?\d{4}-[^)]+\.md)\)/g),
    ].map(([, file]) => file);
    const adrFiles = (
      await readdir("docs/adr", { recursive: true, withFileTypes: true })
    )
      .filter((entry) => entry.isFile() && /^\d{4}-.+\.md$/.test(entry.name))
      .map((entry) =>
        entry.parentPath.endsWith("superseded")
          ? `superseded/${entry.name}`
          : entry.name,
      );

    expect(adrFiles.length).toBeGreaterThan(0);
    expect([...linkedFiles].sort()).toEqual([...adrFiles].sort());
  });

  // Nobody maintains the doc gate's map by hand — this does. A map that rots
  // fires on the wrong PRs, gets escaped reflexively and becomes decorative, so
  // a dead glob or a renamed target document has to fail the build the day it
  // happens rather than the day someone notices. See #630.
  describe("doc gate map", () => {
    const readDocMap = async () =>
      parseDocMap(await readFile(DOC_MAP_PATH, "utf8"));

    test("points every entry at a document that exists", async () => {
      const docMap = await readDocMap();

      expect(docMap.length).toBeGreaterThan(0);

      for (const { doc } of docMap) {
        await expect(stat(doc), doc).resolves.toBeTruthy();
      }
    });

    // Gated files only: a pattern that matches nothing but tests is dead as far
    // as the gate is concerned, since the gate ignores test files.
    test("keeps every mapped code pattern matching at least one gated file", async () => {
      const docMap = await readDocMap();
      const patterns = docMap.flatMap(({ code }) => code);

      expect(patterns.length).toBeGreaterThan(0);

      for (const pattern of patterns) {
        const root = staticPrefixOf(pattern);
        const candidates = (
          await readdir(root, { recursive: true, withFileTypes: true })
        )
          .filter((entry) => entry.isFile())
          .map((entry) => `${entry.parentPath}/${entry.name}`)
          .filter((candidate) => !isExcludedFromDocGate(candidate));

        expect(
          candidates.filter((candidate) =>
            matchesCodePattern(candidate, pattern),
          ),
          pattern,
        ).not.toHaveLength(0);
      }
    });

    // The map is restated in prose for the agents who have to obey it, and an
    // agent that is told a stale mapping produces exactly the red PR it cannot
    // diagnose. The copy is cheap to keep honest; only the JSON is authoritative.
    test("keeps every prose copy of the map naming the same docs and patterns", async () => {
      const docMap = await readDocMap();
      const mapped = docMap.flatMap(({ doc, code }) => [doc, ...code]);
      const restatements = ["docs/agents/coding-standards.md"];

      for (const path of restatements) {
        const contents = await readFile(path, "utf8");

        for (const entry of mapped) {
          expect(contents, `${path} does not name ${entry}`).toContain(entry);
        }
      }
    });
  });

  test("keeps codebase map file references pointed at existing files", async () => {
    const map = await readFile("docs/agents/codebase-map.md", "utf8");
    const referencedPaths = [
      ...new Set(
        [...map.matchAll(/`((?:app|docs)\/[^`]+|GLOSSARY\.md)`/g)]
          .map(([, path]) => path)
          .filter((path) => !path.includes(" -- ")),
      ),
    ];

    expect(referencedPaths.length).toBeGreaterThan(50);

    for (const path of referencedPaths) {
      await expect(stat(path), path).resolves.toBeTruthy();
    }
  });

  // Links only, not backticked paths or `pnpm` commands: ADRs and finished
  // plans legitimately name files and scripts that no longer exist, so checking
  // those repo-wide is mostly noise. A relative link has no such reading — it
  // either resolves or it rotted, usually because the document moved (every hit
  // when this was added was an ADR rehomed into `superseded/`).
  test("keeps every relative markdown link pointed at an existing file", async () => {
    const roots = ["docs", ".github", ".agents", ".claude"];
    const documents = [
      "AGENTS.md",
      "GLOSSARY.md",
      ...(
        await Promise.all(
          roots.map((root) =>
            readdir(root, { recursive: true, withFileTypes: true }),
          ),
        )
      )
        .flat()
        .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
        .map((entry) => `${entry.parentPath}/${entry.name}`),
    ];

    expect(documents.length).toBeGreaterThan(50);

    for (const document of documents) {
      const contents = await readFile(document, "utf8");
      const directory = document.includes("/")
        ? document.slice(0, document.lastIndexOf("/"))
        : ".";

      for (const [, target] of contents.matchAll(
        /\]\(([^)#\s]+)(?:#[^)]*)?\)/g,
      )) {
        if (/^[a-z][a-z0-9+.-]*:/i.test(target)) continue;

        const resolved = target.startsWith("/")
          ? target.slice(1)
          : `${directory}/${target}`;

        await expect(
          stat(decodeURI(resolved)),
          `${document} links to ${target}`,
        ).resolves.toBeTruthy();
      }
    }
  });
});
