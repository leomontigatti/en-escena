import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { dancers, professors } from "@/db/schema";
import { activateEvent } from "@/lib/events/management.server";
import {
  createPortalSavedEvent as createSavedEvent,
  testEventDate as date,
} from "@/lib/events/saved-event-test-support.server";
import { loadCreateChoreographyRouteData } from "@/features/portal/choreographies/create/server";
import { createAcademySession } from "@/features/portal/test-support/db";

import { installDatabaseTestHooks } from "../../../../../tests/db/harness";

installDatabaseTestHooks();

async function createCreateChoreographyScenario(input: {
  academyName: string;
  email: string;
  eventName: string;
}) {
  const session = await createAcademySession({
    academyName: input.academyName,
    email: input.email,
  });
  const event = await createSavedEvent({
    name: input.eventName,
    registrationStartsAt: date("2026-06-01T12:00:00Z"),
    registrationEndsAt: date("2026-06-30T12:00:00Z"),
    startsAt: date("2026-07-01T12:00:00Z"),
    endsAt: date("2026-07-03T12:00:00Z"),
  });
  await activateEvent(event.id);
  await db.insert(dancers).values([
    {
      academyId: session.academyId,
      firstName: "Ana",
      lastName: "Activa",
      birthDate: "2014-01-01",
      active: true,
    },
    {
      academyId: session.academyId,
      firstName: "Bea",
      lastName: "Archivada",
      birthDate: "2014-01-01",
      active: false,
    },
  ]);
  await db.insert(professors).values([
    {
      academyId: session.academyId,
      firstName: "Luz",
      lastName: "Activa",
      active: true,
    },
    {
      academyId: session.academyId,
      firstName: "Mar",
      lastName: "Archivada",
      active: false,
    },
  ]);

  return session;
}

describe("the choreography-creation options, as the eligibility rule with nothing linked yet", () => {
  test("offers the academy's active roster people and leaves the archived ones out", async () => {
    const session = await createCreateChoreographyScenario({
      academyName: "Academia Crear Coreografía",
      email: "crear.coreografia@example.com",
      eventName: "Regional Crear",
    });

    const data = await loadCreateChoreographyRouteData(
      new Request("http://localhost/portal/coreografias/crear", {
        headers: { cookie: session.cookie },
      }),
    );

    expect(data.activeDancers.map((dancer) => dancer.firstName)).toEqual([
      "Ana",
    ]);
    expect(
      data.activeProfessors.map((professor) => professor.firstName),
    ).toEqual(["Luz"]);
  });

  test("offers no roster person of another academy", async () => {
    const session = await createCreateChoreographyScenario({
      academyName: "Academia Propia",
      email: "crear.coreografia.propia@example.com",
      eventName: "Regional Propio",
    });
    const otherAcademy = await createAcademySession({
      academyName: "Academia Ajena",
      email: "crear.coreografia.ajena@example.com",
    });
    await db.insert(dancers).values({
      academyId: otherAcademy.academyId,
      firstName: "Ajena",
      lastName: "Activa",
      birthDate: "2014-01-01",
      active: true,
    });
    await db.insert(professors).values({
      academyId: otherAcademy.academyId,
      firstName: "Ajeno",
      lastName: "Activo",
      active: true,
    });

    const data = await loadCreateChoreographyRouteData(
      new Request("http://localhost/portal/coreografias/crear", {
        headers: { cookie: session.cookie },
      }),
    );

    expect(data.activeDancers.map((dancer) => dancer.firstName)).toEqual([
      "Ana",
    ]);
    expect(
      data.activeProfessors.map((professor) => professor.firstName),
    ).toEqual(["Luz"]);
  });
});
