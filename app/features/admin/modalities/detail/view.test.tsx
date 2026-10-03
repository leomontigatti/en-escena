/** @vitest-environment jsdom */

import type { ComponentProps } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test, vi } from "vitest";

import { EventModalityDetailView } from "@/features/admin/modalities/detail/view";
import type { EventModalitiesLoaderData } from "@/features/admin/modalities/shared";
import {
  createReactDomTestRenderer,
  getButton,
} from "@/lib/test-support/react-dom";

const useNavigationMock = vi.hoisted(() => vi.fn());

vi.mock("react-router", async () => {
  const actual =
    await vi.importActual<typeof import("react-router")>("react-router");

  return {
    ...actual,
    useNavigation: useNavigationMock,
  };
});

describe("EventModalityDetailView delete", () => {
  afterEach(() => {
    renderer.cleanup();
    useNavigationMock.mockReset();
  });

  test("confirms the delete through the shared alert dialog", async () => {
    useNavigationMock.mockReturnValue({ state: "idle" });

    await renderDetail({ initialDeleteDialogOpen: true });

    expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();
    expect(document.body.textContent).toContain("¿Eliminar la modalidad?");
    expect(getButton("Eliminar").disabled).toBe(false);
  });

  test("disables the destructive action while its delete submission is pending", async () => {
    const formData = new FormData();
    formData.set("intent", "delete-modality");
    formData.set("id", "modality_1");
    useNavigationMock.mockReturnValue({
      formData,
      formMethod: "post",
      state: "submitting",
    });

    await renderDetail({ initialDeleteDialogOpen: true });

    expect(getButton("Eliminar").disabled).toBe(true);
  });
});

describe("EventModalityDetailView criteria status", () => {
  afterEach(() => {
    renderer.cleanup();
    useNavigationMock.mockReset();
  });

  test("warns about the submodalities whose sheets are short of 100", async () => {
    useNavigationMock.mockReturnValue({ state: "idle" });

    await renderDetail({
      loaderData: buildLoaderData({
        submodalities: [
          buildSubmodality("solo", "Solo"),
          buildSubmodality("duo", "Dúo"),
          buildSubmodality("grupal", "Grupal"),
        ],
        submodalityCriteria: [
          buildCriterion("solo", 60),
          buildCriterion("duo", 100),
          buildCriterion("grupal", 30),
        ],
        modalitySheets: {
          modality_1: { generalStandsAlone: true, levels: [] },
        },
      }),
    });

    const alert = document.querySelector('[role="alert"]');

    expect(alert?.textContent).toContain("Planillas incompletas");
    expect(alert?.textContent).toContain(
      "Los criterios de Solo y Grupal no suman 100",
    );
  });
});

const renderer = createReactDomTestRenderer();

async function renderDetail(
  props: Partial<ComponentProps<typeof EventModalityDetailView>> = {},
) {
  const router = createMemoryRouter(
    [
      {
        path: "/administracion/modalidades/modality_1",
        action: async () => null,
        element: (
          <EventModalityDetailView
            loaderData={buildLoaderData()}
            modalityId="modality_1"
            {...props}
          />
        ),
      },
    ],
    { initialEntries: ["/administracion/modalidades/modality_1"] },
  );

  await renderer.renderAsync(<RouterProvider router={router} />);
}

function buildLoaderData(
  overrides: Partial<EventModalitiesLoaderData> = {},
): EventModalitiesLoaderData {
  return {
    selectedEventId: "event_1",
    modalities: [
      {
        id: "modality_1",
        eventId: "event_1",
        name: "Clásico",
        createdAt: new Date("2026-01-01T00:00:00Z"),
      },
    ],
    submodalities: [],
    submodalityCriteria: [],
    lockedSubmodalityIds: [],
    modalitySheets: {},
    ...overrides,
  };
}

function buildSubmodality(id: string, name: string) {
  return {
    id,
    eventId: "event_1",
    modalityId: "modality_1",
    name,
    createdAt: new Date("2026-01-01T00:00:00Z"),
  };
}

function buildCriterion(submodalityId: string, maximum: number) {
  return {
    eventId: "event_1",
    experienceLevel: null,
    id: `criterion-${submodalityId}`,
    kind: "adds" as const,
    maximum,
    name: "Técnica",
    position: 0,
    submodalityId,
  };
}
