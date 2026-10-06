import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { choreographies } from "@/db/schema";
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

import { loadProfessorsList } from "./server";

installDatabaseTestHooks();

describe("loadProfessorsList", () => {
  test("finds a professor whatever accents the search is typed with", async () => {
    const academy = await seedAcademy();
    const jose = await createProfessor(academy.id, {
      firstName: "José",
      lastName: "Muñoz",
    });
    await createProfessor(academy.id, { firstName: "Ana", lastName: "Paz" });

    const data = await loadProfessorsList(
      await listRequest("?busqueda=jose+munoz"),
    );

    expect(data.professors.map((professor) => professor.id)).toEqual([jose.id]);
  });

  test("finds every record of an academy by the academy's name", async () => {
    const academy = await seedAcademy();
    const other = await createAcademyRecord({
      academyName: "Estudio Norte",
      email: `otra.academia.${crypto.randomUUID()}@example.com`,
    });
    const matching = await createProfessor(academy.id);
    await createProfessor(other.id);

    const data = await loadProfessorsList(await listRequest("?busqueda=lista"));

    expect(data.professors.map((row) => row.id)).toEqual([matching.id]);
  });

  test("keeps sorting by name descending from an existing `nombre:desc` link", async () => {
    const academy = await seedAcademy();
    await createProfessor(academy.id, { firstName: "Ana", lastName: "Paz" });
    await createProfessor(academy.id, { firstName: "Zoe", lastName: "Paz" });

    const data = await loadProfessorsList(
      await listRequest("?orden=nombre%3Adesc"),
    );

    expect(data.professors.map((professor) => professor.firstName)).toEqual([
      "Zoe",
      "Ana",
    ]);
  });

  test("redirects a page past the last one, and stale parameters, to the canonical URL", async () => {
    const academy = await seedAcademy();
    await createProfessor(academy.id);

    const response = await expectThrownResponse(
      loadProfessorsList(
        await listRequest(
          "?evento=abc&participando=todos&estado=archivados&pagina=3",
        ),
      ),
      302,
    );

    expect(response.headers.get("Location")).toBe(
      "/administracion/profesores?estado=archivados",
    );
  });
});

describe("the `Día` filter", () => {
  test("lists the professors of a choreography still in the event on that day", async () => {
    const event = await seedActiveEvent();
    const academy = await seedAcademy();
    const friday = await createProfessor(academy.id, { firstName: "Vera" });
    const saturday = await createProfessor(academy.id, { firstName: "Sara" });
    const withdrawn = await createProfessor(academy.id, { firstName: "Wanda" });
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
    const withdrawnChoreography = await createEventChoreographyFixture({
      academyId: academy.id,
      eventId: event.id,
      name: "Sábado retirada",
      professorIds: [withdrawn.id],
      scheduledDate: "2026-05-02",
    });
    await db
      .update(choreographies)
      .set({ withdrawnAt: new Date() })
      .where(eq(choreographies.id, withdrawnChoreography.id));

    const data = await loadProfessorsList(await listRequest("?dia=2026-05-02"));

    expect(data.professors.map((professor) => professor.id)).toEqual([
      saturday.id,
    ]);
    expect(data.dayOptions.map((option) => option.value)).toEqual([
      "2026-05-01",
      "2026-05-02",
    ]);
  });
});

async function seedActiveEvent() {
  return await createSavedEvent("Regional Días", {
    activate: true,
    dates: createEventFixtureDates(2026),
  });
}

async function seedAcademy() {
  return await createAcademyRecord({
    academyName: "Academia Lista",
    email: `profesores.lista.${crypto.randomUUID()}@example.com`,
  });
}

async function listRequest(search: string) {
  const { request } = await createSignedInAdminRequest({
    email: `profesores.lista.admin.${crypto.randomUUID()}@example.com`,
    requestUrl: `http://localhost/administracion/profesores${search}`,
    role: "admin",
  });

  return request;
}
