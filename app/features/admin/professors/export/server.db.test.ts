import { describe, expect, test } from "vitest";

import {
  periodExportRequest,
  seedPeriodExportFixture,
} from "@/features/admin/period-export/period-export.test-support";
import { readWorkbook } from "@/features/admin/period-export/workbook.test-support";
import { expectThrownResponse } from "@/lib/admin/test-support/db";

import { loadProfessorsExport } from "./server";
import { professorsExportPath } from "./shared";

import { installDatabaseTestHooks } from "../../../../../tests/db/harness";

installDatabaseTestHooks();

async function exportRows(
  period: { from: string | null; to: string | null } = { from: null, to: null },
) {
  const response = await loadProfessorsExport(
    await periodExportRequest(professorsExportPath, period),
  );
  const [rows] = [...(await readWorkbook(response)).values()];

  return { response, rows };
}

/** One professor teaching one choreography with one inscription registered at `registeredAt`. */
async function seedTaughtInscription(
  fixture: Awaited<ReturnType<typeof seedPeriodExportFixture>>,
  input: {
    academyName?: string;
    professor?: Parameters<typeof fixture.addProfessor>[1];
    registeredAt: string;
  },
) {
  const academy = await fixture.addAcademy({
    name: input.academyName ?? "Estudio Ritmo",
  });
  const professor = await fixture.addProfessor(academy.id, input.professor);
  const dancer = await fixture.addDancer(academy.id);
  const choreography = await fixture.addChoreography({
    academyId: academy.id,
    professorIds: [professor.id],
  });

  await fixture.inscribe({
    choreographyId: choreography.id,
    dancerId: dancer.id,
    registeredAt: input.registeredAt,
  });

  return { academy, professor };
}

describe("the professors export", () => {
  test("lists the professors whose choreographies have an inscription in the period", async () => {
    const fixture = await seedPeriodExportFixture();
    await seedTaughtInscription(fixture, {
      professor: {
        documentNumber: "30111222",
        documentType: "dni",
        firstName: "Luz",
        lastName: "Suárez",
      },
      registeredAt: "2026-04-10T15:00:00Z",
    });
    await seedTaughtInscription(fixture, {
      academyName: "Academia Tarde",
      professor: { firstName: "Mario", lastName: "Tardío" },
      registeredAt: "2026-04-20T15:00:00Z",
    });

    const { response, rows } = await exportRows({
      from: "2026-04-01",
      to: "2026-04-15",
    });

    expect(response.headers.get("Content-Disposition")).toBe(
      'attachment; filename="profesores-en-escena-2026-2026-04-01-a-2026-04-15.xlsx"',
    );
    expect(rows).toEqual([
      [
        "Nombre completo",
        "Tipo de documento",
        "Número de documento",
        "Academia",
      ],
      ["Luz Suárez", "DNI", "30111222", "Estudio Ritmo"],
    ]);
  });

  test("reads both ends inclusive and in Argentina time", async () => {
    const fixture = await seedPeriodExportFixture();
    // 23:30 on April 15th in Argentina is already the 16th in UTC.
    await seedTaughtInscription(fixture, {
      professor: { firstName: "Ultima", lastName: "Hora" },
      registeredAt: "2026-04-16T02:30:00Z",
    });
    // 00:30 on April 16th in Argentina.
    await seedTaughtInscription(fixture, {
      academyName: "Academia Siguiente",
      professor: { firstName: "Dia", lastName: "Siguiente" },
      registeredAt: "2026-04-16T03:30:00Z",
    });

    const lastDay = await exportRows({ from: "2026-04-15", to: "2026-04-15" });
    const nextDay = await exportRows({ from: "2026-04-16", to: null });

    expect(lastDay.rows.slice(1).map((row) => row[0])).toEqual(["Ultima Hora"]);
    expect(nextDay.rows.slice(1).map((row) => row[0])).toEqual([
      "Dia Siguiente",
    ]);
  });

  test("lists the whole event when both dates are empty", async () => {
    const fixture = await seedPeriodExportFixture();
    await seedTaughtInscription(fixture, {
      professor: { firstName: "Ana", lastName: "Antes" },
      registeredAt: "2025-12-01T15:00:00Z",
    });

    const { response, rows } = await exportRows();

    expect(response.headers.get("Content-Disposition")).toContain(
      "-completo.xlsx",
    );
    expect(rows.slice(1).map((row) => row[0])).toEqual(["Ana Antes"]);
  });

  test("leaves the document cells blank for a professor who has none", async () => {
    const fixture = await seedPeriodExportFixture();
    await seedTaughtInscription(fixture, {
      professor: { firstName: "Sin", lastName: "Documento" },
      registeredAt: "2026-04-10T15:00:00Z",
    });

    const { rows } = await exportRows();

    expect(rows[1]).toEqual(["Sin Documento", null, null, "Estudio Ritmo"]);
  });

  test("lists a professor once per choreography's academy roster, not once per inscription", async () => {
    const fixture = await seedPeriodExportFixture();
    const { academy, professor } = await seedTaughtInscription(fixture, {
      professor: { firstName: "Luz", lastName: "Suárez" },
      registeredAt: "2026-04-10T15:00:00Z",
    });
    const otherDancer = await fixture.addDancer(academy.id, {
      firstName: "Bruno",
    });
    const second = await fixture.addChoreography({
      academyId: academy.id,
      professorIds: [professor.id],
    });
    await fixture.inscribe({
      choreographyId: second.id,
      dancerId: otherDancer.id,
      registeredAt: "2026-04-11T15:00:00Z",
    });

    const { rows } = await exportRows();

    expect(rows.slice(1)).toEqual([
      ["Luz Suárez", null, null, "Estudio Ritmo"],
    ]);
  });

  test("leaves out a professor whose only inscription was withdrawn", async () => {
    const fixture = await seedPeriodExportFixture();
    const academy = await fixture.addAcademy({ name: "Estudio Ritmo" });
    const professor = await fixture.addProfessor(academy.id);
    const dancer = await fixture.addDancer(academy.id);
    const choreography = await fixture.addChoreography({
      academyId: academy.id,
      professorIds: [professor.id],
    });
    await fixture.inscribe({
      choreographyId: choreography.id,
      dancerId: dancer.id,
      registeredAt: "2026-04-10T15:00:00Z",
      withdrawn: true,
    });

    const { rows } = await exportRows();

    expect(rows).toHaveLength(1);
  });

  test("lists a professor whose only registration in the period is a seminar inscription", async () => {
    const fixture = await seedPeriodExportFixture();
    const academy = await fixture.addAcademy({ name: "Estudio Ritmo" });
    const professor = await fixture.addProfessor(academy.id, {
      firstName: "Solo",
      lastName: "Seminario",
    });
    const withdrawn = await fixture.addProfessor(academy.id, {
      firstName: "Retirado",
      lastName: "Seminario",
    });
    await fixture.addSeminarInscription({
      professorId: professor.id,
      registeredAt: "2026-04-10T15:00:00Z",
    });
    await fixture.addSeminarInscription({
      professorId: withdrawn.id,
      registeredAt: "2026-04-10T15:00:00Z",
      withdrawn: true,
    });

    const { rows } = await exportRows({ from: "2026-04-01", to: "2026-04-30" });

    expect(rows.slice(1).map((row) => row[0])).toEqual(["Solo Seminario"]);
  });

  test("downloads the headers and no rows for a period with nothing in it", async () => {
    await seedPeriodExportFixture();

    const { response, rows } = await exportRows({
      from: "2026-01-01",
      to: "2026-01-31",
    });

    expect(response.status).toBe(200);
    expect(rows).toEqual([
      [
        "Nombre completo",
        "Tipo de documento",
        "Número de documento",
        "Academia",
      ],
    ]);
  });

  test.each(["admin", "academy", "judge"] as const)(
    "refuses the %s",
    async (role) => {
      await seedPeriodExportFixture();

      await expectThrownResponse(
        loadProfessorsExport(
          await periodExportRequest(
            professorsExportPath,
            { from: null, to: null },
            role,
          ),
        ),
        403,
      );
    },
  );
});
