import { describe, expect, test } from "vitest";

import {
  periodExportRequest,
  seedPeriodExportFixture,
} from "@/features/admin/period-export/period-export.test-support";
import {
  readWorkbook,
  type WorkbookCell,
} from "@/features/admin/period-export/workbook.test-support";
import { expectThrownResponse } from "@/lib/admin/test-support/db";

import { loadCollectionExport } from "./server";
import { collectionExportPath } from "./shared";

import { installDatabaseTestHooks } from "../../../../../tests/db/harness";

installDatabaseTestHooks();

const movementsHeader = [
  "Movimiento",
  "Número",
  "Fecha",
  "Academia",
  "Medio",
  "Monto",
];

async function exportSheets(
  period: { from: string | null; to: string | null } = { from: null, to: null },
) {
  const response = await loadCollectionExport(
    await periodExportRequest(collectionExportPath, period),
  );

  return { response, sheets: await readWorkbook(response) };
}

/** The amount on the row whose first cell is `label`. */
function amountOf(rows: WorkbookCell[][] | undefined, label: string) {
  return rows?.find((row) => row[0] === label)?.at(-1);
}

describe("the collection export", () => {
  test("lists each payment of the period and closes with its totals", async () => {
    const fixture = await seedPeriodExportFixture();
    const academy = await fixture.addAcademy({
      name: "Estudio Ritmo",
      province: "cordoba",
    });
    await fixture.addPayment({
      academyId: academy.id,
      amount: 30000,
      paymentDate: "2026-04-10",
    });
    await fixture.addPayment({
      academyId: academy.id,
      amount: 20000,
      paymentDate: "2026-04-12",
    });

    const { response, sheets } = await exportSheets({
      from: "2026-04-01",
      to: "2026-04-30",
    });
    const movements = sheets.get("Movimientos");

    expect(response.headers.get("Content-Disposition")).toBe(
      'attachment; filename="recaudacion-en-escena-2026-2026-04-01-a-2026-04-30.xlsx"',
    );
    expect([...sheets.keys()]).toEqual([
      "Movimientos",
      "Por provincia",
      "Por modalidad",
    ]);
    expect(movements?.[0]).toEqual(movementsHeader);
    // Dates are date cells: 2026-04-10 is the spreadsheet's day 46122.
    expect(movements?.slice(1, 3)).toEqual([
      ["Pago", 1, 46122, "Estudio Ritmo", "Transferencia", 30000],
      ["Pago", 2, 46124, "Estudio Ritmo", "Transferencia", 20000],
    ]);
    expect(amountOf(movements, "Pagos")).toBe(50000);
    expect(amountOf(movements, "Reembolsos")).toBe(0);
    expect(amountOf(movements, "Neto")).toBe(50000);
  });

  test("includes a payment dated on the `Hasta` day and leaves out the one dated the day after", async () => {
    const fixture = await seedPeriodExportFixture();
    const academy = await fixture.addAcademy({ name: "Estudio Ritmo" });
    await fixture.addPayment({
      academyId: academy.id,
      amount: 1000,
      paymentDate: "2026-04-30",
    });
    await fixture.addPayment({
      academyId: academy.id,
      amount: 7000,
      paymentDate: "2026-05-01",
    });

    const { sheets } = await exportSheets({ from: null, to: "2026-04-30" });

    expect(amountOf(sheets.get("Movimientos"), "Pagos")).toBe(1000);
  });

  test("groups the payments by province and by allocation, each summing to `Pagos`", async () => {
    const fixture = await seedPeriodExportFixture();
    const jazz = fixture.catalog.modality;
    const cordoba = await fixture.addAcademy({
      name: "Academia Córdoba",
      province: "cordoba",
    });
    const nowhere = await fixture.addAcademy({ name: "Academia Sin Lugar" });
    const dancer = await fixture.addDancer(cordoba.id);
    const choreography = await fixture.addChoreography({
      academyId: cordoba.id,
      modalityId: jazz.id,
    });
    const inscription = await fixture.inscribe({
      choreographyId: choreography.id,
      dancerId: dancer.id,
      registeredAt: "2026-03-01T15:00:00Z",
    });
    const seminarInscription = await fixture.addSeminarInscription({
      dancerId: dancer.id,
      registeredAt: "2026-03-01T15:00:00Z",
    });
    // Partly on a choreography, partly on a seminar, partly free.
    await fixture.addPayment({
      academyId: cordoba.id,
      allocations: [
        { amount: 6000, choreographyInscriptionId: inscription.id },
        { amount: 2500, seminarInscriptionId: seminarInscription.id },
      ],
      amount: 10000,
      paymentDate: "2026-04-10",
    });
    await fixture.addPayment({
      academyId: nowhere.id,
      amount: 4000,
      paymentDate: "2026-04-11",
    });

    const { sheets } = await exportSheets();

    expect(amountOf(sheets.get("Movimientos"), "Pagos")).toBe(14000);
    expect(sheets.get("Por provincia")).toEqual([
      ["Provincia", "Monto"],
      ["Córdoba", 10000],
      ["Sin provincia", 4000],
      ["Total", 14000],
    ]);
    expect(sheets.get("Por modalidad")).toEqual([
      ["Modalidad", "Monto"],
      [jazz.name, 6000],
      ["Seminarios", 2500],
      ["Sin asignar", 5500],
      ["Total", 14000],
    ]);
  });

  test("downloads every sheet with its headers and zero totals for a period with nothing in it", async () => {
    await seedPeriodExportFixture();

    const { response, sheets } = await exportSheets({
      from: "2026-01-01",
      to: "2026-01-31",
    });

    expect(response.status).toBe(200);
    expect(sheets.get("Movimientos")).toEqual([
      movementsHeader,
      ["Pagos", null, null, null, null, 0],
      ["Reembolsos", null, null, null, null, 0],
      ["Neto", null, null, null, null, 0],
    ]);
    expect(sheets.get("Por provincia")).toEqual([
      ["Provincia", "Monto"],
      ["Total", 0],
    ]);
    expect(sheets.get("Por modalidad")).toEqual([
      ["Modalidad", "Monto"],
      ["Seminarios", 0],
      ["Sin asignar", 0],
      ["Total", 0],
    ]);
  });

  test.each(["admin", "academy", "judge"] as const)(
    "refuses the %s",
    async (role) => {
      await seedPeriodExportFixture();

      await expectThrownResponse(
        loadCollectionExport(
          await periodExportRequest(
            collectionExportPath,
            { from: null, to: null },
            role,
          ),
        ),
        403,
      );
    },
  );
});
