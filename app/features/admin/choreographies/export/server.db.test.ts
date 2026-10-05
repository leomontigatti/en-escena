import { describe, expect, test } from "vitest";

import {
  periodExportRequest,
  seedPeriodExportFixture,
} from "@/features/admin/period-export/period-export.test-support";
import { readWorkbook } from "@/features/admin/period-export/workbook.test-support";
import { expectThrownResponse } from "@/lib/admin/test-support/db";

import { loadParticipationCountsExport } from "./server";
import { participationCountsExportPath } from "./shared";

import { installDatabaseTestHooks } from "../../../../../tests/db/harness";

installDatabaseTestHooks();

async function exportSheets(
  period: { from: string | null; to: string | null } = { from: null, to: null },
) {
  const response = await loadParticipationCountsExport(
    await periodExportRequest(participationCountsExportPath, period),
  );

  return { response, sheets: await readWorkbook(response) };
}

describe("the participation counts export", () => {
  test("counts academies, dancers and inscriptions by province and by modality", async () => {
    const fixture = await seedPeriodExportFixture();
    const jazz = fixture.catalog.modality;
    const tango = await fixture.addModality("Tango");
    const cordoba = await fixture.addAcademy({
      name: "Academia Córdoba",
      province: "cordoba",
    });
    const salta = await fixture.addAcademy({
      name: "Academia Salta",
      province: "salta",
    });
    const nowhere = await fixture.addAcademy({ name: "Academia Sin Lugar" });
    // Ana dances in two modalities: in both rows, once in the total.
    const ana = await fixture.addDancer(cordoba.id, { firstName: "Ana" });
    const bruno = await fixture.addDancer(cordoba.id, { firstName: "Bruno" });
    const carla = await fixture.addDancer(salta.id, { firstName: "Carla" });
    const dario = await fixture.addDancer(nowhere.id, { firstName: "Dario" });
    const cordobaJazz = await fixture.addChoreography({
      academyId: cordoba.id,
      modalityId: jazz.id,
    });
    const cordobaTango = await fixture.addChoreography({
      academyId: cordoba.id,
      modalityId: tango.id,
    });
    const saltaJazz = await fixture.addChoreography({
      academyId: salta.id,
      modalityId: jazz.id,
    });
    const nowhereTango = await fixture.addChoreography({
      academyId: nowhere.id,
      modalityId: tango.id,
    });
    const at = "2026-04-10T15:00:00Z";

    await fixture.inscribe({
      choreographyId: cordobaJazz.id,
      dancerId: ana.id,
      registeredAt: at,
    });
    await fixture.inscribe({
      choreographyId: cordobaJazz.id,
      dancerId: bruno.id,
      registeredAt: at,
    });
    await fixture.inscribe({
      choreographyId: cordobaTango.id,
      dancerId: ana.id,
      registeredAt: at,
    });
    await fixture.inscribe({
      choreographyId: saltaJazz.id,
      dancerId: carla.id,
      registeredAt: at,
    });
    await fixture.inscribe({
      choreographyId: nowhereTango.id,
      dancerId: dario.id,
      registeredAt: at,
    });
    // Neither a withdrawn inscription, nor a seminar one, nor one outside the period counts.
    await fixture.inscribe({
      choreographyId: saltaJazz.id,
      dancerId: (await fixture.addDancer(salta.id, { firstName: "Ema" })).id,
      registeredAt: at,
      withdrawn: true,
    });
    await fixture.addSeminarInscription({
      dancerId: carla.id,
      registeredAt: at,
    });
    await fixture.inscribe({
      choreographyId: nowhereTango.id,
      dancerId: (await fixture.addDancer(nowhere.id, { firstName: "Fede" })).id,
      registeredAt: "2026-05-10T15:00:00Z",
    });

    const { response, sheets } = await exportSheets({
      from: "2026-04-01",
      to: "2026-04-30",
    });

    expect(response.headers.get("Content-Disposition")).toBe(
      'attachment; filename="participacion-en-escena-2026-2026-04-01-a-2026-04-30.xlsx"',
    );
    expect([...sheets.keys()]).toEqual(["Por provincia", "Por modalidad"]);
    expect(sheets.get("Por provincia")).toEqual([
      ["Provincia", "Academias", "Bailarines", "Inscripciones"],
      ["Córdoba", 1, 2, 3],
      ["Salta", 1, 1, 1],
      ["Sin provincia", 1, 1, 1],
      ["Total", 3, 4, 5],
    ]);
    expect(sheets.get("Por modalidad")).toEqual([
      ["Modalidad", "Academias", "Bailarines", "Inscripciones"],
      [jazz.name, 2, 3, 3],
      ["Tango", 2, 2, 2],
      ["Total", 3, 4, 5],
    ]);
  });

  test("downloads both sheets with their headers and zero totals for a period with nothing in it", async () => {
    await seedPeriodExportFixture();

    const { response, sheets } = await exportSheets({
      from: "2026-01-01",
      to: "2026-01-31",
    });

    expect(response.status).toBe(200);
    expect(sheets.get("Por provincia")).toEqual([
      ["Provincia", "Academias", "Bailarines", "Inscripciones"],
      ["Total", 0, 0, 0],
    ]);
    expect(sheets.get("Por modalidad")).toEqual([
      ["Modalidad", "Academias", "Bailarines", "Inscripciones"],
      ["Total", 0, 0, 0],
    ]);
  });

  test.each(["admin", "academy", "judge"] as const)(
    "refuses the %s",
    async (role) => {
      await seedPeriodExportFixture();

      await expectThrownResponse(
        loadParticipationCountsExport(
          await periodExportRequest(
            participationCountsExportPath,
            { from: null, to: null },
            role,
          ),
        ),
        403,
      );
    },
  );
});
