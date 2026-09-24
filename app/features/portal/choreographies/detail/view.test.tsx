import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, test } from "vitest";

import { PortalChoreographyDetailRouteView } from "@/features/portal/choreographies/detail/view";
import type { PortalEventContext } from "@/lib/portal/event-context";

type ChoreographyDetailViewProps = Parameters<
  typeof PortalChoreographyDetailRouteView
>[0];

describe("PortalChoreographyDetailRouteView", () => {
  test("shows structural read-only data and the linked roster without roster editors", () => {
    const markup = renderChoreographyDetail({
      loaderData: choreographyDetailLoaderData({
        eventContext: portalEventContext({
          isReadOnly: true,
          isRegistrationOpen: false,
        }),
        choreography: choreographyDetailRow({
          name: "Mi Pieza",
          categoryName: "Juvenil",
          experienceLevelName: null,
          operationalStatus: {
            code: "incomplete",
            pendingItems: ["experienceLevel", "professors"],
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
    expect(markup).toContain("Juvenil");
    expect(markup).toContain(
      "Faltan cargar nivel de experiencia y profesores.",
    );
    expect(markup).toContain("Ana Paz");
    expect(markup).toContain("Luz Suárez");
    expect(markup).not.toContain("Buscar bailarines");
    expect(markup).not.toContain("Buscar profesores");
    expect(markup).not.toContain("Eliminar coreografía");
  });

  test("exposes the music field and the read-only roster copy", () => {
    const markup = renderChoreographyDetail({
      loaderData: choreographyDetailLoaderData({
        eventContext: portalEventContext(),
        choreography: choreographyDetailRow({
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
    expect(markup).toContain(
      "Actualizá la música de esta coreografía. El resto de los datos se editan desde administración.",
    );
    expect(markup).toContain("Archivo de música");
    expect(markup).toContain("Mora Archivada");
    expect(markup).not.toContain("Buscar profesores");
    expect(markup).not.toContain("Buscar bailarines");
    expect(markup).not.toContain("Acciones");
    expect(markup).not.toContain(
      "Confirmo que quiero eliminar esta coreografía.",
    );
  });

  test("keeps the music field disabled once the choreography was evaluated", () => {
    const markup = renderChoreographyDetail({
      loaderData: choreographyDetailLoaderData({
        eventContext: portalEventContext({ isRegistrationOpen: false }),
        choreography: choreographyDetailRow({
          isEvaluated: true,
        }),
      }),
    });

    expect(markup).toContain("Archivo de música");
    expect(markup).not.toContain("Buscar bailarines");
    expect(markup).not.toContain("Eliminar coreografía");
  });

  // The academy sees a withdrawn choreography and edits nothing on it, music
  // included: only an administrator brings it back.
  test("keeps the music field disabled while the choreography is withdrawn", () => {
    const withdrawn = renderChoreographyDetail({
      loaderData: choreographyDetailLoaderData({
        choreography: choreographyDetailRow({ isWithdrawn: true }),
      }),
    });
    const takingPart = renderChoreographyDetail();

    // A disabled upload hides the actions on the stored file, so the choreography
    // that is taking part is the one offering them.
    expect(takingPart).toContain("Borrar música");
    expect(withdrawn).not.toContain("Borrar música");
    expect(withdrawn).toContain("Archivo de música");
  });

  // The alert asks the academy to load what is missing, and a withdrawn
  // choreography accepts nothing: only an administrator brings it back.
  test("hides the pending-items alert while the choreography is withdrawn", () => {
    const markup = renderChoreographyDetail({
      loaderData: choreographyDetailLoaderData({
        choreography: choreographyDetailRow({
          isWithdrawn: true,
          operationalStatus: {
            code: "incomplete",
            pendingItems: ["experienceLevel", "professors"],
          },
        }),
      }),
    });

    expect(markup).not.toContain("Faltan cargar");
    expect(markup).not.toContain("Falta cargar");
  });

  test("does not expose academy deletion from the portal detail", () => {
    const markup = renderChoreographyDetail({
      loaderData: choreographyDetailLoaderData({
        eventContext: portalEventContext({ isRegistrationOpen: false }),
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
): ChoreographyDetailViewProps["loaderData"] {
  const choreography = overrides.choreography ?? choreographyDetailRow();

  return {
    eventContext: portalEventContext(),
    choreography,
    ...overrides,
  };
}

function choreographyDetailRow(
  overrides: Partial<
    ChoreographyDetailViewProps["loaderData"]["choreography"]
  > = {},
): ChoreographyDetailViewProps["loaderData"]["choreography"] {
  return {
    id: "choreo_1",
    choreographyNumber: 1,
    name: "Coreografía",
    modalityName: "Jazz",
    submodalityName: null,
    groupType: "solo",
    categoryId: "category_1",
    categoryName: "Juvenil",
    experienceLevelId: "level_1",
    requiresExperienceLevel: true,
    experienceLevelName: "Inicial",
    operationalStatus: {
      code: "complete",
      pendingItems: [],
    },
    musicStorageKey: "music/choreo_1.mp3",
    musicDownloadUrl: null,
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
    isEvaluated: false,
    isWithdrawn: false,
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
    startsAt: new Date("2026-05-01T12:00:00Z"),
    endsAt: new Date("2026-05-03T12:00:00Z"),
    ...overrides,
  };
}
