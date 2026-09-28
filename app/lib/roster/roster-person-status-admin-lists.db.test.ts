import { describe, expect, test } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { db } from "@/db";
import { dancers, professors } from "@/db/schema";
import { createSignedInAdminRequest } from "@/lib/admin/test-support/db";
import { expectThrownResponse } from "@/lib/test-support/http";
import { renderInDataRouter } from "@/lib/test-support/data-router";
import { createAcademyUser } from "@/lib/test-support/academies";
import {
  createEventChoreographyFixture,
  createEventFixtureDates,
  createSavedEvent,
} from "@/lib/events/bases-test-fixtures.server.db";
import {
  DancersListRouteView,
  loader as dancersLoader,
} from "@/routes/administracion.bailarines";
import { loader as professorsLoader } from "@/routes/administracion.profesores";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

installDatabaseTestHooks();

let emailCounter = 0;

async function adminRouteArgs(input: { pattern: string; search: string }) {
  emailCounter += 1;
  const { request } = await createSignedInAdminRequest({
    email: `admin.alta.${emailCounter}@example.com`,
    role: "admin",
    requestUrl: `http://localhost${input.pattern}?${input.search.replace(/^&/, "")}`,
  });

  return {
    request,
    params: {},
    context: {},
    url: new URL(request.url),
    pattern: input.pattern,
  };
}

async function loadDancers(input: { search: string }) {
  return dancersLoader(
    await adminRouteArgs({
      pattern: "/administracion/bailarines",
      search: input.search,
    }),
  );
}

async function loadProfessors(input: { search: string }) {
  return professorsLoader(
    await adminRouteArgs({
      pattern: "/administracion/profesores",
      search: input.search,
    }),
  );
}

function expectBadge(
  markup: string,
  { label, variant }: { label: string; variant: string },
) {
  expect(markup).toMatch(
    new RegExp(`data-variant="${variant}"[^>]*>${label}<`),
  );
}

describe("`Estado de alta` on the two administrative lists", () => {
  test("answers the status parameter the same way for dancers and for professors", async () => {
    const academy = await createAcademyUser({
      academyName: "Academia Alta Listas",
      email: "academia.alta.listas@example.com",
    });

    await db.insert(dancers).values([
      {
        academyId: academy.academy.id,
        firstName: "Ana",
        lastName: "Activa",
        birthDate: "2012-01-10",
      },
      {
        academyId: academy.academy.id,
        active: false,
        firstName: "Bea",
        lastName: "Archivada",
        birthDate: "2012-02-10",
      },
    ]);
    await db.insert(professors).values([
      {
        academyId: academy.academy.id,
        firstName: "Ana",
        lastName: "Activa",
      },
      {
        academyId: academy.academy.id,
        active: false,
        firstName: "Bea",
        lastName: "Archivada",
      },
    ]);

    const cases = [
      { expected: ["Ana Activa"], search: "" },
      { expected: ["Bea Archivada"], search: "&estado=archivados" },
      { expected: ["Ana Activa", "Bea Archivada"], search: "&estado=todos" },
    ];

    for (const { expected, search } of cases) {
      const dancersData = await loadDancers({ search });
      const professorsData = await loadProfessors({ search });
      const dancerNames = dancersData.dancers.map(
        (dancer) => `${dancer.firstName} ${dancer.lastName}`,
      );
      const professorNames = professorsData.professors.map(
        (professor) => `${professor.firstName} ${professor.lastName}`,
      );

      expect(dancerNames.sort()).toEqual(expected);
      expect(professorNames.sort()).toEqual(expected);
      expect(dancersData.filters.status).toBe(professorsData.filters.status);
    }

    // An unknown value is a stale parameter like any other: both lists drop
    // it and redirect to their plain canonical URL, the same way.
    const dancersInvalid = await expectThrownResponse(
      loadDancers({ search: "&estado=activos" }),
      302,
    );
    const professorsInvalid = await expectThrownResponse(
      loadProfessors({ search: "&estado=activos" }),
      302,
    );

    expect(
      new URL(dancersInvalid.headers.get("Location") ?? "", "http://localhost")
        .search,
    ).toBe("");
    expect(
      new URL(
        professorsInvalid.headers.get("Location") ?? "",
        "http://localhost",
      ).search,
    ).toBe("");
  });

  test("keeps `Estado de alta` independent from `Participación` and from `Verificación`", async () => {
    const event = await createSavedEvent("Regional Ejes", {
      activate: true,
      dates: createEventFixtureDates(2026),
    });
    const academy = await createAcademyUser({
      academyName: "Academia Ejes",
      email: "academia.ejes@example.com",
    });
    const [archivedDancer] = await db
      .insert(dancers)
      .values({
        academyId: academy.academy.id,
        active: false,
        firstName: "Delia",
        lastName: "Archivada",
        birthDate: "2011-05-10",
        documentType: "dni",
        documentNumber: "9001",
        documentFrontImageStorageKey: "front-ejes",
        documentBackImageStorageKey: "back-ejes",
        identityVerifiedAt: new Date("2026-04-01T12:00:00Z"),
      })
      .returning();
    const [activeDancer] = await db
      .insert(dancers)
      .values({
        academyId: academy.academy.id,
        firstName: "Elsa",
        lastName: "Activa",
        birthDate: "2011-06-10",
      })
      .returning();

    await createEventChoreographyFixture({
      academyId: academy.academy.id,
      dancerIds: [archivedDancer.id],
      eventId: event.id,
      name: "Ejes",
    });

    async function listNames(search: string) {
      const data = await loadDancers({ search });

      return {
        data,
        ids: data.dancers.map((dancer) => dancer.id),
      };
    }

    // Archived, participating and verified: the three badges render together.
    // `identificacion` is left at its default (`all`, encoded by its
    // absence): writing `todos` explicitly would be the stale-parameter case
    // covered above, not this one.
    const everything = await listNames("&estado=todos");
    const markup = renderToStaticMarkup(
      renderInDataRouter(
        "/administracion/bailarines",
        createElement(DancersListRouteView, { loaderData: everything.data }),
      ),
    );

    expect(everything.ids.sort()).toEqual(
      [activeDancer.id, archivedDancer.id].sort(),
    );
    // The badges, not the filter options, which repeat the same words.
    expectBadge(markup, { label: "Archivado", variant: "destructive" });
    expectBadge(markup, { label: "Participando", variant: "success" });
    expectBadge(markup, { label: "Verificado", variant: "success" });

    // Filtering on one axis leaves the other two alone.
    expect((await listNames("&estado=archivados")).ids).toEqual([
      archivedDancer.id,
    ]);
    expect(
      (await listNames("&estado=todos&identificacion=verificados")).ids,
    ).toEqual([archivedDancer.id]);
    expect((await listNames("&estado=todos&participando=si")).ids).toEqual([
      archivedDancer.id,
    ]);
    expect((await listNames("")).ids).toEqual([activeDancer.id]);
  });
});
