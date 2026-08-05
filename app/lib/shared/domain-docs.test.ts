import { readdir, readFile, stat } from "node:fs/promises";

import { describe, expect, test } from "vitest";

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
  "No hay limpieza automática",
  "mantenimiento debe listar `Usuario` academia confirmados sin `Academia`",
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
  "## Admin Events And Bases Del Evento",
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
  "## Admin Events And Bases Del Evento",
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
  "docs/adr/0001-better-auth-for-access.md",
  "docs/adr/0005-use-supabase-postgres-before-supabase-auth.md",
  "docs/adr/0006-use-supabase-auth-for-access.md",
  "docs/adr/0008-use-supabase-storage-for-uploaded-assets.md",
  "docs/adr/0010-choreography-music-storage-contract.md",
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
  "50 MB",
  "300",
];

const accessPermissionRequirements = [
  "## Permission Matrix",
  "| academia",
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
  test("keeps the ADR index and the ADR files in sync", async () => {
    const index = await readFile("docs/adr/README.md", "utf8");
    const linkedFiles = [...index.matchAll(/\]\(\.\/(\d{4}-[^)]+\.md)\)/g)].map(
      ([, file]) => file,
    );
    const adrFiles = (await readdir("docs/adr")).filter((file) =>
      /^\d{4}-.+\.md$/.test(file),
    );

    expect(adrFiles.length).toBeGreaterThan(0);
    expect([...linkedFiles].sort()).toEqual([...adrFiles].sort());
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
