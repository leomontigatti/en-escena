import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { createMemoryRouter, MemoryRouter, RouterProvider } from "react-router";
import { describe, expect, test, vi } from "vitest";

const requireAcademyUserMock = vi.hoisted(() => vi.fn());
const requestAccessRecoveryEmailMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/internal-access.server", () => ({
  requireAcademyUser: requireAcademyUserMock,
}));

vi.mock("@/lib/auth/access-recovery.server", () => ({
  requestAccessRecoveryEmail: requestAccessRecoveryEmailMock,
}));

import { PortalShell } from "@/components/portal/ui";
import { PortalRouteView } from "@/routes/portal";
import { PortalBailarinDetalleRouteView } from "@/routes/portal.bailarines_.$dancerId";
import { PortalBailarinesRouteView } from "@/routes/portal.bailarines";
import {
  PortalCoreografiaDetalleRouteView,
  shouldRevalidate as shouldRevalidateCoreografiaDetalle,
} from "@/routes/portal.coreografias_.$choreographyId";
import { PortalCoreografiasRouteView } from "@/routes/portal.coreografias";
import {
  action as perfilAction,
  PortalPerfilRouteView,
} from "@/routes/portal.perfil";
import { PortalProfesorRouteView } from "@/routes/portal.profesores_.$professorId";
import { PortalProfesoresRouteView } from "@/routes/portal.profesores";

describe("portal route view", () => {
  test("renders the portal shell", () => {
    const markup = renderPortal({
      eventContext: {
        activeEvent: eventSummary({ name: "Regional 2026" }),
      },
    });

    expect(markup).toContain("Regional 2026");
    expect(markup).toContain("Portal de academias");
    expect(markup).toContain("Inicio");
    expect(markup).not.toContain("Perfil");
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
    expect(markup).toContain("Contacto");
    expect(markup).toContain("Academia de Prueba");
    expect(markup).not.toContain("Teléfono");
  });

  test("shows the shell no-active-event state", () => {
    const markup = renderPortal({
      eventContext: {
        activeEvent: null,
      },
    });

    expect(markup).toContain("Sin evento");
  });

  test("keeps the shell usable when the active event is not ready", () => {
    const selectedEvent = eventSummary({
      id: "event_active",
      name: "Regional 2026",
      active: true,
      registrationStartsAt: date("2026-01-01T12:00:00Z"),
      registrationEndsAt: date("2026-12-31T12:00:00Z"),
    });

    const markup = renderPortal({
      eventContext: {
        activeEvent: selectedEvent,
      },
    });

    expect(markup).toContain("Regional 2026");
    expect(markup).toContain("Coreografías");
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
            groupType: "grupal",
            categoryName: "Juvenil",
            experienceLevelName: "Inicial",
            operationalStatus: {
              code: "incomplete",
              pendingItems: ["music"],
            },
          }),
          choreographyListItem({
            id: "choreo_2",
            name: "Otra Pieza",
            modalityName: "Folklore",
            groupType: "duo",
            categoryName: "Adultos",
          }),
        ],
        eventContext: {
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
      "Categoría / Tipo de grupo",
      "Estado",
    ]) {
      expect(markup).toContain(columnLabel);
    }

    expect(markup).not.toContain("Evento consultado");
    expect(markup).toContain("Mi Pieza");
    expect(markup).toContain(
      "Buscar coreografía por nombre, modalidad o categoría",
    );
    expect(markup).toContain("Filtros");
    expect(markup).toContain("2 de 2 registros");
    expect(markup).toContain("Jazz · Lyrical");
    expect(markup).toContain("Folklore");
    expect(markup).toContain("Juvenil · Grupal");
    expect(markup).toContain("Adultos · Dúo");
    expect(markup).toContain("Incompleta");
    expectPortalNavigation(markup);
    expectActivePortalNavigationItem(markup, "/portal/coreografias");
    expect(markup).toContain("Nueva coreografía");
    expect(markup).toContain('disabled=""');
    expect(markup).toContain('href="/portal/coreografias/choreo_1"');
  });

  test("disables Nueva coreografía when there are no bailarines activos", () => {
    const markup = renderCoreografias({
      loaderData: coreografiasLoaderData({
        activeDancerCount: 0,
      }),
    });

    expect(markup).toContain("Nueva coreografía");
    expect(markup).toContain('disabled=""');
  });

  test("does not expose missing active event bases before coreografía creation", () => {
    const selectedEvent = eventSummary({
      id: "event_active",
      name: "Regional 2026",
      active: true,
    });

    const markup = renderCoreografias({
      loaderData: coreografiasLoaderData({
        eventContext: {
          selectedEvent,
          activeEvent: selectedEvent,
          hasActiveEvent: true,
          activeEventRegistrationReadiness: readiness(false, [
            {
              code: "price-coverage",
              label: "Precios aplicables",
              detail:
                "Falta un precio aplicable para categoría Juvenil, modalidad Jazz, tipo de grupo Solo.",
            },
          ]),
          hasEvents: true,
          isReadOnly: false,
          isRegistrationOpen: true,
        },
      }),
    });

    expect(markup).toContain("Nueva coreografía");
    expect(markup).toContain('disabled=""');
    expect(markup).toContain(
      "No hay coreografías registradas para este evento",
    );
    expect(markup).not.toContain("Creación no disponible");
    expect(markup).not.toContain(
      "Faltan bases del evento antes de registrar coreografías.",
    );
    expect(markup).not.toContain("Precios aplicables");
  });

  test("keeps Coreografías visible in the shell without an active event", () => {
    const markup = renderCoreografias({
      loaderData: coreografiasLoaderData({
        eventContext: {
          selectedEvent: null,
          activeEvent: null,
          hasActiveEvent: false,
          activeEventRegistrationReadiness: null,
          hasEvents: false,
          isReadOnly: true,
          isRegistrationOpen: false,
        },
      }),
    });

    expect(markup).toContain("Sin evento");
    expect(markup).toContain("Inicio");
    expect(markup).toContain("Coreografías");
    expectPortalNavigation(markup);
    expectActivePortalNavigationItem(markup, "/portal/coreografias");
    expect(markup).toContain("Todavía no hay eventos configurados");
  });

  test("shows the enabled Nueva coreografía button for the active editable event", () => {
    const markup = renderCoreografias();

    expect(markup).toContain("Nueva coreografía");
    expect(markup).not.toContain('disabled=""');
    expect(markup).toContain(
      "Gestioná las coreografías de tu academia que van a participar del evento y seguí su estado operativo.",
    );
  });

  test("shows the delete success notice on the Coreografías list", () => {
    const markup = renderCoreografias({
      deleted: true,
    });

    expect(markup).toContain("La coreografía se eliminó correctamente.");
  });

  test("shows the Coreografía detail with structural read-only data, roster and archived badges", () => {
    const markup = renderCoreografiaDetalle({
      loaderData: coreografiaDetalleLoaderData({
        deletionAvailability: {
          canDelete: false,
          warningMessage: null,
        },
        eventContext: {
          selectedEvent: eventSummary(),
          activeEvent: eventSummary(),
          hasActiveEvent: true,
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
    expect(markup).toContain("Editar coreografía");
    expect(markup).toContain("Inicio");
    expectPortalNavigation(markup);
    expectActivePortalNavigationItem(markup, "/portal/coreografias");
    expect(markup).toContain("Nombre");
    expect(markup).toContain("Modalidad");
    expect(markup).toContain("Tipo de grupo");
    expect(markup).toContain("Sin asignar");
    expect(markup).toContain("Falta cargar profesores.");
    expect(markup).toContain("Ana Paz");
    expect(markup).not.toContain("Volver a Coreografías");
    expect(markup).not.toContain("Eliminar Coreografía");
  });

  test("shows linked Profesores on the Coreografía detail and keeps archived options visible", () => {
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
          selectedEvent: eventSummary(),
          activeEvent: eventSummary(),
          hasActiveEvent: true,
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
      }),
    });

    expect(markup).toContain("Editar coreografía");
    expect(markup).not.toContain("Profesores actualizados correctamente.");
    expect(markup).toContain(
      "Actualizá bailarines y profesores de esta coreografía.",
    );
    expect(markup).not.toContain("Buscar profesores");
    expect(markup).toContain("Mora Archivada");
    expect(markup).not.toContain("Falta cargar");
    expect(markup).toContain("Acciones");
    expect(markup).not.toContain(
      "Confirmo que quiero eliminar esta Coreografía.",
    );
  });

  test("shows linked bailarines on coreografía detail with active and archived options", () => {
    const markup = renderCoreografiaDetalle({
      loaderData: coreografiaDetalleLoaderData({
        availableDancers: [
          {
            id: "dancer_1",
            firstName: "Luz",
            lastName: "Activa",
            active: true,
          },
          {
            id: "dancer_2",
            firstName: "Mora",
            lastName: "Archivada",
            active: false,
          },
        ],
        eventContext: {
          selectedEvent: eventSummary(),
          activeEvent: eventSummary(),
          hasActiveEvent: true,
          hasEvents: true,
          isReadOnly: false,
          isRegistrationOpen: true,
        },
        choreography: choreographyDetailRow({
          dancerEditingEligibility: {
            canEdit: true,
            reasonCode: null,
            reasonText: null,
          },
          dancers: [
            {
              id: "dancer_2",
              firstName: "Mora",
              lastName: "Archivada",
              active: false,
              ageAtEventStart: 14,
            },
          ],
        }),
      }),
    });

    expect(markup).toContain("Editar coreografía");
    expect(markup).toContain(
      "Actualizá bailarines y profesores de esta coreografía.",
    );
    expect(markup).not.toContain("Buscar bailarines");
    expect(markup).toContain("Mora Archivada");
  });

  test("does not revalidate coreografía detail loader after dancer roster resolution", () => {
    const resolveFormData = new FormData();
    resolveFormData.set("intent", "resolve-choreography-dancers");

    expect(
      shouldRevalidateCoreografiaDetalle({
        defaultShouldRevalidate: true,
        formData: resolveFormData,
      }),
    ).toBe(false);

    const updateFormData = new FormData();
    updateFormData.set("intent", "update-choreography");

    expect(
      shouldRevalidateCoreografiaDetalle({
        defaultShouldRevalidate: true,
        formData: updateFormData,
      }),
    ).toBe(true);
  });

  test("keeps the coreografía detail free of financial copy when dancer resolution state is present", () => {
    const markup = renderCoreografiaDetalle({
      actionData: {
        status: "update-error",
        section: "dancers",
        message: "Revisá los bailarines de la coreografía.",
        selectedDancerIds: ["dancer_1", "dancer_2", "dancer_3", "dancer_4"],
        selectedProfessorIds: [],
        selectedExperienceLevelId: null,
        selectedScheduleCapacityId: "schedule_auto",
      },
      initialDancerResolution: {
        ok: true,
        resolution: {
          groupType: "grupal",
          categoryId: "category_2",
          categoryName: "Adultos",
          categoryCalculationMode: "group_average",
          categoryAgeBasis: 13,
          experienceLevel: {
            required: false,
            options: [],
          },
          schedule: {
            status: "auto",
            canSave: true,
            selectedScheduleCapacityId: "schedule_auto",
            options: [
              {
                id: "schedule_auto",
                scheduleId: "block_1",
                scheduleCapacityId: "schedule_auto",
                capacity: 5,
                groupType: "grupal",
                usesGlobalCapacity: false,
                schedule: {
                  id: "block_1",
                  name: "Bloque tarde",
                  scheduledDate: "2026-05-01",
                  startTime: "14:00",
                },
              },
            ],
          },
        },
      },
      loaderData: coreografiaDetalleLoaderData({
        availableDancers: [
          {
            id: "dancer_1",
            firstName: "Ana",
            lastName: "Paz",
            active: true,
          },
          {
            id: "dancer_2",
            firstName: "Luz",
            lastName: "Mar",
            active: true,
          },
          {
            id: "dancer_3",
            firstName: "Mora",
            lastName: "Sol",
            active: true,
          },
          {
            id: "dancer_4",
            firstName: "Eva",
            lastName: "Río",
            active: true,
          },
        ],
        eventContext: {
          selectedEvent: eventSummary(),
          activeEvent: eventSummary(),
          hasActiveEvent: true,
          hasEvents: true,
          isReadOnly: false,
          isRegistrationOpen: true,
        },
        choreography: choreographyDetailRow({
          categoryId: "category_1",
          categoryName: "Juvenil",
          dancerEditingEligibility: {
            canEdit: true,
            reasonCode: null,
            reasonText: null,
          },
          groupType: "solo",
        }),
      }),
    });

    expect(markup).toContain("Editar coreografía");
    expect(markup).not.toContain("$");
    expect(markup).not.toContain("Desglose");
  });

  test("does not render transient cupo de cronograma resolution errors on the read-only detail", () => {
    const markup = renderCoreografiaDetalle({
      initialDancerResolution: {
        ok: true,
        resolution: {
          groupType: "trio",
          categoryId: "category_1",
          categoryName: "Juvenil",
          experienceLevel: {
            required: false,
            options: [],
          },
          schedule: {
            status: "none",
            canSave: false,
            error:
              "No hay cupos de cronograma compatibles para la modalidad y el tipo de grupo seleccionados.",
            options: [],
            selectedScheduleCapacityId: null,
          },
        },
      },
      loaderData: coreografiaDetalleLoaderData({
        eventContext: {
          selectedEvent: eventSummary(),
          activeEvent: eventSummary(),
          hasActiveEvent: true,
          hasEvents: true,
          isReadOnly: false,
          isRegistrationOpen: true,
        },
        choreography: choreographyDetailRow({
          dancerEditingEligibility: {
            canEdit: true,
            reasonCode: null,
            reasonText: null,
          },
        }),
      }),
    });

    expect(markup).toContain("Cupo de cronograma");
    expect(markup).not.toContain(
      "No hay cupos de cronograma compatibles para la modalidad y el tipo de grupo seleccionados.",
    );
  });

  test("does not render transient auto cupo de cronograma messaging on the read-only detail", () => {
    const markup = renderCoreografiaDetalle({
      initialDancerResolution: {
        ok: true,
        resolution: {
          groupType: "trio",
          categoryId: "category_1",
          categoryName: "Juvenil",
          experienceLevel: {
            required: false,
            options: [],
          },
          schedule: {
            status: "auto",
            canSave: true,
            selectedScheduleCapacityId: "schedule_auto",
            options: [
              {
                id: "schedule_auto",
                scheduleId: "block_1",
                scheduleCapacityId: "schedule_auto",
                capacity: 5,
                groupType: "trio",
                usesGlobalCapacity: false,
                schedule: {
                  id: "block_1",
                  name: "Bloque tarde",
                  scheduledDate: "2026-05-01",
                  startTime: "14:00",
                },
              },
            ],
          },
        },
      },
      loaderData: coreografiaDetalleLoaderData({
        eventContext: {
          selectedEvent: eventSummary(),
          activeEvent: eventSummary(),
          hasActiveEvent: true,
          hasEvents: true,
          isReadOnly: false,
          isRegistrationOpen: true,
        },
        choreography: choreographyDetailRow({
          dancerEditingEligibility: {
            canEdit: true,
            reasonCode: null,
            reasonText: null,
          },
        }),
      }),
    });

    expect(markup).toContain("Cupo de cronograma");
    expect(markup).not.toContain(
      "El cupo de cronograma compatible se selecciona automáticamente.",
    );
  });

  test("does not render transient multiple cupo de cronograma messaging on the read-only detail", () => {
    const markup = renderCoreografiaDetalle({
      initialDancerResolution: {
        ok: true,
        resolution: {
          groupType: "trio",
          categoryId: "category_1",
          categoryName: "Juvenil",
          experienceLevel: {
            required: false,
            options: [],
          },
          schedule: {
            status: "multiple",
            canSave: true,
            selectedScheduleCapacityId: null,
            options: [
              {
                id: "schedule_1",
                scheduleId: "block_1",
                scheduleCapacityId: "schedule_1",
                capacity: 5,
                groupType: "trio",
                usesGlobalCapacity: false,
                schedule: {
                  id: "block_1",
                  name: "Bloque mañana",
                  scheduledDate: "2026-05-01",
                  startTime: "10:00",
                },
              },
              {
                id: "schedule_2",
                scheduleId: "block_2",
                scheduleCapacityId: "schedule_2",
                capacity: 3,
                groupType: "trio",
                usesGlobalCapacity: false,
                schedule: {
                  id: "block_2",
                  name: "Bloque tarde",
                  scheduledDate: "2026-05-01",
                  startTime: "14:00",
                },
              },
            ],
          },
        },
      },
      loaderData: coreografiaDetalleLoaderData({
        eventContext: {
          selectedEvent: eventSummary(),
          activeEvent: eventSummary(),
          hasActiveEvent: true,
          hasEvents: true,
          isReadOnly: false,
          isRegistrationOpen: true,
        },
        choreography: choreographyDetailRow({
          dancerEditingEligibility: {
            canEdit: true,
            reasonCode: null,
            reasonText: null,
          },
        }),
      }),
    });

    expect(markup).toContain("Cupo de cronograma");
    expect(markup).not.toContain(
      "Elegí un cupo de cronograma compatible antes de guardar los bailarines.",
    );
    expect(markup).not.toContain('id="choreography-dancer-schedule"');
  });

  test("keeps the coreografía detail read-only when dancer editing would be blocked", () => {
    const markup = renderCoreografiaDetalle({
      loaderData: coreografiaDetalleLoaderData({
        eventContext: {
          selectedEvent: eventSummary(),
          activeEvent: eventSummary(),
          hasActiveEvent: true,
          hasEvents: true,
          isReadOnly: false,
          isRegistrationOpen: false,
        },
        choreography: choreographyDetailRow({
          dancerEditingEligibility: {
            canEdit: false,
            reasonCode: "presentation",
            reasonText:
              "No podés editar los bailarines de esta coreografía porque ya tiene una presentación asociada.",
          },
        }),
      }),
    });

    expect(markup).toContain("Bailarines");
    expect(markup).not.toContain("Buscar bailarines");
    expect(markup).toContain(
      "No podés editar los bailarines de esta coreografía porque ya tiene una presentación asociada.",
    );
  });

  test("shows the delete warning on editable detail when registration is closed", () => {
    const markup = renderCoreografiaDetalle({
      initialDeleteDialogOpen: true,
      loaderData: coreografiaDetalleLoaderData({
        deletionAvailability: {
          canDelete: true,
          warningMessage:
            "Si eliminás esta Coreografía con la inscripción cerrada, quizá no puedas registrarla nuevamente salvo ajuste administrativo.",
        },
        eventContext: {
          selectedEvent: eventSummary(),
          activeEvent: eventSummary(),
          hasActiveEvent: true,
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
    expect(markup).toContain("¿Eliminar Coreografía?");
    expect(markup).toContain('value="delete-choreography"');
    expect(markup).not.toContain(
      "Confirmo que quiero eliminar esta Coreografía.",
    );
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
    expect(markup).toContain('aria-label="Filtros"');
    expect(markup).not.toContain('aria-label="Filtros:');
    expect(markup).toContain("1 de 2 registros");
    expect(markup).toContain("DNI 12345678");
    expect(markup).toContain("Faltan imágenes");
    expect(markup).toContain('href="/portal/bailarines/dancer_complete"');
    expect(markup).not.toContain('href="/portal/bailarines/dancer_archived"');
    expect(markup).not.toContain("Cargar Bailarín");
  });

  test("shows ordered Bailarines with document and state badges", () => {
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

    expect(markup).toContain("Ana Alvarez");
    expect(markup).toContain("Juan Manuel Cruz de la Torre");
    expect(markup).toContain("DNI 12345678");
    expect(markup).toContain("Sin documento");
    expect(markup).toContain("No participando");
    expect(markup).toContain("Faltan imágenes");
    expect(markup).toContain("Incompleto");
    expect(markup).not.toContain("Fecha de nacimiento");
    expect(markup).not.toContain("01/02/2014");
    expect(markup).not.toContain("03/04/2015");
    expect(markup).toContain('href="/portal/bailarines/dancer_ana"');
    expect(markup.indexOf("Ana Alvarez")).toBeLessThan(
      markup.indexOf("Juan Manuel Cruz de la Torre"),
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

    expect(markup).toContain(">Ana Alvarez</h1>");
    expect(markup).not.toContain("Editar bailarín");
    expect(markup).not.toContain("Editar Bailarín");
    expect(markup).toContain("Inicio");
    expect(markup).toContain("Bailarines");
    expect(markup).toContain('name="firstName" value="Ana"');
    expect(markup).toContain('name="lastName" value="Alvarez"');
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

  test("renders verified identification fields as locked readonly inputs", () => {
    const markup = renderBailarinDetalle({
      loaderData: {
        ...academyLoaderData(),
        dancer: dancerDetailRow({
          birthDate: "2014-02-01",
          documentType: "dni",
          documentNumber: "12345678",
          documentFrontImageStorageKey: "dancers/front.jpg",
          documentBackImageStorageKey: "dancers/back.jpg",
          identityVerifiedAt: new Date("2026-06-16T12:00:00Z"),
        }),
      },
    });

    expect(markup).toContain("Fecha de nacimiento");
    expect(markup).toContain('name="birthDate" value="2014-02-01"');
    expect(markup).toContain('value="1 de febrero de 2014"');
    expect(markup).toContain("Tipo de documento");
    expect(markup).toContain('name="documentType" value="dni"');
    expect(markup).toContain('value="DNI"');
    expect(markup).toContain("Número de documento");
    expect(markup).toContain('name="documentNumber" value="12345678"');
    expect(markup).toContain('disabled="" readOnly="" value="12345678"');
    expect(countOccurrences(markup, "lucide-lock")).toBe(3);
    expect(markup).not.toContain("Faltan imágenes");
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
          documentFrontImageStorageKey: "",
          documentBackImageStorageKey: "",
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

    expect(markup).toContain(">Ana Perez</h1>");
    expect(markup).not.toContain("Editar Profesor");
    expect(markup).toContain("Inicio");
    expect(markup).toContain("Profesores");
    expect(markup).toContain('name="firstName" value="Ana"');
    expect(markup).toContain('name="lastName" value="Perez"');
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

    expect(markup).toContain(">Ana Zapata</h1>");
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

describe("portal Perfil view", () => {
  test("renders the academy profile form with access email as read-only", () => {
    const markup = renderPerfil();

    expect(markup).toContain("Perfil");
    expect(markup).toContain("Nombre de la academia");
    expect(markup).toContain('name="name" value="Academia de Prueba"');
    expect(markup).toContain('value="Academia de Prueba"');
    expect(markup).toContain(
      "Para cambiar el nombre de la academia o el email de acceso, comunicate con nosotros.",
    );
    expect(markup).toContain("Nombre de contacto");
    expect(markup).toContain('name="contactName" value="Contacto"');
    expect(markup).toContain("Teléfono de contacto");
    expect(markup).toContain(
      'placeholder="Código de área sin 0 y número sin 15"',
    );
    expect(markup).toContain('name="phone" value="1112345678"');
    expect(markup).toContain("Email de acceso");
    expect(markup).toContain('value="portal@example.com"');
    expect(markup).toContain("disabled");
    expect(countOccurrences(markup, "lucide-lock")).toBe(2);
    expect(countOccurrences(markup, "lucide-info")).toBe(1);
    expect(markup).toContain("Guardar");
    expect(markup).toContain("Acciones");
    expect(markup).toContain('form="portal-perfil-form"');
  });
});

describe("portal Perfil action", () => {
  test("requests password recovery for the signed-in academy user email", async () => {
    requestAccessRecoveryEmailMock.mockResolvedValue({
      message:
        "Si el correo corresponde a un usuario existente, enviamos un enlace para recuperar el acceso.",
    });
    requireAcademyUserMock.mockResolvedValue({
      user: { email: "portal@example.com" },
      academy: {
        id: "academy_1",
        name: "Academia de Prueba",
        contactName: "Contacto",
        phone: "1112345678",
      },
    });

    const formData = new FormData();
    formData.set("intent", "request-password-recovery");
    formData.set("email", "otro@example.com");

    const result = await perfilAction({
      request: new Request("http://localhost/portal/perfil", {
        method: "POST",
        body: formData,
      }),
    });

    expect(requestAccessRecoveryEmailMock).toHaveBeenCalledWith({
      email: "portal@example.com",
      request: expect.any(Request),
      requestUrl: "http://localhost/portal/perfil",
    });
    expect(result).toMatchObject({
      data: {
        status: "success",
        message:
          "Si el correo corresponde a un usuario existente, enviamos un enlace para recuperar el acceso.",
      },
    });
  });
});

type PortalLoaderData = Parameters<typeof PortalRouteView>[0]["loaderData"];

const portalNavigationPaths = [
  "/portal",
  "/portal/profesores",
  "/portal/bailarines",
  "/portal/coreografias",
] as const;

function expectPortalNavigation(markup: string) {
  for (const path of portalNavigationPaths) {
    expect(markup).toContain(`href="${path}"`);
  }
}

function expectActivePortalNavigationItem(markup: string, path: string) {
  expect(markup).toContain(`href="${path}"`);
  expect(markup).toContain('aria-current="page"');
}

function renderPortal(input: {
  eventContext: Parameters<typeof PortalShell>[0]["eventContext"];
}) {
  const loaderData = {
    email: "portal@example.com",
    academy: {
      id: "academy_1",
      userId: "user_1",
      name: "Academia de Prueba",
      contactName: "Contacto",
      phone: "1112345678",
    },
    eventContext: input.eventContext,
  } satisfies PortalLoaderData;

  return renderToStaticMarkup(
    <MemoryRouter initialEntries={["/portal"]}>
      <PortalShell
        userEmail={loaderData.email}
        contactName={loaderData.academy.contactName}
        academyName={loaderData.academy.name}
        eventContext={loaderData.eventContext}
        breadcrumbItems={[{ label: "Inicio" }]}
      >
        <></>
      </PortalShell>
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
  return renderPortalDataRoute(
    "/portal/bailarines",
    renderPortalShellForTest(
      "/portal/bailarines",
      <PortalBailarinesRouteView
        actionData={input.actionData}
        loaderData={
          input.loaderData ??
          academyLoaderData({
            dancers: input.dancers ?? [],
            statusFilter: "active",
          })
        }
      />,
    ),
  );
}

type BailarinDetalleViewProps = Parameters<
  typeof PortalBailarinDetalleRouteView
>[0];

function renderBailarinDetalle(input: Partial<BailarinDetalleViewProps>) {
  return renderPortalDataRoute(
    "/portal/bailarines/:dancerId",
    renderPortalShellForTest(
      "/portal/bailarines",
      <PortalBailarinDetalleRouteView
        loaderData={input.loaderData ?? bailarinDetalleLoaderData()}
        actionData={input.actionData}
        initialStatusDialogIntent={input.initialStatusDialogIntent}
      />,
    ),
    "/portal/bailarines/dancer_edit_1",
  );
}

type ProfesoresViewProps = Parameters<typeof PortalProfesoresRouteView>[0];
type PerfilViewProps = Parameters<typeof PortalPerfilRouteView>[0];

function renderPerfil(input: Partial<PerfilViewProps> = {}) {
  return renderPortalDataRoute(
    "/portal/perfil",
    renderPortalShellForTest(
      "/portal/perfil",
      <PortalPerfilRouteView
        loaderData={input.loaderData ?? academyLoaderData()}
        actionData={input.actionData}
      />,
    ),
  );
}

function renderProfesores(input: Partial<ProfesoresViewProps> = {}) {
  return renderPortalDataRoute(
    "/portal/profesores",
    renderPortalShellForTest(
      "/portal/profesores",
      <PortalProfesoresRouteView
        loaderData={input.loaderData ?? academyLoaderData()}
        actionData={input.actionData}
      />,
    ),
  );
}

type CoreografiasViewProps = Parameters<typeof PortalCoreografiasRouteView>[0];

function renderCoreografias(input: Partial<CoreografiasViewProps> = {}) {
  const loaderData = input.loaderData ?? coreografiasLoaderData();
  const router = createMemoryRouter(
    [
      {
        path: "/portal/coreografias",
        action: async () => null,
        element: renderPortalShellForTest(
          "/portal/coreografias",
          <PortalCoreografiasRouteView
            created={input.created}
            deleted={input.deleted}
            initialCreateDialogOpen={input.initialCreateDialogOpen}
            loaderData={loaderData}
          />,
          loaderData.eventContext,
        ),
      },
      {
        path: "/portal/coreografias/crear",
        loader: async () => ({
          eventId: loaderData.eventContext.selectedEvent?.id ?? "event_1",
          activeDancers: [dancerListItem()],
          activeProfessors: [professorListItem()],
          registrationBaseOptions: {
            modalities: [{ id: "modality_1", name: "Jazz" }],
            submodalities: [
              {
                id: "submodality_1",
                name: "Lyrical",
                modalityId: "modality_1",
              },
            ],
          },
        }),
        element: null,
      },
    ],
    { initialEntries: ["/portal/coreografias"] },
  );

  return renderToStaticMarkup(<RouterProvider router={router} />);
}

type CoreografiaDetalleViewProps = Parameters<
  typeof PortalCoreografiaDetalleRouteView
>[0];

function renderCoreografiaDetalle(
  input: Partial<CoreografiaDetalleViewProps> & {
    initialDeleteDialogOpen?: boolean;
  } = {},
) {
  const loaderData = input.loaderData ?? coreografiaDetalleLoaderData();
  const router = createMemoryRouter(
    [
      {
        path: "/portal/coreografias/choreo_1",
        action: async () => null,
        element: renderPortalShellForTest(
          "/portal/coreografias",
          <PortalCoreografiaDetalleRouteView
            actionData={input.actionData}
            initialDancerResolution={input.initialDancerResolution}
            initialDeleteDialogOpen={input.initialDeleteDialogOpen}
            loaderData={loaderData}
          />,
          loaderData.eventContext,
        ),
      },
    ],
    { initialEntries: ["/portal/coreografias/choreo_1"] },
  );

  return renderToStaticMarkup(<RouterProvider router={router} />);
}

type ProfesorEditViewProps = Parameters<typeof PortalProfesorRouteView>[0];

function renderProfesorEdit(input: Partial<ProfesorEditViewProps> = {}) {
  return renderPortalDataRoute(
    "/portal/profesores/:professorId",
    renderPortalShellForTest(
      "/portal/profesores",
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
      />,
    ),
    "/portal/profesores/profesor_1",
  );
}

function renderPortalDataRoute(
  path: string,
  element: ReactNode,
  initialEntry = path,
) {
  const router = createMemoryRouter(
    [
      {
        path,
        action: async () => null,
        element,
      },
    ],
    { initialEntries: [initialEntry] },
  );

  return renderToStaticMarkup(<RouterProvider router={router} />);
}

function renderPortalShellForTest(
  activePath: string,
  children: ReactNode,
  eventContext: Parameters<typeof PortalShell>[0]["eventContext"] = {
    activeEvent: eventSummary(),
  },
) {
  return (
    <PortalShell
      userEmail="portal@example.com"
      contactName="Contacto"
      academyName="Academia de Prueba"
      eventContext={eventContext}
      breadcrumbItems={[{ label: getPortalBreadcrumbLabel(activePath) }]}
    >
      {children}
    </PortalShell>
  );
}

function getPortalBreadcrumbLabel(path: string) {
  if (path.includes("bailarines")) {
    return "Bailarines";
  }

  if (path.includes("coreografias")) {
    return "Coreografías";
  }

  if (path.includes("perfil")) {
    return "Perfil";
  }

  if (path.includes("profesores")) {
    return "Profesores";
  }

  return "Inicio";
}

function academyLoaderData({
  dancers = [],
  professors = [],
  statusFilter = "active",
  successMessage = null,
  eventContext = {
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
  eventContext?: CoreografiasViewProps["loaderData"]["eventContext"];
} = {}) {
  return {
    email: "portal@example.com",
    academy: {
      id: "academy_1",
      userId: "user_1",
      name: "Academia de Prueba",
      contactName: "Contacto",
      phone: "1112345678",
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
  activeDancerCount = 1,
  eventContext = {
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
  activeDancerCount?: Parameters<
    typeof PortalCoreografiasRouteView
  >[0]["loaderData"]["activeDancerCount"];
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
      phone: "1112345678",
    },
    choreographies,
    activeDancerCount,
    eventContext,
  };
}

function coreografiaDetalleLoaderData(
  overrides: Partial<CoreografiaDetalleViewProps["loaderData"]> = {},
) {
  const choreography = overrides.choreography ?? choreographyDetailRow();

  return {
    ...coreografiasLoaderData(),
    availableDancers: choreography.dancers.map((dancer) => ({
      id: dancer.id,
      firstName: dancer.firstName,
      lastName: dancer.lastName,
      active: dancer.active,
    })),
    availableProfessors: [],
    choreography,
    dancerEditingEligibility:
      overrides.dancerEditingEligibility ??
      choreography.dancerEditingEligibility,
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
    participationStatus: "not-participating" as const,
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
    participationStatus: "not-participating" as const,
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
    categoryId: "category_1",
    dancerEditingEligibility: {
      canEdit: false as const,
      reasonCode: "registration-closed" as const,
      reasonText:
        "No podés editar los bailarines de esta coreografía porque el período de inscripción está cerrado.",
    },
    experienceLevelId: "level_1",
    scheduleCapacityId: "schedule_1",
    scheduleName: "Bloque mañana",
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
    documentFrontImageStorageKey: null,
    documentBackImageStorageKey: null,
    identityVerifiedAt: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  } satisfies BailarinDetalleViewProps["loaderData"]["dancer"];
}

function eventSummary(
  overrides: Partial<
    NonNullable<
      CoreografiasViewProps["loaderData"]["eventContext"]["selectedEvent"]
    >
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

function countOccurrences(value: string, search: string) {
  return value.split(search).length - 1;
}

function date(value: string) {
  return new Date(value);
}

function readiness(
  isReady: boolean,
  missingItems: NonNullable<
    CoreografiasViewProps["loaderData"]["eventContext"]["activeEventRegistrationReadiness"]
  >["missingItems"] = [],
) {
  return {
    eventId: "event_1",
    isReady,
    missingItems,
  };
}
