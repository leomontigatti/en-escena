import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { seminarInscriptions, seminarPrices, seminars } from "@/db/schema";
import { seedPeriodExportFixture } from "@/features/admin/period-export/period-export.test-support";
import { readWorkbook } from "@/features/admin/period-export/workbook.test-support";
import {
  createSignedInAdminRequest,
  expectThrownResponse,
} from "@/lib/admin/test-support/db";

import { listExportableSeminarIds, loadSeminarsExport } from "./server";
import { buildSeminarExportHref, exportAllSeminars } from "./shared";

import { installDatabaseTestHooks } from "../../../../../tests/db/harness";

installDatabaseTestHooks();

const header = [
  "Instructor",
  "Nombre completo",
  "Tipo",
  "Estado",
  "Academia",
  "Seña",
  "Seña pagada",
  "Total",
  "Pagado",
  "Saldo adeudado",
];

async function exportRequest(
  seminar: string,
  role: "academy" | "admin" | "auditor" | "judge" = "auditor",
) {
  const { request } = await createSignedInAdminRequest({
    email: `${crypto.randomUUID()}@example.com`,
    requestUrl: `http://localhost${buildSeminarExportHref(seminar)}`,
    role,
  });

  return request;
}

async function exportSheets(seminar: string = exportAllSeminars) {
  const response = await loadSeminarsExport(await exportRequest(seminar));

  return { response, sheets: await readWorkbook(response) };
}

/**
 * The export fixture plus seminars of its event, a price list every
 * inscription below reads (30.000, deposit at the seminar's 50%) and the verb
 * to register a person in a seminar.
 */
async function seedSeminarsFixture() {
  const fixture = await seedPeriodExportFixture();

  for (const forParticipants of [false, true]) {
    await db.insert(seminarPrices).values({
      amount: 30000,
      eventId: fixture.event.id,
      forParticipants,
      kind: "regular",
      name: "Precio general",
      paymentDeadline: null,
    });
  }

  const addSeminar = async (input: {
    instructorName: string;
    scheduledDate: string;
    startTime?: string;
  }) => {
    const [seminar] = await db
      .insert(seminars)
      .values({
        eventId: fixture.event.id,
        instructorName: input.instructorName,
        quota: 20,
        scheduledDate: input.scheduledDate,
        startTime: input.startTime ?? "10:00",
      })
      .returning();

    return seminar;
  };

  const register = async (
    input: ({ dancerId: string } | { professorId: string }) & {
      seminarId: string;
      withdrawn?: boolean;
    },
  ) => {
    const [inscription] = await db
      .insert(seminarInscriptions)
      .values({
        dancerId: "dancerId" in input ? input.dancerId : null,
        professorId: "professorId" in input ? input.professorId : null,
        seminarId: input.seminarId,
        withdrawnAt: input.withdrawn ? new Date() : null,
      })
      .returning();

    return inscription;
  };

  return { ...fixture, addSeminar, register };
}

describe("the auditor's seminar export", () => {
  test("gives each seminar with inscriptions a sheet of its people and their money", async () => {
    const fixture = await seedSeminarsFixture();
    const sol = await fixture.addAcademy({ name: "Academia Sol" });
    const luna = await fixture.addAcademy({ name: "Academia Luna" });
    const zoe = await fixture.addDancer(sol.id, {
      firstName: "Zoe",
      lastName: "Díaz",
    });
    const ana = await fixture.addDancer(sol.id, {
      firstName: "Ana",
      lastName: "Paz",
    });
    const luz = await fixture.addProfessor(luna.id, {
      firstName: "Luz",
      lastName: "Suárez",
    });
    // Listed by date, so the later one's sheet comes second whatever its name.
    const later = await fixture.addSeminar({
      instructorName: "Alicia Alonso",
      scheduledDate: "2026-05-03",
    });
    const earlier = await fixture.addSeminar({
      instructorName: "Julio Bocca",
      scheduledDate: "2026-05-02",
    });
    // No inscriptions: no sheet.
    await fixture.addSeminar({
      instructorName: "Maximiliano Guerra",
      scheduledDate: "2026-05-02",
    });
    const zoeAtEarlier = await fixture.register({
      dancerId: zoe.id,
      seminarId: earlier.id,
    });
    await fixture.register({ dancerId: ana.id, seminarId: earlier.id });
    await fixture.register({ professorId: luz.id, seminarId: earlier.id });
    await fixture.register({ dancerId: ana.id, seminarId: later.id });
    await fixture.addPayment({
      academyId: sol.id,
      allocations: [{ amount: 20000, seminarInscriptionId: zoeAtEarlier.id }],
      amount: 20000,
      paymentDate: "2026-04-10",
    });

    const { response, sheets } = await exportSheets();

    expect(response.headers.get("Content-Disposition")).toBe(
      'attachment; filename="seminarios-en-escena-2026-todos.xlsx"',
    );
    expect([...sheets.keys()]).toEqual(["Julio Bocca", "Alicia Alonso"]);
    // By academy, then by full name.
    expect(sheets.get("Julio Bocca")).toEqual([
      header,
      [
        "Julio Bocca",
        "Luz Suárez",
        "Profesor",
        "Activa",
        "Academia Luna",
        15000,
        0,
        30000,
        0,
        30000,
      ],
      [
        "Julio Bocca",
        "Ana Paz",
        "Bailarín",
        "Activa",
        "Academia Sol",
        15000,
        0,
        30000,
        0,
        30000,
      ],
      [
        "Julio Bocca",
        "Zoe Díaz",
        "Bailarín",
        "Activa",
        "Academia Sol",
        15000,
        15000,
        30000,
        20000,
        10000,
      ],
      ["Total", null, null, null, null, 45000, 15000, 90000, 20000, 70000],
    ]);
    expect(sheets.get("Alicia Alonso")).toHaveLength(3);
  });

  test("exports one seminar alone, named after it", async () => {
    const fixture = await seedSeminarsFixture();
    const sol = await fixture.addAcademy({ name: "Academia Sol" });
    const ana = await fixture.addDancer(sol.id);
    const bocca = await fixture.addSeminar({
      instructorName: "Julio Bocca",
      scheduledDate: "2026-05-02",
    });
    const alonso = await fixture.addSeminar({
      instructorName: "Alicia Alonso",
      scheduledDate: "2026-05-03",
    });
    await fixture.register({ dancerId: ana.id, seminarId: bocca.id });
    await fixture.register({ dancerId: ana.id, seminarId: alonso.id });

    const { response, sheets } = await exportSheets(alonso.id);

    expect(response.headers.get("Content-Disposition")).toBe(
      'attachment; filename="seminarios-en-escena-2026-alicia-alonso.xlsx"',
    );
    expect([...sheets.keys()]).toEqual(["Alicia Alonso"]);
  });

  test("keeps a withdrawn inscription with the money it holds", async () => {
    const fixture = await seedSeminarsFixture();
    const sol = await fixture.addAcademy({ name: "Academia Sol" });
    const ana = await fixture.addDancer(sol.id);
    const seminar = await fixture.addSeminar({
      instructorName: "Julio Bocca",
      scheduledDate: "2026-05-02",
    });
    const inscription = await fixture.register({
      dancerId: ana.id,
      seminarId: seminar.id,
    });
    await fixture.addPayment({
      academyId: sol.id,
      allocations: [{ amount: 15000, seminarInscriptionId: inscription.id }],
      amount: 15000,
      paymentDate: "2026-04-10",
    });
    await db
      .update(seminarInscriptions)
      .set({ withdrawnAt: new Date() })
      .where(eq(seminarInscriptions.id, inscription.id));

    const { sheets } = await exportSheets();

    // Its total is what it kept, so it owes nothing.
    expect(sheets.get("Julio Bocca")?.[1]).toEqual([
      "Julio Bocca",
      "Ana Paz",
      "Bailarín",
      "Retirada",
      "Academia Sol",
      15000,
      15000,
      15000,
      15000,
      0,
    ]);
  });

  test("leaves blank the amounts of an inscription nothing prices, and their totals", async () => {
    const fixture = await seedSeminarsFixture();
    const sol = await fixture.addAcademy({ name: "Academia Sol" });
    const ana = await fixture.addDancer(sol.id);
    // `Exclusivo` with only `Común` rows of the other cell would still price;
    // deleting the list leaves nothing to price by.
    await db
      .delete(seminarPrices)
      .where(eq(seminarPrices.eventId, fixture.event.id));
    const seminar = await fixture.addSeminar({
      instructorName: "Julio Bocca",
      scheduledDate: "2026-05-02",
    });
    await fixture.register({ dancerId: ana.id, seminarId: seminar.id });

    const { sheets } = await exportSheets();

    // The reader does not see a blank last cell, so `Saldo adeudado` is not there.
    expect(sheets.get("Julio Bocca")?.slice(1)).toEqual([
      [
        "Julio Bocca",
        "Ana Paz",
        "Bailarín",
        "Activa",
        "Academia Sol",
        null,
        null,
        null,
        0,
      ],
      ["Total", null, null, null, null, null, null, null, 0],
    ]);
  });

  test("tells apart two seminars of one instructor by their date and time", async () => {
    const fixture = await seedSeminarsFixture();
    const sol = await fixture.addAcademy({ name: "Academia Sol" });
    const ana = await fixture.addDancer(sol.id);
    const morning = await fixture.addSeminar({
      instructorName: "Julio Bocca",
      scheduledDate: "2026-05-02",
      startTime: "10:00",
    });
    const evening = await fixture.addSeminar({
      instructorName: "Julio Bocca",
      scheduledDate: "2026-05-02",
      startTime: "18:30",
    });
    await fixture.register({ dancerId: ana.id, seminarId: morning.id });
    await fixture.register({ dancerId: ana.id, seminarId: evening.id });

    const { sheets } = await exportSheets();

    expect([...sheets.keys()]).toEqual([
      "Julio Bocca 02-05 10h00",
      "Julio Bocca 02-05 18h30",
    ]);
  });

  test("offers only the seminars someone registered in, withdrawn or not", async () => {
    const fixture = await seedSeminarsFixture();
    const sol = await fixture.addAcademy({ name: "Academia Sol" });
    const ana = await fixture.addDancer(sol.id);
    const withdrawn = await fixture.addSeminar({
      instructorName: "Julio Bocca",
      scheduledDate: "2026-05-02",
    });
    await fixture.addSeminar({
      instructorName: "Alicia Alonso",
      scheduledDate: "2026-05-02",
    });
    await fixture.register({
      dancerId: ana.id,
      seminarId: withdrawn.id,
      withdrawn: true,
    });

    expect(await listExportableSeminarIds(fixture.event.id)).toEqual(
      new Set([withdrawn.id]),
    );
  });

  test("does not find a seminar with nothing to export", async () => {
    const fixture = await seedSeminarsFixture();
    const empty = await fixture.addSeminar({
      instructorName: "Julio Bocca",
      scheduledDate: "2026-05-02",
    });

    await expectThrownResponse(
      loadSeminarsExport(await exportRequest(empty.id)),
      404,
    );
    await expectThrownResponse(
      loadSeminarsExport(await exportRequest(exportAllSeminars)),
      404,
    );
  });

  test.each(["admin", "academy", "judge"] as const)(
    "refuses the %s",
    async (role) => {
      await seedSeminarsFixture();

      await expectThrownResponse(
        loadSeminarsExport(await exportRequest(exportAllSeminars, role)),
        403,
      );
    },
  );
});
