import { describe, expect, test } from "vitest";

import { requiredFieldMessage } from "@/lib/shared/forms";

import {
  buildProgramExportFileName,
  buildProgramExportHref,
  programExportAllDays,
  programExportSchema,
} from "./shared";

describe("the program export", () => {
  test("names the file after the event and what it holds", () => {
    expect(
      buildProgramExportFileName("Gala Primavera 2026", programExportAllDays),
    ).toBe("programa-gala-primavera-2026-todos.xlsx");
    expect(buildProgramExportFileName("Gala Primavera", "2026-10-17")).toBe(
      "programa-gala-primavera-2026-10-17.xlsx",
    );
  });

  test("carries the chosen day in the download's address", () => {
    expect(buildProgramExportHref(programExportAllDays)).toBe(
      "/administracion/presentaciones/exportar?dia=todos",
    );
  });

  test("asks for a choice like every other required field", () => {
    const parsed = programExportSchema.safeParse({ dia: "" });

    expect(parsed.error?.issues[0]?.message).toBe(requiredFieldMessage);
  });
});
