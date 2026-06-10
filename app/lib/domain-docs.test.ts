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

const glossaryEntryRequirements = [
  {
    term: "Profesor",
    requirements: [
      "Tipo de documento y número de documento se tratan como un par",
      "ambos pueden quedar vacíos",
      "Si uno está completo y el otro vacío, la ficha es inválida y no se guarda",
    ],
  },
  {
    term: "Bailarín",
    requirements: [
      "Tipo de documento y número de documento se tratan como un par",
      "ambos pueden quedar vacíos",
      "Si uno está completo y el otro vacío, la ficha es inválida y no se guarda",
      "Cuando el par de documento está completo, su unicidad se controla dentro de la misma academia",
    ],
  },
  {
    term: "Estado de verificación de bailarín",
    requirements: [
      "si el par de documento está vacío es incompleto",
      "Un par de documento parcial no es un estado guardado",
      "es un error de validación del formulario",
    ],
  },
  {
    term: "Portal de academias",
    requirements: [
      "secciones operativas para profesores, bailarines y coreografías",
      "carga rápida desde las listas",
    ],
  },
];

function getGlossaryEntry(glossary: string, term: string) {
  const startMarker = `**${term}**:`;
  const start = glossary.indexOf(startMarker);

  if (start === -1) {
    throw new Error(`Missing glossary term: ${term}`);
  }

  const nextEntry = glossary.indexOf("\n**", start + startMarker.length);

  return glossary.slice(start, nextEntry === -1 ? undefined : nextEntry);
}

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

  test("documents the academy people document pair rule", async () => {
    const glossary = await readFile("CONTEXT.md", "utf8");

    for (const { requirements, term } of glossaryEntryRequirements) {
      const entry = getGlossaryEntry(glossary, term);

      for (const requirement of requirements) {
        expect(entry).toContain(requirement);
      }
    }
  });
});
