import { readFile } from "node:fs/promises";

import { describe, expect, test } from "vitest";

describe("domain documentation", () => {
  test("defines active, work, and consulted event contexts", async () => {
    const [context, adr] = await Promise.all([
      readFile("CONTEXT.md", "utf8"),
      readFile("docs/adr/0002-selectable-event-contexts.md", "utf8"),
    ]);

    expect(context).toContain(
      "Como máximo puede haber un Evento activo global",
    );
    expect(context).toContain("**Evento activo**:");
    expect(context).toContain("**Evento de trabajo**:");
    expect(context).toContain("**Evento consultado**:");
    expect(context).toContain(
      "las listas operativas usan por defecto el Evento activo",
    );
    expect(context).toContain(
      "Las secciones específicas de evento usan un Evento consultado",
    );
    expect(context).toContain(
      "las mutaciones quedan limitadas por el Evento activo y las reglas de inscripción",
    );

    expect(adr).toContain(
      "single active-event-only model and selectable event contexts",
    );
    expect(adr).toContain("Evento activo");
    expect(adr).toContain("Evento de trabajo");
    expect(adr).toContain("Evento consultado");
  });
});
