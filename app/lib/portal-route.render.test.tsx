import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, test, vi } from "vitest";

vi.mock("@/lib/internal-access.server", () => ({
  requireAcademyUser: vi.fn(),
}));

import { PortalRouteView } from "@/routes/portal";
import { PortalBailarinesRouteView } from "@/routes/portal.bailarines";
import { PortalProfesoresRouteView } from "@/routes/portal.profesores";

describe("portal route view", () => {
  test("shows a clear no-event state while keeping academy areas available", () => {
    const markup = renderPortal({
      eventContext: {
        queryParamName: "evento",
        events: [],
        selectedEvent: null,
        hasEvents: false,
        isReadOnly: true,
        isRegistrationOpen: false,
      },
    });

    expect(markup).toContain("Todavía no hay Eventos configurados");
    expect(markup).toContain("Profesores");
    expect(markup).toContain('href="/portal/profesores"');
    expect(markup).toContain("Bailarines");
    expect(markup).toContain('href="/portal/bailarines"');
    expect(markup).toContain('href="/portal/coreografias"');
    expect(markup).toContain('aria-current="page"');
  });

  test("shows all-event selector data and read-only empty state for a non-active Evento", () => {
    const selectedEvent = eventSummary({
      id: "event_2025",
      name: "Regional 2025",
      active: false,
    });

    const markup = renderPortal({
      eventContext: {
        queryParamName: "evento",
        events: [
          eventSummary({ id: "event_2026", name: "Regional 2026" }),
          selectedEvent,
        ],
        selectedEvent,
        hasEvents: true,
        isReadOnly: true,
        isRegistrationOpen: false,
      },
    });

    expect(markup).toContain('name="evento"');
    expect(markup).toContain('value="event_2026"');
    expect(markup).toContain('value="event_2025" selected="">');
    expect(markup).toContain("Solo lectura");
    expect(markup).toContain(
      "No hay coreografías registradas para este evento",
    );
    expect(markup).toContain(
      "La creación de coreografías va a estar disponible solo cuando el Evento consultado sea el Evento activo y la inscripción esté abierta.",
    );
  });

  test("distinguishes an active Evento with open registration as editable", () => {
    const selectedEvent = eventSummary({
      id: "event_active",
      name: "Regional 2026",
      active: true,
      registrationStartsAt: date("2026-01-01T12:00:00Z"),
      registrationEndsAt: date("2026-12-31T12:00:00Z"),
    });

    const markup = renderPortal({
      eventContext: {
        queryParamName: "evento",
        events: [selectedEvent],
        selectedEvent,
        hasEvents: true,
        isReadOnly: false,
        isRegistrationOpen: true,
      },
    });

    expect(markup).toContain("Contexto editable");
    expect(markup).toContain(
      "La creación de coreografías va a estar disponible para este Evento mientras la inscripción esté abierta.",
    );
  });

  test("shows the Bailarines empty list surface", () => {
    const markup = renderBailarines();

    expect(markup).toContain("Bailarines");
    expect(markup).toContain("Cargar Bailarín");
    expect(markup).toContain("Todavía no cargaste bailarines");
    expect(markup).toContain(
      "Cuando cargues bailarines, van a aparecer en esta lista para usarlos en coreografías.",
    );
    expect(markup).toContain('href="/portal"');
    expect(markup).toContain('href="/portal/profesores"');
    expect(markup).toContain('href="/portal/coreografias"');
    expect(markup).toContain('aria-current="page"');
  });

  test("shows ordered Bailarines with date, document and incomplete verification state", () => {
    const markup = renderBailarines({
      dancers: [
        dancerListItem({
          firstName: "Ana",
          lastName: "Alvarez",
          birthDate: "2014-02-01",
        }),
        dancerListItem({
          firstName: "Juan Manuel",
          lastName: "Cruz de la Torre",
          birthDate: "2015-04-03",
        }),
      ],
    });

    expect(markup).toContain("Alvarez, Ana");
    expect(markup).toContain("01/02/2014");
    expect(markup).toContain("Cruz de la Torre, Juan Manuel");
    expect(markup).toContain("03/04/2015");
    expect(markup).toContain("Sin documento");
    expect(markup).toContain("Incompleto");
    expect(markup.indexOf("Alvarez, Ana")).toBeLessThan(
      markup.indexOf("Cruz de la Torre, Juan Manuel"),
    );
  });

  test("keeps the Bailarín modal open with errors and previous values", () => {
    const markup = renderBailarines({
      actionData: {
        status: "error",
        error: "Revisá los datos del Bailarín.",
        fieldErrors: {
          firstName: "Ingresá el nombre.",
          birthDate: "La fecha de nacimiento no puede ser futura.",
        },
        values: {
          firstName: "",
          lastName: "López",
          birthDate: "2999-01-01",
        },
      },
    });

    expect(markup).toContain('role="dialog"');
    expect(markup).toContain("Revisá los datos del Bailarín.");
    expect(markup).toContain("Ingresá el nombre.");
    expect(markup).toContain("La fecha de nacimiento no puede ser futura.");
    expect(markup).toContain('name="lastName" value="López"');
    expect(markup).toContain('name="birthDate" value="2999-01-01"');
  });

  test("shows a success banner after creating a Bailarín", () => {
    const markup = renderBailarines({ created: true });

    expect(markup).toContain("El Bailarín se creó correctamente.");
    expect(markup).not.toContain('role="dialog"');
  });

  test("shows the Profesores empty list surface", () => {
    const markup = renderProfesores();

    expect(markup).toContain("Profesores");
    expect(markup).toContain("Todavía no cargaste profesores");
    expect(markup).toContain(
      "Cuando cargues profesores, van a aparecer en esta lista para vincularlos a coreografías.",
    );
    expect(markup).toContain('href="/portal"');
    expect(markup).toContain('href="/portal/bailarines"');
    expect(markup).toContain('href="/portal/coreografias"');
    expect(markup).toContain('aria-current="page"');
  });

  test("keeps the Profesores modal open with field errors and previous values", () => {
    const markup = renderProfesores({
      actionData: {
        status: "error",
        message: "Revisá los campos marcados.",
        fieldErrors: {
          firstName: "Ingresá el nombre del Profesor.",
          lastName: "Ingresá el apellido del Profesor.",
        },
        values: {
          firstName: "",
          lastName: "  de la CRUZ ",
        },
        modalOpen: true,
      },
    });

    expect(markup).toContain('<dialog id="crear-profesor" open=""');
    expect(markup).toContain("Ingresá el nombre del Profesor.");
    expect(markup).toContain("Ingresá el apellido del Profesor.");
    expect(markup).toContain('value="  de la CRUZ "');
    expect(markup).toContain("Revisá los campos marcados.");
  });

  test("shows the Profesores success banner", () => {
    const markup = renderProfesores({
      loaderData: {
        ...academyLoaderData(),
        successMessage: "Profesor creado correctamente.",
      },
    });

    expect(markup).toContain("Profesor creado correctamente.");
    expect(markup).not.toContain('<dialog id="crear-profesor" open="">');
  });

  test("shows ordered Profesores with document and incomplete badge", () => {
    const markup = renderProfesores({
      loaderData: {
        ...academyLoaderData(),
        professors: [
          professorListItem({
            id: "prof_1",
            firstName: "José Luis",
            lastName: "de la Cruz",
          }),
          professorListItem({
            id: "prof_2",
            firstName: "Ana",
            lastName: "Zapata",
          }),
        ],
      },
    });

    expect(markup.indexOf("de la Cruz, José Luis")).toBeLessThan(
      markup.indexOf("Zapata, Ana"),
    );
    expect(markup).toContain('href="/portal/profesores/prof_1"');
    expect(markup).toContain("Sin documento");
    expect(markup).toContain("Incompleto");
  });
});

type PortalLoaderData = Parameters<typeof PortalRouteView>[0]["loaderData"];

function renderPortal(input: {
  eventContext: PortalLoaderData["eventContext"];
}) {
  const loaderData = {
    email: "portal@example.com",
    academy: {
      id: "academy_1",
      userId: "user_1",
      name: "Academia de Prueba",
      contactName: "Contacto",
      phone: "11 1234-5678",
    },
    eventContext: input.eventContext,
  } satisfies PortalLoaderData;

  return renderToStaticMarkup(
    <MemoryRouter initialEntries={["/portal"]}>
      <PortalRouteView loaderData={loaderData} />
    </MemoryRouter>,
  );
}

function renderBailarines(
  input: Partial<
    Pick<
      Parameters<typeof PortalBailarinesRouteView>[0],
      "actionData" | "created"
    >
  > & {
    dancers?: Parameters<
      typeof PortalBailarinesRouteView
    >[0]["loaderData"]["dancers"];
  } = {},
) {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={["/portal/bailarines"]}>
      <PortalBailarinesRouteView
        actionData={input.actionData}
        created={input.created}
        loaderData={academyLoaderData({ dancers: input.dancers ?? [] })}
      />
    </MemoryRouter>,
  );
}

type ProfesoresViewProps = Parameters<typeof PortalProfesoresRouteView>[0];

function renderProfesores(input: Partial<ProfesoresViewProps> = {}) {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={["/portal/profesores"]}>
      <PortalProfesoresRouteView
        loaderData={input.loaderData ?? academyLoaderData()}
        actionData={input.actionData}
      />
    </MemoryRouter>,
  );
}

function academyLoaderData({
  dancers = [],
  professors = [],
  successMessage = null,
}: {
  dancers?: Parameters<
    typeof PortalBailarinesRouteView
  >[0]["loaderData"]["dancers"];
  professors?: ProfesoresViewProps["loaderData"]["professors"];
  successMessage?: string | null;
} = {}) {
  return {
    email: "portal@example.com",
    academy: {
      id: "academy_1",
      userId: "user_1",
      name: "Academia de Prueba",
      contactName: "Contacto",
      phone: "11 1234-5678",
    },
    dancers,
    professors,
    successMessage,
  };
}

function dancerListItem(
  overrides: Partial<
    Parameters<
      typeof PortalBailarinesRouteView
    >[0]["loaderData"]["dancers"][number]
  > = {},
) {
  return {
    id: "dancer_1",
    firstName: "Bailarina",
    lastName: "Prueba",
    birthDate: "2015-01-01",
    documentType: null,
    documentNumber: null,
    verificationStatus: "incomplete" as const,
    ...overrides,
  };
}

function professorListItem(
  overrides: Partial<
    ProfesoresViewProps["loaderData"]["professors"][number]
  > = {},
) {
  return {
    id: "profesor_1",
    firstName: "Ana",
    lastName: "Zapata",
    documentType: null,
    documentNumber: null,
    isIncomplete: true,
    ...overrides,
  } satisfies ProfesoresViewProps["loaderData"]["professors"][number];
}

function eventSummary(
  overrides: Partial<
    NonNullable<PortalLoaderData["eventContext"]["selectedEvent"]>
  > = {},
) {
  return {
    id: "event_1",
    name: "Regional 2026",
    active: true,
    registrationStartsAt: date("2026-03-01T12:00:00Z"),
    registrationEndsAt: date("2026-04-30T12:00:00Z"),
    startsAt: date("2026-05-01T12:00:00Z"),
    endsAt: date("2026-05-03T12:00:00Z"),
    ...overrides,
  };
}

function date(value: string) {
  return new Date(value);
}
