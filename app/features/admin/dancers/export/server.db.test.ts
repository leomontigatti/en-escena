import { describe, expect, test } from "vitest";

import {
  periodExportRequest,
  seedPeriodExportFixture,
} from "@/features/admin/period-export/period-export.test-support";
import { readWorkbook } from "@/features/admin/period-export/workbook.test-support";
import { expectThrownResponse } from "@/lib/admin/test-support/db";

import { loadDancersExport } from "./server";
import { dancersExportPath } from "./shared";

import { installDatabaseTestHooks } from "../../../../../tests/db/harness";

installDatabaseTestHooks();

const header = [
  "Nombre completo",
  "Tipo de documento",
  "Número de documento",
  "Fecha de nacimiento",
  "Academia",
];

async function exportRows(
  period: { from: string | null; to: string | null } = { from: null, to: null },
) {
  const response = await loadDancersExport(
    await periodExportRequest(dancersExportPath, period),
  );
  const [rows] = [...(await readWorkbook(response)).values()];

  return { response, rows };
}

describe("the dancers export", () => {
  test("lists the dancers with an inscription registered in the period, one row per academy roster", async () => {
    const fixture = await seedPeriodExportFixture();
    const academy = await fixture.addAcademy({ name: "Estudio Ritmo" });
    const ana = await fixture.addDancer(academy.id, {
      birthDate: "2012-01-10",
      documentNumber: "45111222",
      documentType: "dni",
      firstName: "Ana",
      lastName: "Paz",
    });
    const first = await fixture.addChoreography({ academyId: academy.id });
    const second = await fixture.addChoreography({ academyId: academy.id });
    await fixture.inscribe({
      choreographyId: first.id,
      dancerId: ana.id,
      registeredAt: "2026-04-10T15:00:00Z",
    });
    await fixture.inscribe({
      choreographyId: second.id,
      dancerId: ana.id,
      registeredAt: "2026-04-11T15:00:00Z",
    });

    const { response, rows } = await exportRows({
      from: "2026-04-01",
      to: "2026-04-30",
    });

    expect(response.headers.get("Content-Disposition")).toBe(
      'attachment; filename="bailarines-en-escena-2026-2026-04-01-a-2026-04-30.xlsx"',
    );
    expect(rows).toEqual([
      header,
      // The birth date is a date cell: its spreadsheet serial.
      ["Ana Paz", "DNI", "45111222", 40918, "Estudio Ritmo"],
    ]);
  });

  test("leaves out a dancer whose only inscriptions fall outside the period", async () => {
    const fixture = await seedPeriodExportFixture();
    const academy = await fixture.addAcademy({ name: "Estudio Ritmo" });
    const inside = await fixture.addDancer(academy.id, { firstName: "Dentro" });
    const outside = await fixture.addDancer(academy.id, {
      firstName: "Fuera",
    });
    const choreography = await fixture.addChoreography({
      academyId: academy.id,
    });
    await fixture.inscribe({
      choreographyId: choreography.id,
      dancerId: inside.id,
      registeredAt: "2026-04-10T15:00:00Z",
    });
    await fixture.inscribe({
      choreographyId: choreography.id,
      dancerId: outside.id,
      registeredAt: "2026-03-10T15:00:00Z",
    });

    const { rows } = await exportRows({ from: "2026-04-01", to: null });

    expect(rows.slice(1).map((row) => row[0])).toEqual(["Dentro Paz"]);
  });

  test("lists a dancer whose only registration in the period is a seminar inscription, not a withdrawn one", async () => {
    const fixture = await seedPeriodExportFixture();
    const academy = await fixture.addAcademy({ name: "Estudio Ritmo" });
    const seminarOnly = await fixture.addDancer(academy.id, {
      firstName: "Seminario",
    });
    const withdrawn = await fixture.addDancer(academy.id, {
      firstName: "Retirada",
    });
    await fixture.addSeminarInscription({
      dancerId: seminarOnly.id,
      registeredAt: "2026-04-10T15:00:00Z",
    });
    await fixture.addSeminarInscription({
      dancerId: withdrawn.id,
      registeredAt: "2026-04-10T15:00:00Z",
      withdrawn: true,
    });
    await fixture.addSeminarInscription({
      dancerId: (await fixture.addDancer(academy.id, { firstName: "Marzo" }))
        .id,
      registeredAt: "2026-03-10T15:00:00Z",
    });

    const { rows } = await exportRows({ from: "2026-04-01", to: null });

    expect(rows.slice(1).map((row) => row[0])).toEqual(["Seminario Paz"]);
  });

  test("leaves the document cells blank for a dancer who has none", async () => {
    const fixture = await seedPeriodExportFixture();
    const academy = await fixture.addAcademy({ name: "Estudio Ritmo" });
    const dancer = await fixture.addDancer(academy.id);
    const choreography = await fixture.addChoreography({
      academyId: academy.id,
    });
    await fixture.inscribe({
      choreographyId: choreography.id,
      dancerId: dancer.id,
      registeredAt: "2026-04-10T15:00:00Z",
    });

    const { rows } = await exportRows();

    expect(rows[1]?.slice(0, 3)).toEqual(["Ana Paz", null, null]);
  });

  test("downloads the headers and no rows for a period with nothing in it", async () => {
    await seedPeriodExportFixture();

    const { response, rows } = await exportRows({
      from: "2026-01-01",
      to: "2026-01-31",
    });

    expect(response.status).toBe(200);
    expect(rows).toEqual([header]);
  });

  test("rejects a period whose end is before its start", async () => {
    await seedPeriodExportFixture();

    await expectThrownResponse(
      loadDancersExport(
        await periodExportRequest(dancersExportPath, {
          from: "2026-05-01",
          to: "2026-04-01",
        }),
      ),
      400,
    );
  });

  test.each(["admin", "academy", "judge"] as const)(
    "refuses the %s",
    async (role) => {
      await seedPeriodExportFixture();

      await expectThrownResponse(
        loadDancersExport(
          await periodExportRequest(
            dancersExportPath,
            { from: null, to: null },
            role,
          ),
        ),
        403,
      );
    },
  );
});
