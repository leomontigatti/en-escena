/** @vitest-environment jsdom */

import "@/test/react-test-env";

import { act } from "react";
import { createRoot } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test, vi } from "vitest";

const useActionDataMock = vi.hoisted(() => vi.fn());
const useFetcherMock = vi.hoisted(() => vi.fn());
const useNavigationMock = vi.hoisted(() => vi.fn());
const useSubmitMock = vi.hoisted(() => vi.fn());

vi.mock("react-router", async () => {
  const actual =
    await vi.importActual<typeof import("react-router")>("react-router");

  return {
    ...actual,
    useActionData: useActionDataMock,
    useFetcher: useFetcherMock,
    useNavigation: useNavigationMock,
    useSubmit: useSubmitMock,
  };
});

import { PortalChoreographyDetailRouteView } from "@/features/portal/choreographies/detail/view";
import { PortalChoreographiesListRouteView } from "@/features/portal/choreographies/list/view";

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

describe("coreografías request flow", () => {
  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
      root = null;
    }

    container?.remove();
    container = null;
    document.body.innerHTML = "";
    useActionDataMock.mockReset();
    useFetcherMock.mockReset();
    useNavigationMock.mockReset();
    useSubmitMock.mockReset();
  });

  test("shows calculation-specific pending feedback while dancer changes are resolving", async () => {
    useActionDataMock.mockReturnValue(undefined);
    useFetcherMock.mockReturnValue({
      data: undefined,
      state: "submitting",
      submit: vi.fn(),
    });
    useNavigationMock.mockReturnValue({ formData: undefined, state: "idle" });
    useSubmitMock.mockReturnValue(vi.fn());

    const router = createMemoryRouter(
      [
        {
          path: "/portal/coreografias/choreo_1",
          action: async () => null,
          element: (
            <PortalChoreographyDetailRouteView
              loaderData={buildDetailLoaderData()}
            />
          ),
        },
      ],
      { initialEntries: ["/portal/coreografias/choreo_1"] },
    );

    await render(<RouterProvider router={router} />);

    expect(getButton("Guardar coreografía").disabled).toBe(true);
  });

  test("shows save-specific pending feedback while the detail form is saving", async () => {
    const formData = new FormData();
    formData.set("intent", "update-choreography");

    useActionDataMock.mockReturnValue(undefined);
    useFetcherMock.mockReturnValue({
      data: undefined,
      state: "idle",
      submit: vi.fn(),
    });
    useNavigationMock.mockReturnValue({
      formData,
      formMethod: "post",
      state: "submitting",
    });
    useSubmitMock.mockReturnValue(vi.fn());

    const router = createMemoryRouter(
      [
        {
          path: "/portal/coreografias/choreo_1",
          action: async () => null,
          element: (
            <PortalChoreographyDetailRouteView
              loaderData={buildDetailLoaderData()}
            />
          ),
        },
      ],
      { initialEntries: ["/portal/coreografias/choreo_1"] },
    );

    await render(<RouterProvider router={router} />);

    expect(getButton("Guardar coreografía").disabled).toBe(true);
  });

  test("keeps the create modal open with recoverable save errors", async () => {
    useActionDataMock.mockReturnValue(undefined);
    useFetcherMock.mockReturnValueOnce({
      data: buildCreateOptionsData(),
      state: "idle",
      load: vi.fn(),
    });
    useFetcherMock.mockReturnValueOnce({
      data: undefined,
      state: "idle",
      submit: vi.fn(),
    });
    useFetcherMock.mockReturnValue({
      data: {
        intent: "create-choreography",
        result: {
          ok: false,
          code: "schedule-capacity-full",
          error:
            "El Cupo de cronograma seleccionado ya no tiene cupo disponible.",
        },
      },
      state: "idle",
      submit: vi.fn(),
    });
    useNavigationMock.mockReturnValue({
      formData: undefined,
      state: "idle",
    });
    useSubmitMock.mockReturnValue(vi.fn());

    const router = createMemoryRouter(
      [
        {
          path: "/portal/coreografias",
          action: async () => null,
          element: (
            <PortalChoreographiesListRouteView
              initialCreateDialogOpen
              loaderData={buildListLoaderData()}
            />
          ),
        },
      ],
      { initialEntries: ["/portal/coreografias"] },
    );

    await render(<RouterProvider router={router} />);

    expect(document.body.textContent).toContain("Nueva coreografía");
    expect(document.body.textContent).toContain(
      "El Cupo de cronograma seleccionado ya no tiene cupo disponible.",
    );
  });
});

async function render(element: React.ReactNode) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);

  await act(async () => {
    root?.render(element);
  });
}

function getButton(label: string) {
  const button = Array.from(document.querySelectorAll("button")).find(
    (candidate) => candidate.textContent?.includes(label),
  );

  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Expected button "${label}" to be rendered.`);
  }

  return button;
}

function buildDetailLoaderData() {
  const eventSummary = {
    id: "event_1",
    name: "Regional 2026",
    active: true,
    registrationStartsAt: new Date("2026-01-01T12:00:00Z"),
    registrationEndsAt: new Date("2026-12-31T12:00:00Z"),
    startsAt: new Date("2026-05-01T12:00:00Z"),
    endsAt: new Date("2026-05-03T12:00:00Z"),
  };

  return {
    choreography: {
      id: "choreo_1",
      name: "Danza lunar",
      modalityName: "Jazz",
      submodalityName: "Lyrical",
      categoryId: "category_1",
      categoryName: "Juvenil",
      categoryCalculationMode: "oldest",
      categoryAgeBasis: 12,
      groupType: "solo",
      experienceLevelId: "level_1",
      experienceLevelName: "Inicial",
      scheduleId: "schedule_1",
      scheduleCapacityId: "schedule_capacity_1",
      scheduleLabel: "Bloque tarde · 01/05/2026 · 14:00",
      dancers: [
        {
          id: "dancer_1",
          firstName: "Ana",
          lastName: "Paz",
          active: true,
          ageAtEventStart: 12,
        },
      ],
      professors: [
        {
          id: "professor_1",
          firstName: "Luz",
          lastName: "Suárez",
          active: true,
        },
      ],
      dancerEditingEligibility: {
        canEdit: true,
        reasonCode: null,
        reasonText: null,
      },
      operationalStatus: {
        code: "complete",
        pendingItems: [],
      },
      hasPresentation: false,
    },
    dancerEditingEligibility: {
      canEdit: true,
      reasonCode: null,
      reasonText: null,
    },
    availableDancers: [
      {
        id: "dancer_1",
        firstName: "Ana",
        lastName: "Paz",
        active: true,
      },
    ],
    availableProfessors: [
      {
        id: "professor_1",
        firstName: "Luz",
        lastName: "Suárez",
        active: true,
      },
    ],
    deletionAvailability: {
      canDelete: true,
      warningMessage: null,
    },
    eventContext: {
      selectedEvent: eventSummary,
      activeEvent: eventSummary,
      hasActiveEvent: true,
      hasEvents: true,
      isReadOnly: false,
      isRegistrationOpen: true,
    },
    successMessage: null,
  } as unknown as Parameters<
    typeof PortalChoreographyDetailRouteView
  >[0]["loaderData"];
}

function buildListLoaderData() {
  const eventSummary = {
    id: "event_1",
    name: "Regional 2026",
    active: true,
    registrationStartsAt: new Date("2026-01-01T12:00:00Z"),
    registrationEndsAt: new Date("2026-12-31T12:00:00Z"),
    startsAt: new Date("2026-05-01T12:00:00Z"),
    endsAt: new Date("2026-05-03T12:00:00Z"),
  };

  return {
    choreographies: [],
    activeDancerCount: 1,
    eventContext: {
      selectedEvent: eventSummary,
      activeEvent: eventSummary,
      hasActiveEvent: true,
      activeEventRegistrationReadiness: {
        eventId: eventSummary.id,
        isReady: true,
        missingItems: [],
      },
      hasEvents: true,
      isReadOnly: false,
      isRegistrationOpen: true,
    },
  } as unknown as Parameters<
    typeof PortalChoreographiesListRouteView
  >[0]["loaderData"];
}

function buildCreateOptionsData() {
  return {
    eventId: "event_1",
    activeDancers: [
      {
        id: "dancer_1",
        firstName: "Ana",
        lastName: "Paz",
        active: true,
        birthDate: "2014-01-01",
        documentType: null,
        documentNumber: null,
        verificationStatus: "incomplete" as const,
        participationStatus: "not-participating" as const,
      },
    ],
    activeProfessors: [
      {
        id: "professor_1",
        firstName: "Luz",
        lastName: "Suárez",
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
          modalityId: "modality_1",
          name: "Lyrical",
        },
      ],
    },
  };
}
