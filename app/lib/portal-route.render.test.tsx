import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, test, vi } from "vitest";

vi.mock("@/lib/internal-access.server", () => ({
  requireAcademyUser: vi.fn(),
}));

import { PortalRouteView } from "@/routes/portal";
import { PortalBailarinDetalleRouteView } from "@/routes/portal.bailarines.$dancerId";
import { PortalBailarinesRouteView } from "@/routes/portal.bailarines";
import { PortalCoreografiaDetalleRouteView } from "@/routes/portal.coreografias.$choreographyId";
import { PortalCoreografiasRouteView } from "@/routes/portal.coreografias";
import { PortalProfesorRouteView } from "@/routes/portal.profesores.$professorId";
import { PortalProfesoresRouteView } from "@/routes/portal.profesores";

describe("portal route view", () => {
  test("shows a clear no-event state while keeping academy areas available", () => {
    const markup = renderPortal({
      eventContext: {
        queryParamName: "evento",
        events: [],
        selectedEvent: null,
        activeEvent: null,
        hasActiveEvent: false,
        activeEventRegistrationReadiness: null,
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
        activeEvent: eventSummary({ id: "event_2026", name: "Regional 2026" }),
        hasActiveEvent: true,
        activeEventRegistrationReadiness: readiness(true),
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
        activeEvent: selectedEvent,
        hasActiveEvent: true,
        activeEventRegistrationReadiness: readiness(true),
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

  test("shows a blocked message when there is no Evento activo available for registration", () => {
    const selectedEvent = eventSummary({
      id: "event_2025",
      name: "Regional 2025",
      active: false,
    });

    const markup = renderPortal({
      eventContext: {
        queryParamName: "evento",
        events: [selectedEvent],
        selectedEvent,
        activeEvent: null,
        hasActiveEvent: false,
        activeEventRegistrationReadiness: null,
        hasEvents: true,
        isReadOnly: true,
        isRegistrationOpen: false,
      },
    });

    expect(markup).toContain(
      "Todavía no hay un Evento activo para registrar coreografías.",
    );
  });

  test("shows a blocked message when the Evento activo lacks minimum configuration", () => {
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
        activeEvent: selectedEvent,
        hasActiveEvent: true,
        activeEventRegistrationReadiness: readiness(false, [
          {
            code: "price-coverage",
            label: "Precios aplicables",
            detail:
              "Falta un Precio aplicable para Categoría Juvenil, Modalidad Jazz, Tipo de grupo Solo.",
          },
        ]),
        hasEvents: true,
        isReadOnly: false,
        isRegistrationOpen: true,
      },
    });

    expect(markup).toContain(
      "El Evento activo todavía no tiene la configuración mínima para registrar coreografías.",
    );
    expect(markup).toContain("Falta un Precio aplicable");
  });

  test("shows the Coreografías list with the agreed columns and links to detail preserving the Evento consultado", () => {
    const selectedEvent = eventSummary({
      id: "event_2025",
      name: "Regional 2025",
      active: false,
    });

    const markup = renderCoreografias({
      loaderData: coreografiasLoaderData({
        choreographies: [
          choreographyListItem({
            id: "choreo_1",
            name: "Mi Pieza",
            submodalityName: "Lyrical",
            categoryName: "Juvenil",
            experienceLevelName: "Inicial",
            operationalStatus: {
              code: "incomplete",
              pendingItems: ["music"],
            },
          }),
        ],
        eventContext: {
          queryParamName: "evento",
          events: [selectedEvent],
          selectedEvent,
          activeEvent: eventSummary({
            id: "event_2026",
            name: "Regional 2026",
          }),
          hasActiveEvent: true,
          activeEventRegistrationReadiness: readiness(true),
          hasEvents: true,
          isReadOnly: true,
          isRegistrationOpen: false,
        },
      }),
    });

    expect(markup).toContain("Coreografía");
    expect(markup).toContain("Modalidad");
    expect(markup).toContain("Categoría");
    expect(markup).toContain("Estado operativo");
    expect(markup).toContain("Mi Pieza");
    expect(markup).toContain("Jazz · Lyrical");
    expect(markup).toContain("Juvenil · Inicial");
    expect(markup).toContain("Pendiente: Música");
    expect(markup).toContain(
      'href="/portal/coreografias/choreo_1?evento=event_2025"',
    );
  });

  test("disables Crear Coreografía with a clear message when there are no Bailarines activos", () => {
    const markup = renderCoreografias({
      loaderData: coreografiasLoaderData({
        activeDancers: [],
      }),
    });

    expect(markup).toContain("Crear Coreografía");
    expect(markup).toContain("disabled");
    expect(markup).toContain(
      "Necesitás al menos un Bailarín activo para registrar una Coreografía.",
    );
  });

  test("shows the enabled Crear Coreografía button for the active editable Evento", () => {
    const markup = renderCoreografias();

    expect(markup).toContain("Crear Coreografía");
    expect(markup).not.toContain("cursor-not-allowed");
    expect(markup).toContain(
      "La creación de coreografías va a estar disponible para este Evento mientras la inscripción esté abierta.",
    );
  });

  test("shows the Coreografía detail with structural read-only data, roster and archived badges", () => {
    const markup = renderCoreografiaDetalle({
      loaderData: coreografiaDetalleLoaderData({
        eventContext: {
          queryParamName: "evento",
          events: [eventSummary()],
          selectedEvent: eventSummary(),
          activeEvent: eventSummary(),
          hasActiveEvent: true,
          activeEventRegistrationReadiness: readiness(true),
          hasEvents: true,
          isReadOnly: true,
          isRegistrationOpen: false,
        },
        choreography: choreographyDetailRow({
          name: "Mi Pieza",
          categoryName: null,
          experienceLevelName: null,
          operationalStatus: {
            code: "incomplete",
            pendingItems: ["category", "professors"],
          },
          dancers: [
            {
              id: "dancer_1",
              firstName: "Ana",
              lastName: "Paz",
              active: false,
              ageAtEventStart: 14,
            },
          ],
          professors: [
            {
              id: "prof_1",
              firstName: "Luz",
              lastName: "Suárez",
              active: false,
            },
          ],
        }),
      }),
    });

    expect(markup).toContain("Mi Pieza");
    expect(markup).toContain("Solo lectura");
    expect(markup).toContain("Nombre");
    expect(markup).toContain("Modalidad");
    expect(markup).toContain("Tipo de grupo");
    expect(markup).toContain("Categoría pendiente");
    expect(markup).toContain("Pendiente: Categoría, Profesores");
    expect(markup).toContain("Pendientes operativos: Categoría, Profesores");
    expect(markup).toContain("Edad al inicio del Evento: 14");
    expect(markup).toContain("Archivado");
    expect(markup).toContain("Volver a Coreografías");
  });

  test("shows editable Profesores on active Coreografía detail and keeps archived linked options visible", () => {
    const markup = renderCoreografiaDetalle({
      loaderData: coreografiaDetalleLoaderData({
        availableProfessors: [
          {
            id: "prof_1",
            firstName: "Luz",
            lastName: "Activa",
            active: true,
          },
          {
            id: "prof_2",
            firstName: "Mora",
            lastName: "Archivada",
            active: false,
          },
        ],
        eventContext: {
          queryParamName: "evento",
          events: [eventSummary()],
          selectedEvent: eventSummary(),
          activeEvent: eventSummary(),
          hasActiveEvent: true,
          activeEventRegistrationReadiness: readiness(true),
          hasEvents: true,
          isReadOnly: false,
          isRegistrationOpen: false,
        },
        choreography: choreographyDetailRow({
          operationalStatus: {
            code: "complete",
            pendingItems: [],
          },
          professors: [
            {
              id: "prof_2",
              firstName: "Mora",
              lastName: "Archivada",
              active: false,
            },
          ],
        }),
        successMessage: "Profesores actualizados correctamente.",
      }),
    });

    expect(markup).toContain("Contexto editable");
    expect(markup).toContain("Editable");
    expect(markup).toContain("Profesores actualizados correctamente.");
    expect(markup).toContain("Guardar Profesores");
    expect(markup).toContain("Disponible para nuevas asignaciones.");
    expect(markup).toContain(
      "Archivado pero conservado por vínculo existente.",
    );
    expect(markup).toContain("Estado operativo al día.");
    expect(markup).toContain('value="update-choreography-professors"');
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
          id: "dancer_ana",
          firstName: "Ana",
          lastName: "Alvarez",
          birthDate: "2014-02-01",
        }),
        dancerListItem({
          id: "dancer_juan",
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
    expect(markup).toContain('href="/portal/bailarines/dancer_ana"');
    expect(markup).not.toContain("Archivar Bailarín");
    expect(markup).not.toContain("Reactivar Bailarín");
    expect(markup.indexOf("Alvarez, Ana")).toBeLessThan(
      markup.indexOf("Cruz de la Torre, Juan Manuel"),
    );
  });

  test("shows the Archivados tab for Bailarines and keeps archive actions out of the list", () => {
    const markup = renderBailarines({
      loaderData: academyLoaderData({
        dancers: [
          dancerListItem({
            id: "dancer_archived",
            firstName: "Ana",
            lastName: "Archivada",
            active: false,
          }),
        ],
        statusFilter: "archived",
      }),
    });

    expect(markup).toContain(">Activos<");
    expect(markup).toContain(">Archivados<");
    expect(markup).toContain("Archivado");
    expect(markup).not.toContain("Cargar Bailarín");
    expect(markup).not.toContain("Archivar Bailarín");
    expect(markup).not.toContain("Reactivar Bailarín");
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

  test("shows the Bailarín edit alert, fields and success banner", () => {
    const markup = renderBailarinDetalle({
      loaderData: {
        ...academyLoaderData(),
        dancer: dancerDetailRow({
          id: "dancer_edit_1",
          firstName: "Ana",
          lastName: "Alvarez",
          birthDate: "2014-02-01",
        }),
        saved: true,
      },
    });

    expect(markup).toContain(
      "Faltan datos para poder validar la identificación.",
    );
    expect(markup).toContain("Nombre");
    expect(markup).toContain("Apellido");
    expect(markup).toContain("Fecha de nacimiento");
    expect(markup).toContain("Tipo de documento");
    expect(markup).toContain("Número de documento");
    expect(markup).toContain("DNI");
    expect(markup).toContain("Pasaporte");
    expect(markup).toContain("Otro");
    expect(markup).toContain("El Bailarín se guardó correctamente.");
  });

  test("shows the Bailarín archived badge and reactivate action by direct URL", () => {
    const markup = renderBailarinDetalle({
      loaderData: {
        ...academyLoaderData(),
        dancer: dancerDetailRow({
          id: "dancer_archived",
          firstName: "Ana",
          lastName: "Archivada",
          active: false,
        }),
        saved: false,
      },
    });

    expect(markup).toContain("Archivado");
    expect(markup).toContain("Reactivar Bailarín");
    expect(markup).not.toContain("Archivar Bailarín");
  });

  test("shows Bailarín edit field errors while preserving submitted values", () => {
    const markup = renderBailarinDetalle({
      actionData: {
        ok: false,
        error: "Revisá los datos del Bailarín.",
        fieldErrors: {
          documentType: "Seleccioná el tipo de documento.",
          documentNumber: "Ingresá el número de documento.",
        },
        values: {
          firstName: "Ana",
          lastName: "Alvarez",
          birthDate: "2014-02-01",
          documentType: "",
          documentNumber: "",
        },
      },
    });

    expect(markup).toContain("Revisá los datos del Bailarín.");
    expect(markup).toContain("Seleccioná el tipo de documento.");
    expect(markup).toContain("Ingresá el número de documento.");
    expect(markup).toContain('name="firstName" value="Ana"');
    expect(markup).toContain('name="birthDate" value="2014-02-01"');
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
    expect(markup).not.toContain("Archivar Profesor");
    expect(markup).not.toContain("Reactivar Profesor");
  });

  test("shows the Archivados tab for Profesores and keeps archive actions out of the list", () => {
    const markup = renderProfesores({
      loaderData: {
        ...academyLoaderData({
          professors: [
            professorListItem({
              id: "prof_archived",
              firstName: "Ana",
              lastName: "Archivada",
              active: false,
            }),
          ],
        }),
        statusFilter: "archived",
      },
    });

    expect(markup).toContain(">Activos<");
    expect(markup).toContain(">Archivados<");
    expect(markup).toContain("Archivado");
    expect(markup).not.toContain("Archivar Profesor");
    expect(markup).not.toContain("Reactivar Profesor");
  });
});

describe("portal Profesor edit view", () => {
  test("shows an info alert when identification is incomplete", () => {
    const markup = renderProfesorEdit();

    expect(markup).toContain(
      "Faltan datos para poder validar la identificación.",
    );
    expect(markup).toContain("Tipo de documento");
    expect(markup).toContain("Número de documento");
    expect(markup).toContain('option value="dni"');
    expect(markup).toContain(">Pasaporte<");
    expect(markup).toContain(">Otro<");
  });

  test("shows field errors and preserves submitted values", () => {
    const markup = renderProfesorEdit({
      actionData: {
        status: "error",
        message: "Revisá los campos marcados.",
        fieldErrors: {
          documentType: "Seleccioná el tipo de documento.",
          documentNumber: "Ingresá el número de documento.",
        },
        values: {
          firstName: "Ana",
          lastName: "Perez",
          documentType: "",
          documentNumber: "1234",
        },
      },
    });

    expect(markup).toContain("Revisá los campos marcados.");
    expect(markup).toContain("Seleccioná el tipo de documento.");
    expect(markup).toContain("Ingresá el número de documento.");
    expect(markup).toContain('value="1234"');
    expect(markup).toContain('value="" selected="">Sin documento</option>');
  });

  test("shows the success banner after saving", () => {
    const markup = renderProfesorEdit({
      loaderData: {
        ...academyLoaderData(),
        professor: professorListItem({
          documentType: "dni",
          documentNumber: "12345678",
          isIncomplete: false,
        }),
        successMessage: "Profesor actualizado correctamente.",
      },
    });

    expect(markup).toContain("Profesor actualizado correctamente.");
    expect(markup).not.toContain(
      "Faltan datos para poder validar la identificación.",
    );
  });

  test("shows the archived badge and reactivate action for Profesores by direct URL", () => {
    const markup = renderProfesorEdit({
      loaderData: {
        ...academyLoaderData(),
        professor: professorListItem({
          active: false,
          isIncomplete: false,
        }),
        successMessage: null,
      },
    });

    expect(markup).toContain("Archivado");
    expect(markup).toContain("Reactivar Profesor");
    expect(markup).not.toContain("Archivar Profesor");
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
  input: Partial<Parameters<typeof PortalBailarinesRouteView>[0]> & {
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
        loaderData={
          input.loaderData ??
          academyLoaderData({
            dancers: input.dancers ?? [],
            statusFilter: "active",
          })
        }
      />
    </MemoryRouter>,
  );
}

type BailarinDetalleViewProps = Parameters<
  typeof PortalBailarinDetalleRouteView
>[0];

function renderBailarinDetalle(input: Partial<BailarinDetalleViewProps>) {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={["/portal/bailarines/dancer_edit_1"]}>
      <PortalBailarinDetalleRouteView
        loaderData={input.loaderData ?? bailarinDetalleLoaderData()}
        actionData={input.actionData}
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

type CoreografiasViewProps = Parameters<typeof PortalCoreografiasRouteView>[0];

function renderCoreografias(input: Partial<CoreografiasViewProps> = {}) {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={["/portal/coreografias"]}>
      <PortalCoreografiasRouteView
        loaderData={input.loaderData ?? coreografiasLoaderData()}
      />
    </MemoryRouter>,
  );
}

type CoreografiaDetalleViewProps = Parameters<
  typeof PortalCoreografiaDetalleRouteView
>[0];

function renderCoreografiaDetalle(
  input: Partial<CoreografiaDetalleViewProps> = {},
) {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={["/portal/coreografias/choreo_1"]}>
      <PortalCoreografiaDetalleRouteView
        loaderData={input.loaderData ?? coreografiaDetalleLoaderData()}
      />
    </MemoryRouter>,
  );
}

type ProfesorEditViewProps = Parameters<typeof PortalProfesorRouteView>[0];

function renderProfesorEdit(input: Partial<ProfesorEditViewProps> = {}) {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={["/portal/profesores/profesor_1"]}>
      <PortalProfesorRouteView
        loaderData={{
          ...academyLoaderData(),
          professor: {
            ...professorListItem(),
            isIncomplete: true,
          },
          successMessage: null,
          ...input.loaderData,
        }}
        actionData={input.actionData}
      />
    </MemoryRouter>,
  );
}

function academyLoaderData({
  dancers = [],
  professors = [],
  statusFilter = "active",
  successMessage = null,
}: {
  dancers?: Parameters<
    typeof PortalBailarinesRouteView
  >[0]["loaderData"]["dancers"];
  professors?: ProfesoresViewProps["loaderData"]["professors"];
  statusFilter?: "active" | "archived";
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
    statusFilter,
    successMessage,
  };
}

function coreografiasLoaderData({
  choreographies = [],
  activeDancers = [dancerListItem()],
  activeProfessors = [professorListItem()],
  registrationCatalogs = {
    modalities: [{ id: "modality_1", name: "Jazz" }],
    submodalities: [
      { id: "submodality_1", name: "Lyrical", modalityId: "modality_1" },
    ],
  },
  eventContext = {
    queryParamName: "evento",
    events: [eventSummary()],
    selectedEvent: eventSummary(),
    activeEvent: eventSummary(),
    hasActiveEvent: true,
    activeEventRegistrationReadiness: readiness(true),
    hasEvents: true,
    isReadOnly: false,
    isRegistrationOpen: true,
  },
}: {
  choreographies?: Parameters<
    typeof PortalCoreografiasRouteView
  >[0]["loaderData"]["choreographies"];
  activeDancers?: Parameters<
    typeof PortalCoreografiasRouteView
  >[0]["loaderData"]["activeDancers"];
  activeProfessors?: Parameters<
    typeof PortalCoreografiasRouteView
  >[0]["loaderData"]["activeProfessors"];
  registrationCatalogs?: Parameters<
    typeof PortalCoreografiasRouteView
  >[0]["loaderData"]["registrationCatalogs"];
  eventContext?: Parameters<
    typeof PortalCoreografiasRouteView
  >[0]["loaderData"]["eventContext"];
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
    choreographies,
    activeDancers,
    activeProfessors,
    registrationCatalogs,
    eventContext,
  };
}

function coreografiaDetalleLoaderData(
  overrides: Partial<CoreografiaDetalleViewProps["loaderData"]> = {},
) {
  return {
    ...coreografiasLoaderData(),
    availableProfessors: [],
    choreography: choreographyDetailRow(),
    successMessage: null,
    ...overrides,
  };
}

function bailarinDetalleLoaderData() {
  return {
    ...academyLoaderData(),
    dancer: dancerDetailRow(),
    saved: false,
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
    active: true,
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
    active: true,
    documentType: null,
    documentNumber: null,
    isIncomplete: true,
    ...overrides,
  } satisfies ProfesoresViewProps["loaderData"]["professors"][number];
}

function choreographyListItem(
  overrides: Partial<
    CoreografiasViewProps["loaderData"]["choreographies"][number]
  > = {},
) {
  return {
    id: "choreo_1",
    name: "Coreografía",
    modalityName: "Jazz",
    submodalityName: null,
    groupType: "solo" as const,
    categoryName: "Juvenil",
    experienceLevelName: "Inicial",
    operationalStatus: {
      code: "complete" as const,
      pendingItems: [],
    },
    ...overrides,
  };
}

function choreographyDetailRow(
  overrides: Partial<
    CoreografiaDetalleViewProps["loaderData"]["choreography"]
  > = {},
) {
  return {
    ...choreographyListItem(),
    scheduleBlockName: "Bloque mañana",
    scheduleLabel: "2026-05-01 · 10:00",
    dancers: [
      {
        id: "dancer_1",
        firstName: "Ana",
        lastName: "Paz",
        active: true,
        ageAtEventStart: 14,
      },
    ],
    professors: [],
    ...overrides,
  };
}

function dancerDetailRow(
  overrides: Partial<BailarinDetalleViewProps["loaderData"]["dancer"]> = {},
) {
  return {
    id: "dancer_1",
    academyId: "academy_1",
    firstName: "Bailarina",
    lastName: "Prueba",
    birthDate: "2015-01-01",
    active: true,
    documentType: null,
    documentNumber: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  } satisfies BailarinDetalleViewProps["loaderData"]["dancer"];
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

function readiness(
  isReady: boolean,
  missingItems: PortalLoaderData["eventContext"]["activeEventRegistrationReadiness"] extends infer T
    ? T extends { missingItems: infer M }
      ? M
      : never
    : never = [],
) {
  return {
    eventId: "event_1",
    isReady,
    missingItems,
  };
}
