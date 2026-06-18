/** @vitest-environment jsdom */

import "@/test/react-test-env";

import { act } from "react";
import { createRoot } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeAll, describe, expect, test } from "vitest";

type PortalCoreografiasRouteViewComponent =
  typeof import("@/routes/portal.coreografias").PortalCoreografiasRouteView;
type PortalCoreografiasRouteViewProps =
  Parameters<PortalCoreografiasRouteViewComponent>[0];

describe("coreografía creation dialog render", () => {
  let container: HTMLDivElement | null = null;
  let root: ReturnType<typeof createRoot> | null = null;
  let PortalCoreografiasRouteView: PortalCoreografiasRouteViewComponent;

  beforeAll(async () => {
    ({ PortalCoreografiasRouteView } =
      await import("@/routes/portal.coreografias"));
  }, 20_000);

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
      root = null;
    }

    if (container) {
      container.remove();
      container = null;
    }

    document.body.innerHTML = "";
  });

  test("renders the shadcn dialog shell and RHF field primitives when opened", async () => {
    const router = createMemoryRouter(
      [
        {
          path: "/portal/coreografias",
          action: async () => null,
          element: (
            <PortalCoreografiasRouteView
              initialCreateDialogOpen
              loaderData={buildLoaderData()}
            />
          ),
        },
      ],
      { initialEntries: ["/portal/coreografias"] },
    );

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<RouterProvider router={router} />);
    });

    const markup = document.body.innerHTML;

    expect(markup).toContain("Nueva coreografía");
    expect(markup).toContain(
      "Completá los siguientes pasos para registrarla en el evento.",
    );
    expect(markup).toContain('data-slot="dialog-content"');
    expect(markup).toContain('data-slot="field"');
    expect(markup).toContain('data-slot="field-content"');
    expect(markup).toContain('data-slot="input"');
    expect(markup).toContain('data-slot="progress"');
    expect(markup).toContain("Paso 1 de 5");
    expect(markup).not.toContain("Nivel y cupo de cronograma");
    expect(markup).not.toContain("El nombre se normaliza al confirmar.");
  });
});

function buildLoaderData(): PortalCoreografiasRouteViewProps["loaderData"] {
  const eventSummary = buildEventSummary();

  return {
    choreographies: [],
    activeDancers: [
      {
        id: "dancer_1",
        firstName: "Bailarina",
        lastName: "Prueba",
        active: true,
        birthDate: "2015-01-01",
        documentType: null,
        documentNumber: null,
        verificationStatus: "incomplete" as const,
        participationStatus: "not-participating" as const,
      },
    ],
    activeProfessors: [
      {
        id: "profesor_1",
        firstName: "Ana",
        lastName: "Zapata",
        active: true,
        documentType: null,
        documentNumber: null,
        isIncomplete: true,
        participationStatus: "not-participating" as const,
      },
    ],
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
    eventContext: {
      events: [eventSummary],
      selectedEvent: eventSummary,
      activeEvent: eventSummary,
      hasActiveEvent: true,
      activeEventRegistrationReadiness: {
        eventId: "event_1",
        isReady: true,
        missingItems: [],
      },
      hasEvents: true,
      isReadOnly: false,
      isRegistrationOpen: true,
    },
  };
}

function buildEventSummary() {
  return {
    id: "event_1",
    name: "Regional 2026",
    active: true,
    registrationStartsAt: new Date("2026-01-01T12:00:00Z"),
    registrationEndsAt: new Date("2026-12-31T12:00:00Z"),
    startsAt: new Date("2026-05-01T12:00:00Z"),
    endsAt: new Date("2026-05-03T12:00:00Z"),
  };
}
