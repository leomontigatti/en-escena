import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { choreographies, choreographyDancers } from "@/db/schema";
import { readWorkbook } from "@/features/admin/period-export/workbook.test-support";
import {
  createAcademySession,
  createChoreographyRecord,
  createDancer,
  createEventCatalog,
  createEventRecord,
} from "@/features/portal/choreographies/test-support/db";
import { createSignedInRequest } from "@/lib/test-support/auth";
import { expectThrownResponse } from "@/lib/test-support/http";

import { loadChoreographyDancersExport } from "./server";
import { choreographyDancersExportPath } from "./shared";

import { installDatabaseTestHooks } from "../../../../../tests/db/harness";

installDatabaseTestHooks();

const header = [
  "Nombre completo",
  "Tipo de documento",
  "Número de documento",
  "Fecha de nacimiento",
  "Edad al inicio del evento",
];

let requestCount = 0;

async function seedChoreography(name = "Luz de luna") {
  const owner = await createAcademySession({
    academyName: "Estudio Ritmo",
    email: `academia.bailarines-export.${(requestCount += 1)}@example.com`,
  });
  const event = await createEventRecord({
    active: true,
    name: "Regional 2026",
  });
  const catalog = await createEventCatalog(event.id);
  const choreography = await createChoreographyRecord({
    academyId: owner.academyId,
    categoryId: catalog.categoryWithLevel.id,
    eventId: event.id,
    experienceLevelId: catalog.level.id,
    modalityId: catalog.modality.id,
    name,
    scheduleCapacityId: catalog.scheduleCapacity.id,
    submodalityId: catalog.submodality.id,
  });

  async function inscribe(
    dancer: Parameters<typeof createDancer>[1],
    inscription: { ageAtEventStart?: number; withdrawn?: boolean } = {},
  ) {
    const created = await createDancer(owner.academyId, dancer);

    await db.insert(choreographyDancers).values({
      ageAtEventStart: inscription.ageAtEventStart ?? 14,
      choreographyId: choreography.id,
      dancerId: created.id,
      withdrawnAt: inscription.withdrawn ? new Date() : null,
    });
  }

  return { choreography, inscribe };
}

async function exportFor(
  choreographyId: string,
  role: "academy" | "admin" | "auditor" | "judge" = "admin",
) {
  const { request } = await createSignedInRequest({
    email: `${role}.bailarines-export.${(requestCount += 1)}@example.com`,
    requestUrl: `http://localhost${choreographyDancersExportPath(choreographyId)}`,
    role,
  });

  return await loadChoreographyDancersExport({
    params: { choreographyId },
    request,
  });
}

async function exportRows(choreographyId: string) {
  const response = await exportFor(choreographyId);
  const [rows] = [...(await readWorkbook(response)).values()];

  return { response, rows };
}

describe("the choreography's dancers export", () => {
  test("lists each dancer on the roster with their document, birth date and age at the event's start, by surname", async () => {
    const { choreography, inscribe } = await seedChoreography();
    await inscribe(
      {
        birthDate: "2012-01-10",
        documentNumber: "45111222",
        documentType: "dni",
        firstName: "Ana",
        lastName: "Zapata",
      },
      { ageAtEventStart: 14 },
    );
    await inscribe(
      {
        birthDate: "2013-06-02",
        documentNumber: "AB123",
        documentType: "passport",
        firstName: "Bruno",
        lastName: "Alvarez",
      },
      { ageAtEventStart: 12 },
    );

    const { response, rows } = await exportRows(choreography.id);

    expect(response.headers.get("Content-Disposition")).toBe(
      `attachment; filename="bailarines-regional-2026-${String(
        choreography.choreographyNumber,
      ).padStart(5, "0")}-luz-de-luna.xlsx"`,
    );
    expect(rows).toEqual([
      header,
      // The birth date is a date cell: its spreadsheet serial.
      ["Bruno Alvarez", "Pasaporte", "AB123", 41427, 12],
      ["Ana Zapata", "DNI", "45111222", 40918, 14],
    ]);
  });

  test("leaves out a withdrawn inscription", async () => {
    const { choreography, inscribe } = await seedChoreography();
    await inscribe({ firstName: "Activa" });
    await inscribe({ firstName: "Retirada" }, { withdrawn: true });

    const { rows } = await exportRows(choreography.id);

    expect(rows.slice(1).map((row) => row[0])).toEqual(["Activa Paz"]);
  });

  test("says a dancer has no document rather than leaving the type blank", async () => {
    const { choreography, inscribe } = await seedChoreography();
    await inscribe({});

    const { rows } = await exportRows(choreography.id);

    expect(rows[1]?.slice(0, 3)).toEqual(["Ana Paz", "Sin documento", null]);
  });

  test("downloads the headers and no rows for a choreography with no dancers", async () => {
    const { choreography } = await seedChoreography();

    const { response, rows } = await exportRows(choreography.id);

    expect(response.status).toBe(200);
    expect(rows).toEqual([header]);
  });

  test("refuses a withdrawn choreography", async () => {
    const { choreography } = await seedChoreography();
    await db
      .update(choreographies)
      .set({ withdrawnAt: new Date() })
      .where(eq(choreographies.id, choreography.id));

    await expectThrownResponse(exportFor(choreography.id), 403);
  });

  test("does not find a choreography that does not exist", async () => {
    await seedChoreography();

    await expectThrownResponse(exportFor(crypto.randomUUID()), 404);
  });

  test.each(["auditor", "academy", "judge"] as const)(
    "refuses the %s",
    async (role) => {
      const { choreography } = await seedChoreography();

      await expectThrownResponse(exportFor(choreography.id, role), 403);
    },
  );
});
