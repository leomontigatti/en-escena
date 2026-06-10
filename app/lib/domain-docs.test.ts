import { readFile } from "node:fs/promises";

import { describe, expect, test } from "vitest";

const glossaryRequirements = [
  "Como máximo puede haber un Evento activo global",
  "**Evento activo**:",
  "**Evento de trabajo**:",
  "**Evento consultado**:",
  "las listas operativas usan por defecto el Evento activo",
  "Las secciones específicas de evento usan un Evento consultado",
  "las mutaciones quedan limitadas por el Evento activo y las reglas de inscripción",
];

const adrRequirements = [
  "single active-event-only model and selectable event contexts",
  "Evento activo",
  "Evento de trabajo",
  "Evento consultado",
];

describe("domain documentation", () => {
  test("keeps selectable event contexts in the domain glossary", async () => {
    const glossary = await readFile("CONTEXT.md", "utf8");

    for (const requirement of glossaryRequirements) {
      expect(glossary).toContain(requirement);
    }
  });

  test("records the selectable event context decision", async () => {
    const adr = await readFile(
      "docs/adr/0002-selectable-event-contexts.md",
      "utf8",
    );

    for (const requirement of adrRequirements) {
      expect(adr).toContain(requirement);
    }
  });
});
