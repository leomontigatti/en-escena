import { readFile } from "node:fs/promises";

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
  "Si el par de documento está vacío, el estado de verificación de bailarín es incompleto",
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
});
