import { afterEach, describe, expect, test, vi } from "vitest";

import { db } from "@/db";
import { professors } from "@/db/schema";
import { adminListPageSize } from "@/lib/admin/admin-list";
import {
  createSignedInAdminRequest,
  expectThrownResponse,
} from "@/lib/admin/test-support/db";
import { createProfessor } from "@/features/portal/choreographies/test-support/db";
import { createAcademyRecord } from "@/features/portal/test-support/db";
import {
  createEventChoreographyFixture,
  createEventFixtureDates,
  createSavedEvent,
} from "@/lib/events/bases-test-fixtures.server.db";

import { installDatabaseTestHooks } from "../../../../../tests/db/harness";

import { loadProfessorAccreditationsPrint } from "./server";
import { buildProfessorAccreditationsHref } from "./shared";

installDatabaseTestHooks();

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("loadProfessorAccreditationsPrint", () => {
  test("prints exactly the ticked professors, ordered by academy and then last name", async () => {
    const zeta = await seedAcademy("Zeta Danza");
    const alfa = await seedAcademy("Alfa Ballet");
    const zetaRuiz = await createProfessor(zeta.id, {
      firstName: "Ana",
      lastName: "Ruiz",
    });
    const alfaPaz = await createProfessor(alfa.id, {
      firstName: "Lía",
      lastName: "Paz",
    });
    const alfaAcosta = await createProfessor(alfa.id, {
      firstName: "Juan",
      lastName: "Acosta",
    });
    await createProfessor(alfa.id, { firstName: "Sin", lastName: "Tildar" });

    const html = await printHtml(
      buildProfessorAccreditationsHref({
        professorIds: [zetaRuiz.id, alfaPaz.id, alfaAcosta.id],
        listSearch: "busqueda=nadie",
      }),
    );

    expect(printedProfessorIds(html)).toEqual([
      alfaAcosta.id,
      alfaPaz.id,
      zetaRuiz.id,
    ]);
    expect(html).toContain("Juan Acosta");
    expect(html).toContain("Alfa Ballet");
  });

  test("never prints an archived professor, even when asked for by id", async () => {
    const academy = await seedAcademy("Academia Archivo");
    const active = await createProfessor(academy.id, { lastName: "Activa" });
    const archived = await createProfessor(academy.id, {
      lastName: "Archivada",
      active: false,
    });

    const byId = await printHtml(
      buildProfessorAccreditationsHref({
        professorIds: [active.id, archived.id],
        listSearch: "",
      }),
    );
    const byArchivedFilter = await printHtml(
      buildProfessorAccreditationsHref({
        professorIds: [],
        listSearch: "estado=archivados",
      }),
    );

    expect(printedProfessorIds(byId)).toEqual([active.id]);
    expect(printedProfessorIds(byArchivedFilter)).toEqual([]);
  });

  test("with nothing ticked, prints every professor the list's search matches, past its first page", async () => {
    const academy = await seedAcademy("Academia Multitud");
    const matchingCount = adminListPageSize + 1;
    const matching = await db
      .insert(professors)
      .values(
        Array.from({ length: matchingCount }, (_, index) => ({
          academyId: academy.id,
          firstName: `Docente ${String(index).padStart(2, "0")}`,
          lastName: "Quiroga",
          active: true,
        })),
      )
      .returning({ id: professors.id });
    await createProfessor(academy.id, { firstName: "Otra", lastName: "Mora" });

    const html = await printHtml(
      buildProfessorAccreditationsHref({
        professorIds: [],
        listSearch: "busqueda=quiroga&pagina=1",
      }),
    );

    expect(printedProfessorIds(html).sort()).toEqual(
      matching.map((row) => row.id).sort(),
    );
  });

  test("with nothing ticked, prints only the professors dancing on the list's day", async () => {
    const event = await createSavedEvent("Regional Días", {
      activate: true,
      dates: createEventFixtureDates(2026),
    });
    const academy = await seedAcademy("Academia Días");
    const friday = await createProfessor(academy.id, { firstName: "Vera" });
    const saturday = await createProfessor(academy.id, { firstName: "Sara" });
    await createEventChoreographyFixture({
      academyId: academy.id,
      eventId: event.id,
      name: "Viernes",
      professorIds: [friday.id],
      scheduledDate: "2026-05-01",
    });
    await createEventChoreographyFixture({
      academyId: academy.id,
      eventId: event.id,
      name: "Sábado",
      professorIds: [saturday.id],
      scheduledDate: "2026-05-02",
    });

    const html = await printHtml(
      buildProfessorAccreditationsHref({
        professorIds: [],
        listSearch: "dia=2026-05-02",
      }),
    );

    expect(printedProfessorIds(html)).toEqual([saturday.id]);
  });

  test("points every QR code at the public program on the configured base URL", async () => {
    vi.stubEnv("APP_URL", "https://sistema.example.com.ar");
    const academy = await seedAcademy("Academia QR");
    await createProfessor(academy.id);

    const html = await printHtml(
      buildProfessorAccreditationsHref({ professorIds: [], listSearch: "" }),
    );

    expect(html).toContain(
      'data-qr-url="https://sistema.example.com.ar/programa"',
    );
    expect(html).toContain("<svg");
  });

  test("answers 403 to an auditor", async () => {
    const { request } = await createSignedInAdminRequest({
      email: `acreditaciones.auditor.${crypto.randomUUID()}@example.com`,
      requestUrl: `http://localhost${buildProfessorAccreditationsHref({ professorIds: [], listSearch: "" })}`,
      role: "auditor",
    });

    await expectThrownResponse(loadProfessorAccreditationsPrint(request), 403);
  });
});

async function seedAcademy(academyName: string) {
  return await createAcademyRecord({
    academyName,
    email: `acreditaciones.${crypto.randomUUID()}@example.com`,
  });
}

async function printHtml(href: string) {
  const { request } = await createSignedInAdminRequest({
    email: `acreditaciones.admin.${crypto.randomUUID()}@example.com`,
    requestUrl: `http://localhost${href}`,
    role: "admin",
  });
  const response = await loadProfessorAccreditationsPrint(request);

  expect(response.headers.get("Content-Type")).toContain("text/html");

  return await response.text();
}

function printedProfessorIds(html: string) {
  return [...html.matchAll(/data-professor-id="([^"]+)"/g)].map(
    (match) => match[1],
  );
}
