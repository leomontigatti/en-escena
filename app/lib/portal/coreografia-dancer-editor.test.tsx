/** @vitest-environment jsdom */

import "@/test/react-test-env";

import { act } from "react";
import { createRoot } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeAll, describe, expect, test } from "vitest";

type PortalCoreografiaDetalleRouteViewComponent =
  typeof import("@/routes/portal.coreografias_.$choreographyId").PortalCoreografiaDetalleRouteView;
type PortalCoreografiaDetalleRouteViewProps =
  Parameters<PortalCoreografiaDetalleRouteViewComponent>[0];

describe("coreografía detail readonly form", () => {
  let container: HTMLDivElement | null = null;
  let root: ReturnType<typeof createRoot> | null = null;
  let PortalCoreografiaDetalleRouteView: PortalCoreografiaDetalleRouteViewComponent;

  beforeAll(async () => {
    ({ PortalCoreografiaDetalleRouteView } =
      await import("@/routes/portal.coreografias_.$choreographyId"));
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

  test("renders choreography data as disabled form fields", async () => {
    await renderRoute();

    expect(getInputByLabel("Nombre").value).toBe("Mi Pieza");
    expect(getInputByLabel("Modalidad").value).toBe("Jazz");
    expect(getInputByLabel("Submodalidad").value).toBe("Lyrical");
    expect(getInputByLabel("Categoría").value).toBe("Juvenil");
    expect(getInputByLabel("Tipo de grupo").value).toBe("Solo");
    expect(getInputByLabel("Nivel de experiencia").value).toBe("Inicial");
    expect(getInputByLabel("Cupo de cronograma").value).toBe(
      "2026-05-01 · 10:00",
    );

    expect(getInputByLabel("Nombre").disabled).toBe(true);
    expect(getInputByLabel("Modalidad").disabled).toBe(true);
    expect(getInputByLabel("Submodalidad").disabled).toBe(true);
    expect(getInputByLabel("Categoría").disabled).toBe(true);
    expect(getInputByLabel("Tipo de grupo").disabled).toBe(true);
    expect(getInputByLabel("Nivel de experiencia").disabled).toBe(true);
    expect(getInputByLabel("Cupo de cronograma").disabled).toBe(true);
  });

  test("renders people comboboxes without separate dancer/professor cards", async () => {
    await renderRoute();

    const text = document.body.textContent ?? "";

    expect(text).not.toContain("Evento activo");
    expect(text).toContain("Bailarines");
    expect(text).toContain("Ana Paz");
    expect(text).not.toContain("Guardar bailarines");
    expect(text).toContain("Profesores");
    expect(text).not.toContain("Guardar Profesores");
  });

  test("shows academy-actionable operational pending items above the card", async () => {
    await renderRoute(
      buildLoaderData({
        choreography: {
          ...buildLoaderData().choreography,
          categoryName: null,
          operationalStatus: {
            code: "incomplete",
            pendingItems: ["music", "category", "professors"],
          },
        },
      }),
    );

    const text = document.body.textContent ?? "";

    expect(text).toContain("Faltan cargar archivo de música y profesores.");
    expect(text).not.toContain("Faltan cargar categoría");
    expect(getInputByLabel("Categoría").value).toBe("Sin asignar");
  });

  test("does not show an operational alert when only category is pending", async () => {
    await renderRoute(
      buildLoaderData({
        choreography: {
          ...buildLoaderData().choreography,
          categoryName: null,
          operationalStatus: {
            code: "incomplete",
            pendingItems: ["category"],
          },
        },
      }),
    );

    expect(document.body.textContent).not.toContain("Falta cargar");
    expect(getInputByLabel("Categoría").value).toBe("Sin asignar");
  });

  async function renderRoute(
    loaderData: PortalCoreografiaDetalleRouteViewProps["loaderData"] = buildLoaderData(),
  ) {
    const router = createMemoryRouter(
      [
        {
          path: "/portal/coreografias/choreo_1",
          action: async () => null,
          element: (
            <PortalCoreografiaDetalleRouteView loaderData={loaderData} />
          ),
        },
      ],
      { initialEntries: ["/portal/coreografias/choreo_1"] },
    );

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<RouterProvider router={router} />);
    });
  }

  function getInputByLabel(label: string) {
    const labelElement = Array.from(document.querySelectorAll("label")).find(
      (element) => element.textContent === label,
    );

    if (!labelElement) {
      throw new Error(`Expected ${label} label to be rendered.`);
    }

    const input = document.getElementById(
      labelElement.getAttribute("for") ?? "",
    );

    if (!(input instanceof HTMLInputElement)) {
      throw new Error(`Expected ${label} input to be rendered.`);
    }

    return input;
  }
});

function buildLoaderData(
  overrides: Partial<PortalCoreografiaDetalleRouteViewProps["loaderData"]> = {},
): PortalCoreografiaDetalleRouteViewProps["loaderData"] {
  const eventSummary = buildEventSummary();

  return {
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
        lastName: "Rios",
        active: true,
      },
    ],
    availableProfessors: [
      {
        id: "professor_1",
        firstName: "Paula",
        lastName: "Docente",
        active: true,
      },
    ],
    choreography: {
      id: "choreo_1",
      name: "Mi Pieza",
      modalityName: "Jazz",
      submodalityName: "Lyrical",
      groupType: "solo",
      categoryId: "category_1",
      categoryName: "Juvenil",
      experienceLevelId: "level_1",
      experienceLevelName: "Inicial",
      operationalStatus: {
        code: "complete",
        pendingItems: [],
      },
      dancerEditingEligibility: {
        canEdit: true,
        reasonCode: null,
        reasonText: null,
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
    },
    dancerEditingEligibility: {
      canEdit: true,
      reasonCode: null,
      reasonText: null,
    },
    deletionAvailability: {
      canDelete: false,
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
    ...overrides,
  };
}

function buildEventSummary() {
  return {
    id: "event_1",
    name: "Regional 2026",
    active: true,
    registrationStartsAt: new Date("2026-06-01T12:00:00Z"),
    registrationEndsAt: new Date("2026-06-30T12:00:00Z"),
    startsAt: new Date("2026-07-01T12:00:00Z"),
    endsAt: new Date("2026-07-03T12:00:00Z"),
  };
}
