import { readdir, readFile, stat } from "node:fs/promises";

import { describe, expect, test } from "vitest";

const glossaryRequirements = [
  "Como máximo puede haber un Evento activo global",
  "**Evento activo** — code: `activeEvent`",
  "Es el único contexto de evento para la primera versión",
  "**Bases del evento** — code: `eventBases`",
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

const accessDomainRequirements = [
  "Supabase Auth owns public registration email confirmation",
  "Identidad confirmada pendiente de academia",
  "academy onboarding",
  "No hay limpieza automática",
  "mantenimiento debe listar `Usuario` academia confirmados sin `Academia`",
];

const accessAdrRequirements = [
  "Supabase Auth owns email confirmation for the academy identity",
  "Identidad confirmada pendiente de academia",
  "redirect the confirmed user into academy onboarding",
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
  "[ADR-0006: Supabase Auth for access credentials]",
  "[ADR-0008: Supabase Storage for uploaded assets]",
];

const codeLanguageRequirements = [
  "## Code Language",
  "Spanish for anything a user reads. English for everything else.",
  "UI strings, page titles, URLs",
  "Code identifiers, comments, docs, ADRs",
  "External-system adapters",
  "`loadAdminAcademyFinances`",
  "`ArcaVoucher`",
  "administracion.finanzas_.$academyId.tsx",
  "### Reserved Spanish Domain Terms",
  "RG 1415",
  "Growing this list requires an ADR",
  "### Surface Prefix Rule",
  "Unmarked = admin",
  "`PortalChoreographyDetailRouteView`",
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
      if (heading.includes("_(término retirado)_")) {
        expect(heading, heading).toMatch(
          /^\*\*.+\*\* _\(término retirado\)_ — sin identificador de código$/,
        );
        continue;
      }

      expect(heading, heading).toMatch(
        /^\*\*.+\*\* — code: `[A-Za-z][A-Za-z0-9]*`$/,
      );
    }
  });

  test("keeps every glossary code identifier unique", async () => {
    const glossary = await readFile("CONTEXT.md", "utf8");
    const identifiers = [...glossary.matchAll(/ — code: `([^`]+)`/g)].map(
      ([, identifier]) => identifier,
    );

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

  test("records Supabase confirmation ownership for public registration", async () => {
    const adr = await readFile(
      "docs/adr/0006-use-supabase-auth-for-access.md",
      "utf8",
    );

    for (const requirement of accessAdrRequirements) {
      expect(adr).toContain(requirement);
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

  test("keeps ADR index links pointed at existing files", async () => {
    const index = await readFile("docs/adr/README.md", "utf8");
    const linkedFiles = [...index.matchAll(/\]\(\.\/(000\d-[^)]+\.md)\)/g)].map(
      ([, file]) => file,
    );
    const adrFiles = await readdir("docs/adr");

    expect(linkedFiles).toHaveLength(9);

    for (const file of linkedFiles) {
      expect(adrFiles).toContain(file);
    }
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
