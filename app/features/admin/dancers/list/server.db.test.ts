import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { choreographyDancers } from "@/db/schema";
import {
  createSignedInAdminRequest,
  expectThrownResponse,
} from "@/lib/admin/test-support/db";
import { createDancer } from "@/features/portal/choreographies/test-support/db";
import { createAcademyRecord } from "@/features/portal/test-support/db";
import {
  createEventChoreographyFixture,
  createEventFixtureDates,
  createSavedEvent,
} from "@/lib/events/bases-test-fixtures.server.db";

import { installDatabaseTestHooks } from "../../../../../tests/db/harness";

import { loadDancersList } from "./server";

installDatabaseTestHooks();

describe("loadDancersList", () => {
  test("finds a dancer whatever accents the search is typed with", async () => {
    const academy = await seedAcademy();
    const jose = await createDancer(academy.id, {
      firstName: "José",
      lastName: "Muñoz",
    });
    await createDancer(academy.id, { firstName: "Ana", lastName: "Paz" });

    const data = await loadDancersList(
      await listRequest("?busqueda=jose+munoz"),
    );

    expect(data.dancers.map((dancer) => dancer.id)).toEqual([jose.id]);
  });

  test("finds every record of an academy by the academy's name", async () => {
    const academy = await seedAcademy();
    const other = await createAcademyRecord({
      academyName: "Estudio Norte",
      email: `otra.academia.${crypto.randomUUID()}@example.com`,
    });
    const matching = await createDancer(academy.id);
    await createDancer(other.id);

    const data = await loadDancersList(await listRequest("?busqueda=lista"));

    expect(data.dancers.map((row) => row.id)).toEqual([matching.id]);
  });

  test("keeps sorting by name descending from an existing `nombre:desc` link", async () => {
    const academy = await seedAcademy();
    await createDancer(academy.id, { firstName: "Ana", lastName: "Paz" });
    await createDancer(academy.id, { firstName: "Zoe", lastName: "Paz" });

    const data = await loadDancersList(
      await listRequest("?orden=nombre%3Adesc"),
    );

    expect(data.dancers.map((dancer) => dancer.firstName)).toEqual([
      "Zoe",
      "Ana",
    ]);
  });

  test("redirects a page past the last one, and stale parameters, to the canonical URL", async () => {
    const academy = await seedAcademy();
    await createDancer(academy.id);

    const response = await expectThrownResponse(
      loadDancersList(
        await listRequest(
          "?evento=abc&identificacion=todos&estado=archivados&pagina=3",
        ),
      ),
      302,
    );

    expect(response.headers.get("Location")).toBe(
      "/administracion/bailarines?estado=archivados",
    );
  });
});

describe("the `Día` filter", () => {
  test("lists the dancers with an active inscription on that day, offering the days the event's choreographies fall on", async () => {
    const event = await seedActiveEvent();
    const academy = await seedAcademy();
    const friday = await createDancer(academy.id, { firstName: "Vera" });
    const saturday = await createDancer(academy.id, { firstName: "Sara" });
    const withdrawn = await createDancer(academy.id, { firstName: "Wanda" });
    await createEventChoreographyFixture({
      academyId: academy.id,
      dancerIds: [friday.id],
      eventId: event.id,
      name: "Viernes",
      scheduledDate: "2026-05-01",
    });
    await createEventChoreographyFixture({
      academyId: academy.id,
      dancerIds: [saturday.id, withdrawn.id],
      eventId: event.id,
      name: "Sábado",
      scheduledDate: "2026-05-02",
    });
    await db
      .update(choreographyDancers)
      .set({ withdrawnAt: new Date() })
      .where(eq(choreographyDancers.dancerId, withdrawn.id));

    const data = await loadDancersList(await listRequest("?dia=2026-05-02"));

    expect(data.dancers.map((dancer) => dancer.id)).toEqual([saturday.id]);
    expect(data.dayOptions.map((option) => option.value)).toEqual([
      "2026-05-01",
      "2026-05-02",
    ]);
  });

  test("drops a day no choreography of the event falls on from the URL", async () => {
    const event = await seedActiveEvent();
    const academy = await seedAcademy();
    await createEventChoreographyFixture({
      academyId: academy.id,
      eventId: event.id,
      name: "Viernes",
      scheduledDate: "2026-05-01",
    });

    const response = await expectThrownResponse(
      loadDancersList(await listRequest("?dia=2026-05-03")),
      302,
    );

    expect(response.headers.get("Location")).toBe("/administracion/bailarines");
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
    email: `bailarines.lista.${crypto.randomUUID()}@example.com`,
  });
}

async function listRequest(search: string) {
  const { request } = await createSignedInAdminRequest({
    email: `bailarines.lista.admin.${crypto.randomUUID()}@example.com`,
    requestUrl: `http://localhost/administracion/bailarines${search}`,
    role: "admin",
  });

  return request;
}
