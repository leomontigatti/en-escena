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

const glossaryRequirements = [
  "At most one active event can exist globally",
  '**`activeEvent`** — ui: "Evento activo"',
  "It is the only event context for the first version",
  '**`eventBases`** — ui: "Bases del evento"',
];

const adrRequirements = [
  "Use the active event as the only V1 event context",
  "Evento activo",
  "URLs do not carry an `evento` query parameter",
  "Selectable event contexts can be reintroduced in V2",
];

const domainRuleRequirements = [
  "`Profesor` document type and document number are treated as a pair",
  "`Bailarín` document type and document number are treated as a pair",
  "both may be left empty",
  "If one is filled in and the other is empty, the record is invalid and is not saved",
  "When the document pair is complete, its uniqueness is enforced within the same academy",
  "If any document field or image is missing, the dancer verification status is incompleto",
  "A partial document pair is not a saved state",
  "it is a form validation error",
];

const fastDbIsolationAdrRequirements = [
  "# Decide fast DB test isolation around PGlite snapshots",
  "**Status**: amended",
  "PGlite with schema snapshots",
  "real Postgres per worker",
  "default full DB suite uses the real Postgres validation path",
  "**Fallback path**",
  "Evento",
  "Academia",
  "Coreografia",
  "Usuario",
  "Sesion de acceso",
  "Bases del evento",
  "pnpm test:db:postgres",
];

// Provider-neutral on purpose: these assert the domain state and its
// maintenance rule, not which vendor owns the credential. Pinning the provider
// name here is what kept the docs claiming Supabase Auth long after #266 moved
// the code to Better Auth. See #625.
const accessDomainRequirements = [
  "Identidad confirmada pendiente de academia",
  "academy onboarding",
  "There is no automatic cleanup",
  "maintenance must list confirmed academy `Usuario` records with no `Academia`",
];

const codebaseMapRequirements = [
  "# Codebase Map",
  "## Public Academy Registration",
  "## Access And Internal Users",
  "## Portal Roster",
  "## Portal Coreografias",
  "## Admin Shell And Dashboard",
  "## Admin Users",
  "## Admin Choreographies",
  "## Admin Roster",
  "## Admin Events And `Bases del evento`",
  "## Judging And Results",
  "`app/routes/portal.coreografias.tsx`",
  "`app/lib/portal/choreographies.server.ts`",
  "`app/features/portal/choreographies/detail/server.db.test.ts`",
  "`app/routes/administracion.usuarios.tsx`",
  "`app/lib/admin/users/users-route.server.db.test.ts`",
  "`app/lib/storage/dancer-documents.server.ts`",
  "`app/lib/storage/dancer-documents.server.test.ts`",
];

const adminMigrationMapRequirements = [
  "## Admin Events And `Bases del evento`",
  "`app/routes/administracion.profesores_.$professorId.tsx`",
  "`app/routes/administracion.bailarines_.$dancerId.tsx`",
  "`app/routes/administracion.coreografias.tsx`",
  "`app/routes/administracion.usuarios_.invitaciones.tsx`",
  "`app/routes/administracion.eventos_.$eventId.tsx`",
  "`app/routes/administracion.modalidades_.$modalityId.tsx`",
  "`app/routes/administracion.categorias_.$categoryId.tsx`",
  "`app/routes/administracion.cronogramas_.$scheduleId.tsx`",
  "`app/routes/administracion.precios_.$priceId.tsx`",
  "`app/features/admin/choreographies/list/`",
  "`app/lib/admin/events/event-bases.test-helpers.tsx`",
  "`app/lib/admin/users/internal-user-credentials.server.ts`",
  "`app/lib/admin/users/internal-user-credentials.shared.ts`",
  "`app/features/admin/schedules/detail/view.tsx`",
  "`app/features/admin/prices/detail/view.tsx`",
  "`app/features/admin/modalities/`",
  "`app/features/admin/categories/`",
  "`app/features/admin/schedules/`",
  "`app/features/admin/prices/`",
  "app/components/admin` remains the stable home for shell/layout primitives",
  "Shared modules kept in `app/lib` because they stay neutral",
  "Shared domain modules that remain cross-surface",
];

const adrIndexRequirements = [
  "# Architecture Decisions",
  "Access and authentication",
  "Event context",
  "Code organization",
  "Database test strategy",
  "Uploaded assets",
];

const codeLanguageRequirements = [
  "## Code Language",
  "Spanish for anything a user reads. English for everything else.",
  "UI strings, page titles, URLs",
  "Code identifiers, comments, docs, ADRs",
  "External-system adapters",
  "`loadAcademyFinances`",
  "`ArcaVoucher`",
  "administracion.finanzas_.$academyId.tsx",
  "### Reserved Spanish Domain Terms",
  "RG 1415",
  "Growing this list requires an ADR",
  "### Surface Prefix Rule",
  "Unmarked = admin",
  "`PortalChoreographyDetailRouteView`",
];

// The exit ADR carries rationale only. These pin the motive — the part that is
// recorded nowhere else and that an amendment chain would have lost — and not
// what runs today, which lives in `docs/operations/infrastructure.md`. See #629.
const supabaseExitAdrRequirements = [
  "**Status**: accepted",
  "**Supersedes**: ADR-0001, ADR-0005, ADR-0006, ADR-0008, ADR-0010",
  "why Supabase was adopted was never recorded",
  "swappable interfaces",
  "`auth.users`",
  "physical co-location in `sa-east`",
  "100% of users are in Argentina",
  "docs/operations/infrastructure.md",
];

// The five ADRs the exit supersedes. ADR-0005 and ADR-0010 had no `Status`
// field at all before #629.
const supersededSupabaseAdrs = [
  "docs/adr/superseded/0001-better-auth-for-access.md",
  "docs/adr/superseded/0005-use-supabase-postgres-before-supabase-auth.md",
  "docs/adr/superseded/0006-use-supabase-auth-for-access.md",
  "docs/adr/superseded/0008-use-supabase-storage-for-uploaded-assets.md",
  "docs/adr/superseded/0010-choreography-music-storage-contract.md",
];

// Current state, not rationale: the page ADR-0013 points at, plus the live
// choreography-music contract rehomed out of ADR-0010 (#629).
const infrastructureRequirements = [
  "x1383fsxfsixpgmvd9quv7tj",
  "sistema.enescena.com.ar",
  "postgres:17-alpine",
  "`enescena`",
  "`is_public: false`",
  "STORAGE_VOLUME_DIR",
  "en-escena-choreography-music",
  "**50 MB**",
  "**300** seconds",
];

const accessPermissionRequirements = [
  "## Permission Matrix",
  "| academy",
  "| admin",
  "| auditor",
  "| juzgamiento",
  "Server guards",
];

describe("domain documentation", () => {
  test("keeps active event context in the domain glossary", async () => {
    const glossary = await readFile("CONTEXT.md", "utf8");

    for (const requirement of glossaryRequirements) {
      expect(glossary).toContain(requirement);
    }
  });

  test("gives every glossary term its canonical code identifier", async () => {
    const glossary = await readFile("CONTEXT.md", "utf8");
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
    const glossary = await readFile("CONTEXT.md", "utf8");
    const identifiers = [
      ...glossary.matchAll(/^\*\*`([^`]+)`\*\* — ui: /gm),
    ].map(([, identifier]) => identifier);

    expect(identifiers.length).toBeGreaterThan(80);
    expect(new Set(identifiers).size).toBe(identifiers.length);
  });

  test("documents the code language convention as a coding standard", async () => {
    const standards = await readFile(".sandcastle/CODING_STANDARDS.md", "utf8");

    for (const requirement of codeLanguageRequirements) {
      expect(standards).toContain(requirement);
    }
  });

  test("records the active event context decision", async () => {
    const adr = await readFile(
      "docs/adr/0002-selectable-event-contexts.md",
      "utf8",
    );

    for (const requirement of adrRequirements) {
      expect(adr).toContain(requirement);
    }
  });

  test("keeps detailed domain rules outside the glossary", async () => {
    const rules = await readFile("docs/domain/choreographies.md", "utf8");

    for (const requirement of domainRuleRequirements) {
      expect(rules).toContain(requirement);
    }
  });

  test("records the accepted fast DB isolation decision and fallback", async () => {
    const adr = await readFile(
      "docs/adr/0007-db-test-isolation-model.md",
      "utf8",
    );

    for (const requirement of fastDbIsolationAdrRequirements) {
      expect(adr).toContain(requirement);
    }
  });

  test("documents the pending academy onboarding access state", async () => {
    const rules = await readFile("docs/domain/access.md", "utf8");

    for (const requirement of accessDomainRequirements) {
      expect(rules).toContain(requirement);
    }
  });

  test("keeps a compact implementation map for agent navigation", async () => {
    const map = await readFile("docs/agents/codebase-map.md", "utf8");

    for (const requirement of [
      ...codebaseMapRequirements,
      ...adminMigrationMapRequirements,
    ]) {
      expect(map).toContain(requirement);
    }
  });

  test("records the Supabase exit rationale in a single ADR", async () => {
    const adr = await readFile("docs/adr/0013-exit-supabase.md", "utf8");

    for (const requirement of supabaseExitAdrRequirements) {
      expect(adr).toContain(requirement);
    }
  });

  test("marks every Supabase-era ADR superseded by ADR-0013", async () => {
    for (const path of supersededSupabaseAdrs) {
      const adr = await readFile(path, "utf8");

      expect(adr, path).toContain("**Status**: superseded by ADR-0013");
    }
  });

  test("describes production infrastructure as current state", async () => {
    const page = await readFile("docs/operations/infrastructure.md", "utf8");

    for (const requirement of infrastructureRequirements) {
      expect(page).toContain(requirement);
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

  test("keeps an ADR topic index", async () => {
    const index = await readFile("docs/adr/README.md", "utf8");

    for (const requirement of adrIndexRequirements) {
      expect(index).toContain(requirement);
    }
  });

  test("documents access permissions as domain authority", async () => {
    const rules = await readFile("docs/domain/access.md", "utf8");

    for (const requirement of accessPermissionRequirements) {
      expect(rules).toContain(requirement);
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

    // The map is restated in prose for the humans and AFK runners who have to
    // obey it, and a runner that is told a stale mapping produces exactly the
    // red PR it cannot diagnose. The copies are cheap to keep honest; only the
    // JSON is authoritative.
    test("keeps every prose copy of the map naming the same docs and patterns", async () => {
      const docMap = await readDocMap();
      const mapped = docMap.flatMap(({ doc, code }) => [doc, ...code]);
      const restatements = [
        ".sandcastle/CODING_STANDARDS.md",
        ".sandcastle/agent-implement/prompt.md",
        ".sandcastle/agent-implement-prd/prompt.md",
        "docs/agents/prompts/implement.prompt.md",
      ];

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
        [...map.matchAll(/`((?:app|docs)\/[^`]+|CONTEXT\.md)`/g)]
          .map(([, path]) => path)
          .filter((path) => !path.includes(" -- ")),
      ),
    ];

    expect(referencedPaths.length).toBeGreaterThan(50);

    for (const path of referencedPaths) {
      await expect(stat(path), path).resolves.toBeTruthy();
    }
  });
});
