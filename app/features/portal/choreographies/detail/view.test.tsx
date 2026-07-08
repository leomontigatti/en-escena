import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, test } from "vitest";

import { PortalChoreographyDetailRouteView } from "@/features/portal/choreographies/detail/view";
import type { PortalEventContext } from "@/lib/portal/event-context";
import type { ChoreographyDancerScheduleResolution } from "@/lib/portal/choreography-roster.shared";
import type { ResolveChoreographyDancersResult } from "@/lib/portal/choreography-roster.server";

type ChoreographyDetailViewProps = Parameters<
  typeof PortalChoreographyDetailRouteView
>[0];

describe("PortalChoreographyDetailRouteView", () => {
  test("shows structural read-only data, roster and archived badges", () => {
    const markup = renderChoreographyDetail({
      loaderData: choreographyDetailLoaderData({
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
          activeEventRegistrationReadiness: null,
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
    expect(markup).toContain("Nombre");
    expect(markup).toContain("Modalidad");
    expect(markup).toContain("Tipo de grupo");
    expect(markup).toContain("Sin asignar");
    expect(markup).toContain("Faltan cargar categoría y profesores.");
    expect(markup).toContain("Ana Paz");
    expect(markup).not.toContain("Volver a Coreografías");
    expect(markup).not.toContain("Eliminar coreografía");
  });

  test("shows linked profesores and keeps archived options visible", () => {
    const markup = renderChoreographyDetail({
      loaderData: choreographyDetailLoaderData({
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
        eventContext: editableEventContext({ isRegistrationOpen: false }),
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
      "Actualizá bailarines, profesores y música de esta coreografía.",
    );
    expect(markup).not.toContain("Buscar profesores");
    expect(markup).toContain("Mora Archivada");
    expect(markup).not.toContain("Falta cargar");
    expect(markup).not.toContain('class="flex flex-col gap-3"></div>');
    expect(markup).not.toContain("Acciones");
    expect(markup).not.toContain(
      "Confirmo que quiero eliminar esta coreografía.",
    );
  });

  test("shows linked bailarines with active and archived options", () => {
    const markup = renderChoreographyDetail({
      loaderData: choreographyDetailLoaderData({
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
        eventContext: editableEventContext(),
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
      "Actualizá bailarines, profesores y música de esta coreografía.",
    );
    expect(markup).not.toContain("Buscar bailarines");
    expect(markup).toContain("Mora Archivada");
  });

  test("keeps the detail free of financial copy when dancer resolution state is present", () => {
    const markup = renderChoreographyDetail({
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
      loaderData: choreographyDetailLoaderData({
        availableDancers: activeDancerOptions(4),
        eventContext: editableEventContext(),
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

  test.each([
    [
      "none",
      {
        status: "none",
        canSave: false,
        error:
          "No hay cupos de cronograma compatibles para la modalidad y el tipo de grupo seleccionados.",
        options: [],
        selectedScheduleCapacityId: null,
      },
      "No hay cupos de cronograma compatibles para la modalidad y el tipo de grupo seleccionados.",
    ],
    [
      "auto",
      {
        status: "auto",
        canSave: true,
        selectedScheduleCapacityId: "schedule_auto",
        options: [scheduleOption("schedule_auto", "trio")],
      },
      "El cupo de cronograma compatible se selecciona automáticamente.",
    ],
    [
      "multiple",
      {
        status: "multiple",
        canSave: true,
        selectedScheduleCapacityId: null,
        options: [
          scheduleOption("schedule_1", "trio", "Bloque mañana", "10:00"),
          scheduleOption("schedule_2", "trio", "Bloque tarde", "14:00"),
        ],
      },
      "Elegí un cupo de cronograma compatible antes de guardar los bailarines.",
    ],
  ] satisfies Array<[string, ChoreographyDancerScheduleResolution, string]>)(
    "does not render transient %s cupo de cronograma messaging on read-only detail",
    (_, schedule, hiddenMessage) => {
      const markup = renderChoreographyDetail({
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
            schedule,
          },
        } as ResolveChoreographyDancersResult,
        loaderData: choreographyDetailLoaderData({
          eventContext: editableEventContext(),
          choreography: choreographyDetailRow({
            dancerEditingEligibility: {
              canEdit: true,
              reasonCode: null,
              reasonText: null,
            },
          }),
        }),
      });

      expect(markup).toContain("Cronograma");
      expect(markup).not.toContain(hiddenMessage);
      expect(markup).not.toContain('id="choreography-dancer-schedule"');
    },
  );

  test("keeps detail read-only when dancer editing would be blocked", () => {
    const markup = renderChoreographyDetail({
      loaderData: choreographyDetailLoaderData({
        eventContext: editableEventContext({ isRegistrationOpen: false }),
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
    expect(markup).not.toContain(
      "No podés editar los bailarines de esta coreografía porque ya tiene una presentación asociada.",
    );
  });

  test("does not expose academy deletion from the portal detail", () => {
    const markup = renderChoreographyDetail({
      loaderData: choreographyDetailLoaderData({
        deletionAvailability: {
          canDelete: false,
          warningMessage: null,
        },
        eventContext: editableEventContext({ isRegistrationOpen: false }),
      }),
    });

    expect(markup).not.toContain("Eliminar coreografía");
    expect(markup).not.toContain("¿Eliminar coreografía?");
    expect(markup).not.toContain('value="delete-choreography"');
  });
});

function renderChoreographyDetail(
  input: Partial<ChoreographyDetailViewProps> = {},
) {
  const loaderData = input.loaderData ?? choreographyDetailLoaderData();
  const router = createMemoryRouter(
    [
      {
        path: "/portal/coreografias/choreo_1",
        action: async () => null,
        element: (
          <PortalChoreographyDetailRouteView
            actionData={input.actionData}
            initialDancerResolution={input.initialDancerResolution}
            loaderData={loaderData}
          />
        ),
      },
    ],
    { initialEntries: ["/portal/coreografias/choreo_1"] },
  );

  return renderToStaticMarkup(<RouterProvider router={router} />);
}

function choreographyDetailLoaderData(
  overrides: Partial<ChoreographyDetailViewProps["loaderData"]> = {},
) {
  const choreography = overrides.choreography ?? choreographyDetailRow();

  return {
    eventContext: portalEventContext(),
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

function choreographyDetailRow(
  overrides: Partial<
    ChoreographyDetailViewProps["loaderData"]["choreography"]
  > = {},
) {
  return {
    id: "choreo_1",
    name: "Coreografía",
    modalityName: "Jazz",
    submodalityName: null,
    groupType: "solo" as const,
    categoryId: "category_1",
    categoryName: "Juvenil",
    experienceLevelId: "level_1",
    experienceLevelName: "Inicial",
    operationalStatus: {
      code: "complete" as const,
      pendingItems: [],
    },
    dancerEditingEligibility: {
      canEdit: false as const,
      reasonCode: "registration-closed" as const,
      reasonText:
        "No podés editar los bailarines de esta coreografía porque el período de inscripción está cerrado.",
    },
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
    hasPresentation: false,
    ...overrides,
  };
}

function editableEventContext(
  overrides: Partial<PortalEventContext> = {},
): PortalEventContext {
  return {
    selectedEvent: eventSummary(),
    activeEvent: eventSummary(),
    hasActiveEvent: true,
    hasEvents: true,
    isReadOnly: false,
    isRegistrationOpen: true,
    activeEventRegistrationReadiness: null,
    ...overrides,
  };
}

function portalEventContext(
  overrides: Partial<PortalEventContext> = {},
): PortalEventContext {
  const event = eventSummary();

  return {
    selectedEvent: event,
    activeEvent: event,
    hasActiveEvent: true,
    activeEventRegistrationReadiness: {
      eventId: "event_1",
      isReady: true,
      missingItems: [],
    },
    hasEvents: true,
    isReadOnly: false,
    isRegistrationOpen: true,
    ...overrides,
  };
}

function eventSummary(
  overrides: Partial<NonNullable<PortalEventContext["selectedEvent"]>> = {},
) {
  return {
    id: "event_1",
    name: "Regional 2026",
    active: true,
    registrationStartsAt: new Date("2026-03-01T12:00:00Z"),
    registrationEndsAt: new Date("2026-04-30T12:00:00Z"),
    startsAt: new Date("2026-05-01T12:00:00Z"),
    endsAt: new Date("2026-05-03T12:00:00Z"),
    ...overrides,
  };
}

function activeDancerOptions(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `dancer_${index + 1}`,
    firstName: ["Ana", "Luz", "Mora", "Eva"][index] ?? "Bailarina",
    lastName: ["Paz", "Mar", "Sol", "Río"][index] ?? "Prueba",
    active: true,
  }));
}

function scheduleOption(
  id: string,
  groupType: "duo" | "grupal" | "solo" | "trio",
  name = "Bloque tarde",
  startTime = "14:00",
) {
  return {
    id,
    scheduleId: id,
    scheduleCapacityId: id,
    capacity: 5,
    groupType,
    usesGlobalCapacity: false,
    schedule: {
      id,
      name,
      scheduledDate: "2026-05-01",
      startTime,
    },
  };
}
