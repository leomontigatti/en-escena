import { afterEach, describe, expect, test, vi } from "vitest";

import {
  periodExportRequest,
  seedPeriodExportFixture,
} from "@/features/admin/period-export/period-export.test-support";
import { readWorkbook } from "@/features/admin/period-export/workbook.test-support";
import { expectThrownResponse } from "@/lib/admin/test-support/db";
import * as businessTimeZone from "@/lib/shared/business-time-zone";

import { loadParticipationCountsExport } from "./server";
import { participationCountsExportPath } from "./shared";

import { installDatabaseTestHooks } from "../../../../../tests/db/harness";

installDatabaseTestHooks();

afterEach(() => {
  vi.restoreAllMocks();
});

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
    expect([...sheets.keys()]).toEqual([
      "Por coreografía",
      "Por provincia",
      "Por modalidad",
    ]);
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

  test("downloads every sheet with its headers and zero totals for a period with nothing in it", async () => {
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
    expect(sheets.get("Por coreografía")?.slice(1)).toEqual([
      ["Total", null, null, null, 0, 0, 0, 0, 0, 0, 0, 0],
    ]);
  });

  test("lists each choreography with the money of its inscriptions registered in the period", async () => {
    // The catalog's price (10000, deposit 30%) applies on this date.
    vi.spyOn(businessTimeZone, "getBusinessDateOnly").mockReturnValue(
      "2026-04-10",
    );
    const fixture = await seedPeriodExportFixture();
    const tango = await fixture.addModality("Tango");
    const ritmo = await fixture.addAcademy({ name: "Estudio Ritmo" });
    const sur = await fixture.addAcademy({ name: "Academia Sur" });
    const amanecer = await fixture.addChoreography({
      academyId: ritmo.id,
      name: "Amanecer",
    });
    const brisa = await fixture.addChoreography({
      academyId: sur.id,
      modalityId: tango.id,
      name: "Brisa",
    });
    const dancerOf = async (academyId: string, firstName: string) =>
      (await fixture.addDancer(academyId, { firstName })).id;
    const at = "2026-04-10T15:00:00Z";
    const ana = await fixture.inscribe({
      choreographyId: amanecer.id,
      dancerId: await dancerOf(ritmo.id, "Ana"),
      registeredAt: at,
    });
    const bruno = await fixture.inscribe({
      choreographyId: amanecer.id,
      dancerId: await dancerOf(ritmo.id, "Bruno"),
      registeredAt: at,
    });
    // Withdrawn with money: no longer an inscription, and its 2000 stay.
    const ema = await fixture.inscribe({
      choreographyId: amanecer.id,
      dancerId: await dancerOf(ritmo.id, "Ema"),
      registeredAt: at,
      withdrawn: true,
    });
    // Registered after the period: neither counted nor summed.
    const fede = await fixture.inscribe({
      choreographyId: amanecer.id,
      dancerId: await dancerOf(ritmo.id, "Fede"),
      registeredAt: "2026-05-10T15:00:00Z",
    });
    await fixture.inscribe({
      choreographyId: brisa.id,
      dancerId: await dancerOf(sur.id, "Carla"),
      registeredAt: at,
    });
    await fixture.addPayment({
      academyId: ritmo.id,
      allocations: [
        { amount: 2500, choreographyInscriptionId: ana.id },
        { amount: 1000, choreographyInscriptionId: bruno.id },
        { amount: 2000, choreographyInscriptionId: ema.id },
        { amount: 700, choreographyInscriptionId: fede.id },
      ],
      amount: 7000,
      paymentDate: "2026-04-10",
    });

    const { sheets } = await exportSheets({
      from: "2026-04-01",
      to: "2026-04-30",
    });

    expect(sheets.get("Por coreografía")).toEqual([
      [
        "#",
        "Coreografía",
        "Academia",
        "Modalidad",
        "Inscripciones",
        "Retiradas",
        "Descuento por bailarín",
        "Seña",
        "Seña pagada",
        "Total",
        "Pagado",
        "Saldo adeudado",
      ],
      [
        amanecer.choreographyNumber,
        "Amanecer",
        "Estudio Ritmo",
        fixture.catalog.modality.name,
        2,
        1,
        0,
        // Three deposits of 3000; Ana and Bruno's totals plus Ema's retained 2000.
        9000,
        5500,
        22000,
        5500,
        16500,
      ],
      [
        brisa.choreographyNumber,
        "Brisa",
        "Academia Sur",
        "Tango",
        1,
        0,
        0,
        3000,
        0,
        10000,
        0,
        10000,
      ],
      ["Total", null, null, null, 3, 1, 0, 12000, 5500, 32000, 5500, 26500],
    ]);
  });

  test("leaves blank the amounts an inscription without a price makes unknown", async () => {
    // Past the deadline of the catalog's only price: nothing applies.
    vi.spyOn(businessTimeZone, "getBusinessDateOnly").mockReturnValue(
      "2026-06-15",
    );
    const fixture = await seedPeriodExportFixture();
    const academy = await fixture.addAcademy({ name: "Estudio Ritmo" });
    const choreography = await fixture.addChoreography({
      academyId: academy.id,
      name: "Amanecer",
    });

    await fixture.inscribe({
      choreographyId: choreography.id,
      dancerId: (await fixture.addDancer(academy.id, { firstName: "Ana" })).id,
      registeredAt: "2026-04-10T15:00:00Z",
    });

    const { sheets } = await exportSheets();

    // `Pagado` is known; the trailing `Saldo adeudado` is an empty cell.
    expect(sheets.get("Por coreografía")?.slice(1)).toEqual([
      [
        choreography.choreographyNumber,
        "Amanecer",
        "Estudio Ritmo",
        fixture.catalog.modality.name,
        1,
        0,
        null,
        null,
        null,
        null,
        0,
      ],
      ["Total", null, null, null, 1, 0, null, null, null, null, 0],
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
