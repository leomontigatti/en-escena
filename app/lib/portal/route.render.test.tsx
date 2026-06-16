import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, test, vi } from "vitest";

vi.mock("@/lib/auth/internal-access.server", () => ({
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
  test("renders the portal shell and dashboard summary cards", () => {
    const markup = renderPortal({
      eventContext: {
        events: [eventSummary({ name: "Regional 2026" })],
        selectedEvent: eventSummary({ name: "Regional 2026" }),
        activeEvent: eventSummary({ name: "Regional 2026" }),
        hasActiveEvent: true,
        activeEventRegistrationReadiness: readiness(true),
        hasEvents: true,
        isReadOnly: false,
        isRegistrationOpen: true,
      },
      summary: {
        professors: { activeCount: 4, incompleteCount: 1 },
        dancers: { activeCount: 7, incompleteCount: 3 },
        choreographies: { registeredCount: 5, incompleteCount: 2 },
      },
    });

    expect(markup).toContain("Regional 2026");
    expect(markup).toContain("Portal de academias");
    expect(markup).toContain("Inicio");
    expect(markup).toContain("Profesores");
    expect(markup).toContain("Bailarines");
    expect(markup).toContain("Coreografías");
    expect(markup.indexOf("Inicio")).toBeLessThan(markup.indexOf("Profesores"));
    expect(markup.indexOf("Profesores")).toBeLessThan(
      markup.indexOf("Bailarines"),
    );
    expect(markup.indexOf("Bailarines")).toBeLessThan(
      markup.indexOf("Coreografías"),
    );
    expect(markup).toContain("Saltar al contenido principal");
    expect(markup).toContain("Inicio");
    expect(markup).toContain("Revisá el estado de los datos de tu academia.");
    expect(markup).toContain("Activos");
    expect(markup).toContain("4");
    expect(markup).toContain("Incompletos");
    expect(markup).toContain("1");
    expect(markup).toContain("Ver profesores");
    expect(markup).toContain("7");
    expect(markup).toContain("3");
    expect(markup).toContain("Ver bailarines");
    expect(markup).toContain("Registradas");
    expect(markup).toContain("5");
    expect(markup).toContain("2");
    expect(markup).toContain("Ver coreografías");
    expect(markup).toContain("Portal User");
    expect(markup).toContain("Academia de Prueba");
    expect(markup).not.toContain("Contacto");
    expect(markup).not.toContain("Teléfono");
  });

  test("shows a no-active-event dashboard state for the shell and choreographies card", () => {
    const markup = renderPortal({
      eventContext: {
        events: [],
        selectedEvent: null,
        activeEvent: null,
        hasActiveEvent: false,
        activeEventRegistrationReadiness: null,
        hasEvents: false,
        isReadOnly: true,
        isRegistrationOpen: false,
      },
      summary: {
        professors: { activeCount: 0, incompleteCount: 0 },
        dancers: { activeCount: 0, incompleteCount: 0 },
        choreographies: null,
      },
    });

    expect(markup).toContain("Sin evento");
    expect(markup).toContain("Sin evento activo");
    expect(markup).toContain("Ver coreografías");
  });

  test("keeps the dashboard focused on summary cards even when the active event is not ready", () => {
    const selectedEvent = eventSummary({
      id: "event_active",
      name: "Regional 2026",
      active: true,
      registrationStartsAt: date("2026-01-01T12:00:00Z"),
      registrationEndsAt: date("2026-12-31T12:00:00Z"),
    });

    const markup = renderPortal({
      eventContext: {
        events: [selectedEvent],
        selectedEvent,
        activeEvent: selectedEvent,
        hasActiveEvent: true,
        activeEventRegistrationReadiness: readiness(false, [
          {
            code: "price-coverage",
            label: "Precios aplicables",
            detail:
              "Falta un precio aplicable para categoría Juvenil, Modalidad Jazz, tipo de grupo Solo.",
          },
        ]),
        hasEvents: true,
        isReadOnly: false,
        isRegistrationOpen: true,
      },
      summary: {
        professors: { activeCount: 2, incompleteCount: 1 },
        dancers: { activeCount: 3, incompleteCount: 3 },
        choreographies: { registeredCount: 0, incompleteCount: 0 },
      },
    });

    expect(markup).toContain("Coreografías");
    expect(markup).toContain("Registradas");
    expect(markup).toContain("Ver coreografías");
    expect(markup).not.toContain("Precios aplicables");
  });

  test("shows the coreografías list with the agreed columns for the active event", () => {
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
          events: [selectedEvent],
          selectedEvent,
          activeEvent: selectedEvent,
          hasActiveEvent: true,
          activeEventRegistrationReadiness: readiness(true),
          hasEvents: true,
          isReadOnly: false,
          isRegistrationOpen: false,
        },
      }),
    });

    for (const columnLabel of [
      "Nombre",
      "Modalidad / Submodalidad",
      "Categoría / Nivel",
      "Estado operativo",
    ]) {
      expect(markup).toContain(columnLabel);
    }

    expect(markup).not.toContain("Evento consultado");
    expect(markup).toContain("Mi Pieza");
    expect(markup).toContain("Jazz · Lyrical");
    expect(markup).toContain("Juvenil · Inicial");
    expect(markup).toContain("Pendiente: Música");
    expect(markup).toContain("Crear Coreografía");
    expect(markup).toContain("disabled");
    expect(markup).toContain(
      "La inscripción del Evento activo está cerrada y no admite nuevas coreografías.",
    );
    expect(markup).toContain('href="/portal/coreografias/choreo_1"');
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

  test("shows the delete success notice on the Coreografías list", () => {
    const markup = renderCoreografias({
      deleted: true,
    });

    expect(markup).toContain("La Coreografía se eliminó correctamente.");
  });

  test("shows the Coreografía detail with structural read-only data, roster and archived badges", () => {
    const markup = renderCoreografiaDetalle({
      loaderData: coreografiaDetalleLoaderData({
        deletionAvailability: {
          canDelete: false,
          warningMessage: null,
        },
        eventContext: {
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
    expect(markup).toContain("Evento activo");
    expect(markup).toContain("Nombre");
    expect(markup).toContain("Modalidad");
    expect(markup).toContain("Tipo de grupo");
    expect(markup).toContain("Categoría pendiente");
    expect(markup).toContain("Pendiente: Categoría, Profesores");
    expect(markup).toContain("Pendientes operativos: Categoría, Profesores");
    expect(markup).toContain("Edad al inicio del Evento: 14");
    expect(markup).toContain("Archivado");
    expect(markup).toContain("Volver a Coreografías");
    expect(markup).not.toContain("Eliminar Coreografía");
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

    expect(markup).toContain("Evento activo");
    expect(markup).toContain("Editable");
    expect(markup).toContain("Profesores actualizados correctamente.");
    expect(markup).toContain("Guardar Profesores");
    expect(markup).toContain("Disponible para nuevas asignaciones.");
    expect(markup).toContain(
      "Archivado pero conservado por vínculo existente.",
    );
    expect(markup).toContain("Estado operativo al día.");
    expect(markup).toContain('value="update-choreography-professors"');
    expect(markup).toContain("Eliminar Coreografía");
    expect(markup).toContain(
      "En esta versión la eliminación es definitiva y libera el cupo del Cronograma.",
    );
  });

  test("shows the delete warning on editable detail when registration is closed", () => {
    const markup = renderCoreografiaDetalle({
      loaderData: coreografiaDetalleLoaderData({
        deletionAvailability: {
          canDelete: true,
          warningMessage:
            "Si eliminás esta Coreografía con la inscripción cerrada, quizá no puedas registrarla nuevamente salvo ajuste administrativo.",
        },
        eventContext: {
          events: [eventSummary()],
          selectedEvent: eventSummary(),
          activeEvent: eventSummary(),
          hasActiveEvent: true,
          activeEventRegistrationReadiness: readiness(true),
          hasEvents: true,
          isReadOnly: false,
          isRegistrationOpen: false,
        },
      }),
    });

    expect(markup).toContain("Eliminar Coreografía");
    expect(markup).toContain(
      "Si eliminás esta Coreografía con la inscripción cerrada, quizá no puedas registrarla nuevamente salvo ajuste administrativo.",
    );
    expect(markup).toContain('value="delete-choreography"');
  });

  test("shows the Bailarines empty list surface", () => {
    const markup = renderBailarines();

    expect(markup).toContain("Bailarines");
    expect(markup).toContain("Nuevo bailarín");
    expect(markup).toContain("Todavía no cargaste bailarines");
    expect(markup).toContain(
      "Cuando cargues bailarines, van a aparecer en esta lista para usarlos en coreografías.",
    );
    expect(markup).toContain('href="/portal"');
    expect(markup).toContain('href="/portal/profesores"');
    expect(markup).toContain('href="/portal/coreografias"');
    expect(markup).toContain('aria-current="page"');
  });

  test("renders the redesigned Bailarines table with filters and action", () => {
    const markup = renderBailarines({
      loaderData: academyLoaderData({
        dancers: [
          dancerListItem({
            id: "dancer_complete",
            firstName: "Ana",
            lastName: "Completa",
            birthDate: "2014-02-01",
            documentType: "dni",
            documentNumber: "12345678",
            verificationStatus: "missingImages",
          }),
          dancerListItem({
            id: "dancer_archived",
            firstName: "José Luis",
            lastName: "de la Cruz",
            active: false,
          }),
        ],
      }),
    });

    expect(markup).toContain("Bailarines");
    expect(markup).toContain(
      "Buscar bailarín por nombre o número de documento",
    );
    expect(markup).toContain("Nuevo bailarín");
    expect(markup).toContain("Filtros");
    expect(markup).toContain("1 de 2 registros");
    expect(markup).toContain("DNI 12345678");
    expect(markup).toContain("Faltan imágenes");
    expect(markup).toContain('href="/portal/bailarines/dancer_complete"');
    expect(markup).not.toContain('href="/portal/bailarines/dancer_archived"');
    expect(markup).not.toContain("Cargar Bailarín");
  });

  test("shows ordered Bailarines with date, document and state badges", () => {
    const markup = renderBailarines({
      loaderData: academyLoaderData({
        dancers: [
          dancerListItem({
            id: "dancer_ana",
            firstName: "Ana",
            lastName: "Alvarez",
            birthDate: "2014-02-01",
            documentType: "dni",
            documentNumber: "12345678",
            verificationStatus: "missingImages",
          }),
          dancerListItem({
            id: "dancer_juan",
            firstName: "Juan Manuel",
            lastName: "Cruz de la Torre",
            birthDate: "2015-04-03",
          }),
        ],
      }),
    });

    expect(markup).toContain("Alvarez, Ana");
    expect(markup).toContain("01/02/2014");
    expect(markup).toContain("Cruz de la Torre, Juan Manuel");
    expect(markup).toContain("03/04/2015");
    expect(markup).toContain("DNI 12345678");
    expect(markup).toContain("Sin documento");
    expect(markup).toContain("Faltan imágenes");
    expect(markup).toContain("Incompleto");
    expect(markup).toContain('href="/portal/bailarines/dancer_ana"');
    expect(markup.indexOf("Alvarez, Ana")).toBeLessThan(
      markup.indexOf("Cruz de la Torre, Juan Manuel"),
    );
  });

  test("hides archived Bailarines by default while keeping the shared filters visible", () => {
    const markup = renderBailarines({
      loaderData: academyLoaderData({
        dancers: [
          dancerListItem({
            id: "dancer_archived",
            firstName: "Ana",
            lastName: "Archivada",
            active: false,
          }),
          dancerListItem({
            id: "dancer_active",
            firstName: "Beto",
            lastName: "Activo",
            active: true,
          }),
        ],
      }),
    });

    expect(markup).toContain("Filtros");
    expect(markup).toContain("1 de 2 registros");
    expect(markup).toContain('href="/portal/bailarines/dancer_active"');
    expect(markup).not.toContain('href="/portal/bailarines/dancer_archived"');
  });

  test("keeps the Bailarines screen stable when create returns field errors", () => {
    const markup = renderBailarines({
      actionData: {
        status: "error",
        fieldErrors: {
          firstName: "Este campo es obligatorio.",
          birthDate: "La fecha de nacimiento no puede ser futura.",
        },
        values: {
          firstName: "",
          lastName: "López",
          birthDate: "2999-01-01",
        },
        modalOpen: true,
      },
    });

    expect(markup).toContain("Bailarines");
    expect(markup).toContain("Nuevo bailarín");
    expect(markup).not.toContain("Bailarín creado.");
  });

  test("renders the redesigned bailarín editable ficha", () => {
    const markup = renderBailarinDetalle({
      loaderData: {
        ...academyLoaderData(),
        dancer: dancerDetailRow({
          id: "dancer_edit_1",
          firstName: "Ana",
          lastName: "Alvarez",
          birthDate: "2014-02-01",
          active: false,
        }),
      },
    });

    expect(markup).toContain("Editar bailarín");
    expect(markup).not.toContain("Editar Bailarín");
    expect(markup).toContain("Inicio");
    expect(markup).toContain("Bailarines");
    expect(markup).toContain("Alvarez, Ana");
    expect(markup).toContain("Acciones");
    expect(markup).toContain("Este bailarín está archivado");
    expect(markup).toContain("Reactivar");
    expect(markup).toContain(
      "Faltan datos de identificación para completar la verificación.",
    );
    expect(markup).toContain("Nombre");
    expect(markup).toContain("Apellido");
    expect(markup).toContain("Fecha de nacimiento");
    expect(markup).toContain("Tipo de documento");
    expect(markup).toContain("Número de documento");
    expect(markup).toContain('name="documentType" value=""');
    expect(markup).toContain("Volver");
    expect(markup).toContain("Guardar");
    expect(markup).toContain('form="portal-bailarin-form"');
    expect(markup).toContain('href="/portal/bailarines"');
    expect(markup).not.toContain("Archivado");
    expect(markup).not.toContain("Activo");
  });

  test("shows missing images alert when document data is complete", () => {
    const markup = renderBailarinDetalle({
      loaderData: {
        ...academyLoaderData(),
        dancer: dancerDetailRow({
          documentType: "dni",
          documentNumber: "12345678",
        }),
      },
    });

    expect(markup).toContain("Faltan imágenes");
    expect(markup).not.toContain(
      "Faltan datos de identificación para completar la verificación.",
    );
  });

  test("shows field errors and preserves submitted values", () => {
    const markup = renderBailarinDetalle({
      actionData: {
        status: "error",
        message: "Revisá los campos marcados.",
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

    expect(markup).toContain("Seleccioná el tipo de documento.");
    expect(markup).toContain("Ingresá el número de documento.");
    expect(markup).toContain('name="firstName" value="Ana"');
    expect(markup).toContain('name="birthDate" value="2014-02-01"');
  });

  test("shows the same reactivation confirmation from the alert shortcut and actions menu", () => {
    const markup = renderBailarinDetalle({
      loaderData: {
        ...academyLoaderData(),
        dancer: dancerDetailRow({
          active: false,
        }),
      },
      initialStatusDialogIntent: "reactivate-dancer",
    });

    expect(markup).toContain("Acciones");
    expect(markup).toContain("¿Reactivar bailarín?");
    expect(markup).toContain(
      "El bailarín volverá a aparecer en listas activas y en próximas selecciones de coreografías. Sus coreografías existentes no se modifican.",
    );
  });

  test("shows the Profesores empty list surface", () => {
    const markup = renderProfesores();

    expect(markup).toContain("Profesores");
    expect(markup).toContain("Todavía no cargaste profesores");
    expect(markup).toContain(
      "Sumá el plantel docente de tu academia para empezar a vincularlo en las coreografías.",
    );
    expect(markup).toContain('href="/portal"');
    expect(markup).toContain('href="/portal/bailarines"');
    expect(markup).toContain('href="/portal/coreografias"');
    expect(markup).toContain('aria-current="page"');
  });

  test("keeps the Profesores screen stable when create returns field errors", () => {
    const markup = renderProfesores({
      actionData: {
        status: "error",
        fieldErrors: {
          firstName: "Este campo es obligatorio.",
          lastName: "Este campo es obligatorio.",
        },
        values: {
          firstName: "",
          lastName: "  de la CRUZ ",
        },
        modalOpen: true,
      },
    });

    expect(markup).toContain("Profesores");
    expect(markup).toContain("Nuevo profesor");
    expect(markup).not.toContain("Profesor creado.");
  });

  test("renders the redesigned Profesores table with filters and action", () => {
    const markup = renderProfesores({
      loaderData: {
        ...academyLoaderData(),
        professors: [
          professorListItem({
            id: "prof_complete",
            firstName: "Ana",
            lastName: "Completa",
            documentType: "dni",
            documentNumber: "12345678",
            isIncomplete: false,
          }),
          professorListItem({
            id: "prof_archived",
            firstName: "José Luis",
            lastName: "de la Cruz",
            active: false,
          }),
        ],
      },
    });

    expect(markup).toContain("Profesores");
    expect(markup).toContain(
      "Buscar profesor por nombre o número de documento",
    );
    expect(markup).toContain("Nuevo profesor");
    expect(markup).toContain("Filtro");
    expect(markup).toContain("1 de 2 registros");
    expect(markup).toContain("DNI 12345678");
    expect(markup).toContain("Completo");
    expect(markup).toContain('href="/portal/profesores/prof_complete"');
    expect(markup).not.toContain('href="/portal/profesores/prof_archived"');
    expect(markup).not.toContain("Archivar Profesor");
    expect(markup).not.toContain("Reactivar Profesor");
  });
});

describe("portal Profesor edit view", () => {
  test("renders the redesigned profesor editable ficha", () => {
    const markup = renderProfesorEdit({
      loaderData: {
        ...academyLoaderData(),
        professor: professorListItem({
          id: "profesor_1",
          firstName: "Ana",
          lastName: "Perez",
          active: false,
          isIncomplete: true,
        }),
      },
    });

    expect(markup).toContain("Editar profesor");
    expect(markup).not.toContain("Editar Profesor");
    expect(markup).toContain("Inicio");
    expect(markup).toContain("Profesores");
    expect(markup).toContain("Perez, Ana");
    expect(markup).toContain("Acciones");
    expect(markup).toContain("Este profesor está archivado");
    expect(markup).toContain("Reactivar");
    expect(markup).toContain("Faltan datos de identificación.");
    expect(markup).not.toContain("validar la identificación");
    expect(markup).toContain("Nombre");
    expect(markup).toContain("Apellido");
    expect(markup).toContain("Tipo de documento");
    expect(markup).toContain("Número de documento");
    expect(markup).toContain('name="documentType" value=""');
    expect(markup).toContain("Volver");
    expect(markup).toContain("Guardar");
    expect(markup).toContain('form="portal-profesor-form"');
    expect(markup).toContain('href="/portal/profesores"');
    expect(markup).not.toContain("Archivado");
    expect(markup).not.toContain("Activo");
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

    expect(markup).toContain("Seleccioná el tipo de documento.");
    expect(markup).toContain("Ingresá el número de documento.");
    expect(markup).toContain('name="documentNumber" value="1234"');
    expect(markup).toContain('name="documentType" value=""');
  });

  test("shows the route notification target state after saving", () => {
    const markup = renderProfesorEdit({
      loaderData: {
        ...academyLoaderData(),
        professor: professorListItem({
          documentType: "dni",
          documentNumber: "12345678",
          isIncomplete: false,
        }),
      },
    });

    expect(markup).toContain("Editar profesor");
    expect(markup).not.toContain("Faltan datos de identificación.");
  });

  test("shows archived alerts and reactivate action for Profesores by direct URL", () => {
    const markup = renderProfesorEdit({
      loaderData: {
        ...academyLoaderData(),
        professor: professorListItem({
          active: false,
          isIncomplete: false,
        }),
      },
    });

    expect(markup).toContain("Este profesor está archivado");
    expect(markup).toContain("Reactivar");
    expect(markup).toContain('href="/portal/profesores"');
    expect(markup).toContain("Volver");
    expect(markup).not.toContain("Archivar Profesor");
  });

  test("shows the same reactivation confirmation from the alert shortcut and actions menu", () => {
    const markup = renderProfesorEdit({
      loaderData: {
        ...academyLoaderData(),
        professor: professorListItem({
          active: false,
        }),
      },
      initialStatusDialogIntent: "reactivate-professor",
    });

    expect(markup).toContain("Acciones");
    expect(markup).toContain("¿Reactivar profesor?");
    expect(markup).toContain(
      "El profesor volverá a aparecer en listas activas y en próximas selecciones de coreografías. Sus coreografías existentes no se modifican.",
    );
  });
});

type PortalLoaderData = Parameters<typeof PortalRouteView>[0]["loaderData"];

function renderPortal(input: {
  eventContext: PortalLoaderData["eventContext"];
  summary?: PortalLoaderData["dashboardSummary"];
}) {
  const loaderData = {
    email: "portal@example.com",
    userName: "Portal User",
    academy: {
      id: "academy_1",
      userId: "user_1",
      name: "Academia de Prueba",
      contactName: "Contacto",
      phone: "11 1234-5678",
    },
    eventContext: input.eventContext,
    dashboardSummary: input.summary ?? {
      professors: { activeCount: 0, incompleteCount: 0 },
      dancers: { activeCount: 0, incompleteCount: 0 },
      choreographies: null,
    },
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
        initialStatusDialogIntent={input.initialStatusDialogIntent}
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
        created={input.created}
        deleted={input.deleted}
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
        actionData={input.actionData}
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
          ...input.loaderData,
        }}
        actionData={input.actionData}
        initialStatusDialogIntent={input.initialStatusDialogIntent}
      />
    </MemoryRouter>,
  );
}

function academyLoaderData({
  dancers = [],
  professors = [],
  statusFilter = "active",
  successMessage = null,
  eventContext = {
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
  dancers?: Parameters<
    typeof PortalBailarinesRouteView
  >[0]["loaderData"]["dancers"];
  professors?: ProfesoresViewProps["loaderData"]["professors"];
  statusFilter?: "active" | "archived";
  successMessage?: string | null;
  eventContext?: PortalLoaderData["eventContext"];
} = {}) {
  return {
    email: "portal@example.com",
    userName: "Portal User",
    academy: {
      id: "academy_1",
      userId: "user_1",
      name: "Academia de Prueba",
      contactName: "Contacto",
      phone: "11 1234-5678",
    },
    eventContext,
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
  registrationBaseOptions = {
    modalities: [{ id: "modality_1", name: "Jazz" }],
    submodalities: [
      { id: "submodality_1", name: "Lyrical", modalityId: "modality_1" },
    ],
  },
  eventContext = {
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
  registrationBaseOptions?: Parameters<
    typeof PortalCoreografiasRouteView
  >[0]["loaderData"]["registrationBaseOptions"];
  eventContext?: Parameters<
    typeof PortalCoreografiasRouteView
  >[0]["loaderData"]["eventContext"];
} = {}) {
  return {
    email: "portal@example.com",
    userName: "Portal User",
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
    registrationBaseOptions,
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
    deletionAvailability: {
      canDelete: true,
      warningMessage: null,
    },
    successMessage: null,
    ...overrides,
  };
}

function bailarinDetalleLoaderData() {
  return {
    ...academyLoaderData(),
    dancer: dancerDetailRow(),
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
