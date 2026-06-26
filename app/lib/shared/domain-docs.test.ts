import { readdir, readFile, stat } from "node:fs/promises";

import { describe, expect, test } from "vitest";

const glossaryRequirements = [
  "Como máximo puede haber un Evento activo global",
  "**Evento activo**:",
  "Es el único contexto de evento para la primera versión",
  "**Bases del evento**:",
];

const adrRequirements = [
  "Use the active event as the only V1 event context",
  "Evento activo",
  "URLs do not carry an `evento` query parameter",
  "Selectable event contexts can be reintroduced in V2",
];

const domainRuleRequirements = [
  "Tipo de documento y número de documento de `Profesor` se tratan como un par",
  "Tipo de documento y número de documento de `Bailarín` se tratan como un par",
  "ambos pueden quedar vacíos",
  "Si uno está completo y el otro vacío, la ficha es inválida y no se guarda",
  "Cuando el par de documento está completo, su unicidad se controla dentro de la misma academia",
  "Si falta algún dato o imagen del documento, el estado de verificación de bailarín es incompleto",
  "Un par de documento parcial no es un estado guardado",
  "es un error de validación del formulario",
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
  "npm run test:db:postgres",
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
  "## Event Context And Bases Del Evento",
  "## Portal Roster",
  "## Portal Coreografias",
  "## Admin Roster",
  "## Judging And Results",
  "`app/routes/portal.coreografias.tsx`",
  "`app/lib/portal/choreographies.server.ts`",
  "`app/features/portal/choreographies/detail/server.db.test.ts`",
  "`app/routes/administracion.usuarios.tsx`",
  "`app/lib/admin/users/users-route.server.db.test.ts`",
  "`app/lib/storage/dancer-documents.server.ts`",
  "`app/lib/storage/dancer-documents.server.test.ts`",
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
    const rules = await readFile("docs/domain/coreografias.md", "utf8");

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
    const rules = await readFile("docs/domain/acceso.md", "utf8");

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

    for (const requirement of codebaseMapRequirements) {
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
    const rules = await readFile("docs/domain/acceso.md", "utf8");

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

    expect(linkedFiles).toHaveLength(8);

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
