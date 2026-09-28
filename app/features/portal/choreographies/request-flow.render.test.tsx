/** @vitest-environment jsdom */

import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  createReactDomTestRenderer,
  getButton,
} from "@/lib/test-support/react-dom";

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

const renderer = createReactDomTestRenderer();

describe("choreographies request flow", () => {
  afterEach(() => {
    renderer.cleanup();
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

    await renderer.renderAsync(<RouterProvider router={router} />);

    expect(getButton("Guardar").disabled).toBe(true);
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

    await renderer.renderAsync(<RouterProvider router={router} />);

    expect(getButton("Guardar").disabled).toBe(true);
  });
});

function buildDetailLoaderData() {
  const eventSummary = {
    id: "event_1",
    name: "Regional 2026",
    active: true,
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
      operationalStatus: {
        code: "complete",
        pendingItems: [],
      },
      isEvaluated: false,
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
