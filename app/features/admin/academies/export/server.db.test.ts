import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { user } from "@/db/schema";
import {
  periodExportRequest,
  seedPeriodExportFixture,
} from "@/features/admin/period-export/period-export.test-support";
import { readWorkbook } from "@/features/admin/period-export/workbook.test-support";
import { expectThrownResponse } from "@/lib/admin/test-support/db";

import { loadAcademiesExport } from "./server";
import { academiesExportPath } from "./shared";

import { installDatabaseTestHooks } from "../../../../../tests/db/harness";

installDatabaseTestHooks();

const header = ["Academia", "Responsable", "Teléfono", "Email de acceso"];

async function exportRows(
  period: { from: string | null; to: string | null } = { from: null, to: null },
) {
  const response = await loadAcademiesExport(
    await periodExportRequest(academiesExportPath, period),
  );
  const [rows] = [...(await readWorkbook(response)).values()];

  return { response, rows };
}

type Fixture = Awaited<ReturnType<typeof seedPeriodExportFixture>>;

async function academyRegisteredAt(
  fixture: Fixture,
  name: string,
  registeredAt: string,
) {
  const academy = await fixture.addAcademy({
    contactName: `Responsable ${name}`,
    name,
    phone: "3415551234",
  });
  const choreography = await fixture.addChoreography({
    academyId: academy.id,
  });
  const dancer = await fixture.addDancer(academy.id);

  await fixture.inscribe({
    choreographyId: choreography.id,
    dancerId: dancer.id,
    registeredAt,
  });

  return academy;
}

describe("the academies export", () => {
  test("lists the academies with an inscription registered in the period, with their contact", async () => {
    const fixture = await seedPeriodExportFixture();
    const inside = await academyRegisteredAt(
      fixture,
      "Estudio Ritmo",
      "2026-04-10T15:00:00Z",
    );
    await db
      .update(user)
      .set({ email: "ritmo@example.com" })
      .where(eq(user.id, inside.userId));
    await academyRegisteredAt(
      fixture,
      "Academia Marzo",
      "2026-03-10T15:00:00Z",
    );
    // An academy with nothing registered in the event at all.
    await fixture.addAcademy({ name: "Academia Ausente" });

    const { response, rows } = await exportRows({
      from: "2026-04-01",
      to: "2026-04-30",
    });

    expect(response.headers.get("Content-Disposition")).toBe(
      'attachment; filename="academias-en-escena-2026-2026-04-01-a-2026-04-30.xlsx"',
    );
    expect(rows).toEqual([
      header,
      [
        "Estudio Ritmo",
        "Responsable Estudio Ritmo",
        "3415551234",
        "ritmo@example.com",
      ],
    ]);
  });

  test("lists an academy once, however many inscriptions it registered", async () => {
    const fixture = await seedPeriodExportFixture();
    const academy = await academyRegisteredAt(
      fixture,
      "Estudio Ritmo",
      "2026-04-10T15:00:00Z",
    );
    const other = await fixture.addDancer(academy.id, { firstName: "Bruno" });
    const choreography = await fixture.addChoreography({
      academyId: academy.id,
    });
    await fixture.inscribe({
      choreographyId: choreography.id,
      dancerId: other.id,
      registeredAt: "2026-04-11T15:00:00Z",
    });

    const { rows } = await exportRows();

    expect(rows.slice(1).map((row) => row[0])).toEqual(["Estudio Ritmo"]);
  });

  test("lists an academy whose only registration in the period is a seminar inscription of its roster", async () => {
    const fixture = await seedPeriodExportFixture();
    const byDancer = await fixture.addAcademy({ name: "Academia Bailarina" });
    const byProfessor = await fixture.addAcademy({
      name: "Academia Profesora",
    });
    const withdrawnOnly = await fixture.addAcademy({
      name: "Academia Retirada",
    });
    await fixture.addSeminarInscription({
      dancerId: (await fixture.addDancer(byDancer.id)).id,
      registeredAt: "2026-04-10T15:00:00Z",
    });
    await fixture.addSeminarInscription({
      professorId: (await fixture.addProfessor(byProfessor.id)).id,
      registeredAt: "2026-04-10T15:00:00Z",
    });
    await fixture.addSeminarInscription({
      dancerId: (await fixture.addDancer(withdrawnOnly.id)).id,
      registeredAt: "2026-04-10T15:00:00Z",
      withdrawn: true,
    });

    const { rows } = await exportRows({ from: "2026-04-01", to: "2026-04-30" });

    expect(rows.slice(1).map((row) => row[0])).toEqual([
      "Academia Bailarina",
      "Academia Profesora",
    ]);
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

  test.each(["admin", "academy", "judge"] as const)(
    "refuses the %s",
    async (role) => {
      await seedPeriodExportFixture();

      await expectThrownResponse(
        loadAcademiesExport(
          await periodExportRequest(
            academiesExportPath,
            { from: null, to: null },
            role,
          ),
        ),
        403,
      );
    },
  );
});
